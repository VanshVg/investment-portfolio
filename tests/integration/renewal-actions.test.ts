import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminClient, anonClient, ensureUser, signedInClient } from '../helpers/db'
import { toISODate } from '@/lib/domain/dates'

/**
 * Wraps a real, signed-in client so the *second* call to `.from('due_instances')`
 * within one `markRenewed` invocation reports a write failure, while every
 * other call reaches the real database untouched. `markRenewed` touches
 * `due_instances` exactly twice on the happy path -- the initial read, then
 * the tick -- so the second call is always the tick, never the read. Used to
 * simulate the tick failing right after the advance has already succeeded,
 * the partial-failure path Finding 1 exists to guard.
 */
function failSecondDueInstancesWrite(real: SupabaseClient): SupabaseClient {
  let dueInstancesCalls = 0
  const wrapped = Object.create(real) as SupabaseClient
  wrapped.from = ((table: string) => {
    if (table === 'due_instances') {
      dueInstancesCalls += 1
      if (dueInstancesCalls === 2) {
        return {
          update: () => ({
            eq: () => ({
              select: () =>
                Promise.resolve({
                  data: null,
                  error: { code: '55000', message: 'simulated tick failure' },
                }),
            }),
          }),
        }
      }
    }
    return real.from(table)
  }) as unknown as SupabaseClient['from']
  return wrapped
}

const EMAIL = 'renewal-actions@example.test'
const PASSWORD = 'test-password-123'

const { revalidatePath, mockCreateServerSupabase } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  mockCreateServerSupabase: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [],
    set: () => {},
  }),
}))

vi.mock('next/cache', () => ({
  revalidatePath,
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: mockCreateServerSupabase,
}))

mockCreateServerSupabase.mockImplementation(() => signedInClient(EMAIL, PASSWORD))

const { setPaymentStatus, markRenewed } = await import('@/app/(app)/renewals/actions')

const admin = adminClient()
const fixtureFamilyIds: string[] = []
const todayISO = toISODate(new Date())
let instanceId: string

async function statusFor(id: string): Promise<string> {
  const { data, error } = await admin
    .from('due_instances')
    .select('payment_status')
    .eq('id', id)
    .single()
  if (error) throw new Error(`fixture read failed: ${error.message}`)
  return data!.payment_status as string
}

async function paidOnFor(id: string): Promise<string | null> {
  const { data, error } = await admin.from('due_instances').select('paid_on').eq('id', id).single()
  if (error) throw new Error(`fixture read failed: ${error.message}`)
  return data!.paid_on as string | null
}

async function nextDueFor(holdingId: string): Promise<string | null> {
  const { data, error } = await admin
    .from('holdings')
    .select('next_due_date')
    .eq('id', holdingId)
    .single()
  if (error) throw new Error(`fixture read failed: ${error.message}`)
  return data!.next_due_date as string | null
}

async function anchorFor(holdingId: string): Promise<string | null> {
  const { data, error } = await admin
    .from('holdings')
    .select('anchor_due_date')
    .eq('id', holdingId)
    .single()
  if (error) throw new Error(`fixture read failed: ${error.message}`)
  return data!.anchor_due_date as string | null
}

async function datesFor(holdingId: string): Promise<string[]> {
  const { data, error } = await admin
    .from('due_instances')
    .select('due_date')
    .eq('holding_id', holdingId)
  if (error) throw new Error(`fixture read failed: ${error.message}`)
  return (data ?? []).map((row) => row.due_date as string)
}

describe('setPaymentStatus', () => {
  beforeAll(async () => {
    const user = await ensureUser(EMAIL, PASSWORD, 'admin')

    const { data: family, error: familyError } = await admin
      .from('families')
      .insert({ name: 'Renewal actions fixture', owner_advisor_id: user!.id })
      .select('id')
      .single()
    if (familyError) throw new Error(`fixture family insert failed: ${familyError.message}`)
    fixtureFamilyIds.push(family!.id)

    const { data: holding, error: holdingError } = await admin
      .from('holdings')
      .insert({
        family_id: family!.id,
        category: 'life_insurance',
        label: 'Payment tick fixture policy',
      })
      .select('id')
      .single()
    if (holdingError) throw new Error(`fixture holding insert failed: ${holdingError.message}`)

    const { data: instance, error: instanceError } = await admin
      .from('due_instances')
      .insert({ holding_id: holding!.id, due_date: '2029-06-01' })
      .select('id')
      .single()
    if (instanceError) throw new Error(`fixture due instance insert failed: ${instanceError.message}`)
    instanceId = instance!.id as string
  })

  // Cascades away the fixture family (holding and due instance go with it).
  // Guarded so a setup failure can't throw here and mask the real failure,
  // and an empty or partial delete throws rather than passing silently.
  afterAll(async () => {
    if (fixtureFamilyIds.length === 0) return
    const { data, error } = await admin
      .from('families')
      .delete()
      .in('id', fixtureFamilyIds)
      .select('id')
    if (error) throw new Error(`fixture cleanup failed: ${error.message}`)
    if (!data || data.length !== fixtureFamilyIds.length) {
      throw new Error(
        `fixture cleanup deleted ${data?.length ?? 0} of ${fixtureFamilyIds.length} families`,
      )
    }
  })

  it('records a payment and stamps the date', async () => {
    const result = await setPaymentStatus(instanceId, 'paid')
    expect(result.ok).toBe(true)
    expect(await statusFor(instanceId)).toBe('paid')
    expect(await paidOnFor(instanceId)).toBe(todayISO)
  })

  it('clears the paid date when the status moves off paid', async () => {
    await setPaymentStatus(instanceId, 'paid')
    await setPaymentStatus(instanceId, 'unpaid')
    expect(await paidOnFor(instanceId)).toBeNull()
  })

  // A schema-rejected value must never reach the database at all — this
  // pins that nothing changed, not merely that the result reported failure.
  it('rejects a status the enum does not contain, and writes nothing', async () => {
    await setPaymentStatus(instanceId, 'unpaid')
    const before = await statusFor(instanceId)

    const result = await setPaymentStatus(instanceId, 'settled' as never)
    expect(result.ok).toBe(false)

    expect(await statusFor(instanceId)).toBe(before)
  })

  // The one that matters: Postgres applies RLS's USING clause to UPDATE as a
  // row filter, not an error, so an update matching zero rows comes back as
  // `{ error: null, data: [] }` regardless of why it matched nothing. A
  // non-existent id exercises exactly that path.
  it('reports failure when the row does not exist', async () => {
    const result = await setPaymentStatus(randomUUID(), 'paid')
    expect(result.ok).toBe(false)
  })

  // The same empty-write path, reached for the reason it exists to guard
  // against: RLS blocking a real, existing row rather than the row being
  // absent. Without `.select('id')` this would report success while the
  // row sat untouched.
  it('reports failure, not success, when an anonymous client attempts the write, and the row survives untouched', async () => {
    await setPaymentStatus(instanceId, 'unknown')

    mockCreateServerSupabase.mockImplementationOnce(async () => anonClient())
    const result = await setPaymentStatus(instanceId, 'paid')
    expect(result.ok).toBe(false)

    expect(await statusFor(instanceId)).toBe('unknown')
    expect(await paidOnFor(instanceId)).toBeNull()
  })

  it('revalidates the renewals listing after a successful write', async () => {
    revalidatePath.mockClear()
    const result = await setPaymentStatus(instanceId, 'paid')
    expect(result.ok).toBe(true)
    expect(revalidatePath).toHaveBeenCalledWith('/renewals')
  })
})

describe('markRenewed', () => {
  const markRenewedFamilyIds: string[] = []
  let holdingId: string
  let renewedInstanceId: string
  let oneTimeHoldingId: string
  let oneTimeInstanceId: string

  beforeAll(async () => {
    const user = await ensureUser(EMAIL, PASSWORD, 'admin')

    const { data: family, error: familyError } = await admin
      .from('families')
      .insert({ name: 'Mark renewed fixture', owner_advisor_id: user!.id })
      .select('id')
      .single()
    if (familyError) throw new Error(`fixture family insert failed: ${familyError.message}`)
    markRenewedFamilyIds.push(family!.id)

    // Anchored a year before its next occurrence, so advancing along the grid
    // (2027-10-01) and re-anchoring to the instance's own due date
    // (2026-10-01) land on genuinely different dates -- a test that could not
    // tell the two behaviours apart would prove nothing.
    const { data: holding, error: holdingError } = await admin
      .from('holdings')
      .insert({
        family_id: family!.id,
        category: 'life_insurance',
        label: 'Mark renewed fixture policy',
        due_frequency: 'annual',
        anchor_due_date: '2026-10-01',
        next_due_date: '2026-10-01',
      })
      .select('id')
      .single()
    if (holdingError) throw new Error(`fixture holding insert failed: ${holdingError.message}`)
    holdingId = holding!.id as string

    const { data: instance, error: instanceError } = await admin
      .from('due_instances')
      .insert({ holding_id: holdingId, due_date: '2026-10-01' })
      .select('id')
      .single()
    if (instanceError) throw new Error(`fixture due instance insert failed: ${instanceError.message}`)
    renewedInstanceId = instance!.id as string

    // A matured fixed deposit: one_time holdings have no next period, so this
    // exercises the refusal path rather than the happy path above.
    const { data: oneTimeHolding, error: oneTimeHoldingError } = await admin
      .from('holdings')
      .insert({
        family_id: family!.id,
        category: 'fixed_income',
        label: 'Mark renewed fixture FD',
        due_frequency: 'one_time',
        anchor_due_date: '2027-10-01',
        next_due_date: '2027-10-01',
      })
      .select('id')
      .single()
    if (oneTimeHoldingError) {
      throw new Error(`fixture one-time holding insert failed: ${oneTimeHoldingError.message}`)
    }
    oneTimeHoldingId = oneTimeHolding!.id as string

    const { data: oneTimeInstance, error: oneTimeInstanceError } = await admin
      .from('due_instances')
      .insert({ holding_id: oneTimeHoldingId, due_date: '2027-10-01' })
      .select('id')
      .single()
    if (oneTimeInstanceError) {
      throw new Error(`fixture one-time due instance insert failed: ${oneTimeInstanceError.message}`)
    }
    oneTimeInstanceId = oneTimeInstance!.id as string
  })

  afterAll(async () => {
    if (markRenewedFamilyIds.length === 0) return
    const { data, error } = await admin
      .from('families')
      .delete()
      .in('id', markRenewedFamilyIds)
      .select('id')
    if (error) throw new Error(`fixture cleanup failed: ${error.message}`)
    if (!data || data.length !== markRenewedFamilyIds.length) {
      throw new Error(
        `fixture cleanup deleted ${data?.length ?? 0} of ${markRenewedFamilyIds.length} families`,
      )
    }
  })

  it('ticks the instance paid and advances the holding', async () => {
    const result = await markRenewed(renewedInstanceId)
    expect(result.ok).toBe(true)
    expect(await statusFor(renewedInstanceId)).toBe('paid')
    expect(await nextDueFor(holdingId)).toBe('2027-10-01')
  })

  it('leaves the anchor alone, so future dates stay on the original grid', async () => {
    await markRenewed(renewedInstanceId)
    expect(await anchorFor(holdingId)).toBe('2026-10-01')
  })

  it('generates the following due instance immediately', async () => {
    await markRenewed(renewedInstanceId)
    expect(await datesFor(holdingId)).toContain('2027-10-01')
  })

  it('refuses a one_time holding, which has no next period', async () => {
    const result = await markRenewed(oneTimeInstanceId)
    expect(result.ok).toBe(false)
    expect(await nextDueFor(oneTimeHoldingId)).toBe('2027-10-01') // unchanged
  })
})

describe('markRenewed partial failure (advance succeeds, tick fails)', () => {
  const partialFailureFamilyIds: string[] = []
  let holdingId: string
  let instanceId: string

  beforeAll(async () => {
    const user = await ensureUser(EMAIL, PASSWORD, 'admin')

    const { data: family, error: familyError } = await admin
      .from('families')
      .insert({ name: 'Mark renewed partial failure fixture', owner_advisor_id: user!.id })
      .select('id')
      .single()
    if (familyError) throw new Error(`fixture family insert failed: ${familyError.message}`)
    partialFailureFamilyIds.push(family!.id)

    const { data: holding, error: holdingError } = await admin
      .from('holdings')
      .insert({
        family_id: family!.id,
        category: 'life_insurance',
        label: 'Mark renewed partial failure fixture policy',
        due_frequency: 'annual',
        anchor_due_date: '2026-11-01',
        next_due_date: '2026-11-01',
      })
      .select('id')
      .single()
    if (holdingError) throw new Error(`fixture holding insert failed: ${holdingError.message}`)
    holdingId = holding!.id as string

    const { data: instance, error: instanceError } = await admin
      .from('due_instances')
      .insert({ holding_id: holdingId, due_date: '2026-11-01' })
      .select('id')
      .single()
    if (instanceError) throw new Error(`fixture due instance insert failed: ${instanceError.message}`)
    instanceId = instance!.id as string
  })

  afterAll(async () => {
    if (partialFailureFamilyIds.length === 0) return
    const { data, error } = await admin
      .from('families')
      .delete()
      .in('id', partialFailureFamilyIds)
      .select('id')
    if (error) throw new Error(`fixture cleanup failed: ${error.message}`)
    if (!data || data.length !== partialFailureFamilyIds.length) {
      throw new Error(
        `fixture cleanup deleted ${data?.length ?? 0} of ${partialFailureFamilyIds.length} families`,
      )
    }
  })

  it('advances the holding but leaves the instance unmarked, and reports the explanatory failure, when the tick fails after the advance succeeds', async () => {
    mockCreateServerSupabase.mockImplementationOnce(async () =>
      failSecondDueInstancesWrite(await signedInClient(EMAIL, PASSWORD)),
    )

    const result = await markRenewed(instanceId)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.formError).toMatch(/renewed|due date/i)
      expect(result.formError).toMatch(/paid/i)
    }
    // The advance went through even though the overall action reports failure.
    expect(await nextDueFor(holdingId)).toBe('2027-11-01')
    // The tick never landed -- the instance must not read as paid.
    expect(await statusFor(instanceId)).not.toBe('paid')
  })

  it('succeeds on retry: the advance recomputes the same date and the tick completes', async () => {
    const result = await markRenewed(instanceId)

    expect(result.ok).toBe(true)
    expect(await statusFor(instanceId)).toBe('paid')
    // Unchanged from the failed attempt -- retrying re-derives the same next
    // date from the still-unmoved anchor and due_date, it doesn't drift.
    expect(await nextDueFor(holdingId)).toBe('2027-11-01')
  })
})
