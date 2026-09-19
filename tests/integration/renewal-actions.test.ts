import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminClient, anonClient, ensureUser, signedInClient } from '../helpers/db'
import { addDays, addYears } from 'date-fns'
import { formatDMY, fromISODate, toISODate, todayInIndia } from '@/lib/domain/dates'
import { listRenewals } from '@/lib/queries/renewals'
import { ensureDueInstances } from '@/lib/reminders/ensure-due-instances'
import { reconcileDueInstances } from '@/lib/reminders/reconcile'
import { horizonFrom } from '@/lib/reminders/horizon'
import { IST_DATE_AT_THAT_INSTANT, JUST_AFTER_IST_MIDNIGHT, onUtcHostAt } from '../helpers/clock'

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
const todayISO = todayInIndia()
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

  // paid_on is the advisor's record of the day the money came in, and his
  // day is the Indian one. On a UTC server a tick just after IST midnight
  // must not be stamped with the day before.
  it('stamps paid_on with the Indian date, not the host date, just after IST midnight', async () => {
    const result = await onUtcHostAt(JUST_AFTER_IST_MIDNIGHT, () =>
      setPaymentStatus(instanceId, 'paid'),
    )
    expect(result.ok).toBe(true)
    expect(await paidOnFor(instanceId)).toBe(IST_DATE_AT_THAT_INSTANT)
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
  let familyId: string
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
    familyId = family!.id as string

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

  /**
   * An annual policy whose current due date is `dueDate`, with the instance on
   * that date. Each renewal test gets its own: once renewed, an instance is no
   * longer the current due date and cannot be renewed again.
   */
  async function renewablePolicy(
    label: string,
    dueDate: string,
  ): Promise<{ policyId: string; policyInstanceId: string }> {
    const { data: holding, error: holdingError } = await admin
      .from('holdings')
      .insert({
        family_id: familyId,
        category: 'life_insurance',
        label,
        due_frequency: 'annual',
        anchor_due_date: dueDate,
        next_due_date: dueDate,
      })
      .select('id')
      .single()
    if (holdingError) throw new Error(`fixture holding insert failed: ${holdingError.message}`)
    const { data: instance, error: instanceError } = await admin
      .from('due_instances')
      .insert({ holding_id: holding!.id, due_date: dueDate })
      .select('id')
      .single()
    if (instanceError) throw new Error(`fixture due instance insert failed: ${instanceError.message}`)
    return { policyId: holding!.id as string, policyInstanceId: instance!.id as string }
  }

  it('ticks the instance paid and advances the holding', async () => {
    const result = await markRenewed(renewedInstanceId)
    expect(result.ok).toBe(true)
    expect(await statusFor(renewedInstanceId)).toBe('paid')
    expect(await nextDueFor(holdingId)).toBe('2027-10-01')
  })

  it('leaves the anchor alone, so future dates stay on the original grid', async () => {
    const { policyId, policyInstanceId } = await renewablePolicy('Anchor fixture', '2026-10-01')
    expect((await markRenewed(policyInstanceId)).ok).toBe(true)
    expect(await anchorFor(policyId)).toBe('2026-10-01')
  })

  it('generates the following due instance immediately', async () => {
    const { policyId, policyInstanceId } = await renewablePolicy('Generation fixture', '2026-10-01')
    expect((await markRenewed(policyInstanceId)).ok).toBe(true)
    expect(await datesFor(policyId)).toContain('2027-10-01')
  })

  it('stamps paid_on with the Indian date, not the host date, just after IST midnight', async () => {
    const { policyInstanceId } = await renewablePolicy('IST paid_on fixture', '2026-09-25')

    const result = await onUtcHostAt(JUST_AFTER_IST_MIDNIGHT, () => markRenewed(policyInstanceId))
    expect(result.ok).toBe(true)
    expect(await paidOnFor(policyInstanceId)).toBe(IST_DATE_AT_THAT_INSTANT)
  })

  it('refuses a one_time holding, which has no next period', async () => {
    const result = await markRenewed(oneTimeInstanceId)
    expect(result.ok).toBe(false)
    expect(await nextDueFor(oneTimeHoldingId)).toBe('2027-10-01') // unchanged
  })

  // The renewals listing revalidation alone leaves the family's own ledger
  // page rendering the pre-renewal due date until a hard reload -- that page
  // lives at /families/[familyId], not /families, and only a path targeting
  // this specific family actually refreshes it.
  it("revalidates the family's ledger page after a successful renewal", async () => {
    const { policyInstanceId } = await renewablePolicy('Revalidation fixture', '2026-10-01')
    revalidatePath.mockClear()
    const result = await markRenewed(policyInstanceId)
    expect(result.ok).toBe(true)
    expect(revalidatePath).toHaveBeenCalledWith(`/families/${familyId}`)
  })
})

describe('markRenewed partial failure (advance succeeds, tick fails)', () => {
  const partialFailureFamilyIds: string[] = []
  let familyId: string
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
    familyId = family!.id as string

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
    revalidatePath.mockClear()
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
    // The due date already moved, so the family's ledger page is stale on
    // this path too -- it must revalidate even though the action overall
    // reports failure.
    expect(revalidatePath).toHaveBeenCalledWith(`/families/${familyId}`)
  })

  // The advance already landed, so this instance is no longer the current due
  // date. A second click must not advance the holding again; the tick is
  // finished from the Paid column, which is what the message says to do.
  it('refuses a second renewal once the due date has moved, and the Paid column completes the tick', async () => {
    const retry = await markRenewed(instanceId)

    expect(retry.ok).toBe(false)
    if (!retry.ok) expect(retry.formError).toMatch(/Paid column/)
    expect(await nextDueFor(holdingId)).toBe('2027-11-01')

    expect((await setPaymentStatus(instanceId, 'paid')).ok).toBe(true)
    expect(await statusFor(instanceId)).toBe('paid')
    expect(await nextDueFor(holdingId)).toBe('2027-11-01')
  })
})

/**
 * Renewing before the due date is the normal case: the advisor hears the
 * premium is paid a week or two early. The paid instance is then still dated
 * today or later, but earlier than the holding's new next_due_date. It is a
 * real date on the holding's grid, so reconciliation must leave it exactly
 * as it is -- neither flagged off-schedule nor deleted.
 *
 * Every date is derived from today, because the behaviour depends on where
 * the instance sits relative to today.
 */
describe('renewing from the current due date', () => {
  const earlyRenewalFamilyIds: string[] = []
  let familyId: string
  const today = todayInIndia()
  const through = horizonFrom(today)
  const dueDate = toISODate(addDays(fromISODate(today)!, 10))

  async function instanceOn(holdingId: string, date: string) {
    const { data, error } = await admin
      .from('due_instances')
      .select('id, payment_status, off_schedule')
      .eq('holding_id', holdingId)
      .eq('due_date', date)
      .maybeSingle()
    if (error) throw new Error(`fixture read failed: ${error.message}`)
    return data
  }

  /** An annual policy due in ten days, with its schedule generated. */
  async function policyDueSoon(label: string): Promise<{ holdingId: string; instanceId: string }> {
    const { data: holding, error } = await admin
      .from('holdings')
      .insert({
        family_id: familyId,
        category: 'life_insurance',
        label,
        periodic_amount: 25_000,
        due_frequency: 'annual',
        anchor_due_date: dueDate,
        next_due_date: dueDate,
      })
      .select('id')
      .single()
    if (error) throw new Error(`fixture holding insert failed: ${error.message}`)
    await ensureDueInstances(admin, holding!.id, through)
    const instance = await instanceOn(holding!.id, dueDate)
    if (!instance) throw new Error('fixture due instance was not generated')
    return { holdingId: holding!.id as string, instanceId: instance.id as string }
  }

  beforeAll(async () => {
    const user = await ensureUser(EMAIL, PASSWORD, 'admin')
    const { data: family, error } = await admin
      .from('families')
      .insert({ name: 'Early renewal fixture', owner_advisor_id: user!.id })
      .select('id')
      .single()
    if (error) throw new Error(`fixture family insert failed: ${error.message}`)
    earlyRenewalFamilyIds.push(family!.id)
    familyId = family!.id as string
  })

  afterAll(async () => {
    if (earlyRenewalFamilyIds.length === 0) return
    const { data, error } = await admin
      .from('families')
      .delete()
      .in('id', earlyRenewalFamilyIds)
      .select('id')
    if (error) throw new Error(`fixture cleanup failed: ${error.message}`)
    if (!data || data.length !== earlyRenewalFamilyIds.length) {
      throw new Error(
        `fixture cleanup deleted ${data?.length ?? 0} of ${earlyRenewalFamilyIds.length} families`,
      )
    }
  })

  it('leaves the renewed instance on schedule, not flagged off-schedule', async () => {
    const { holdingId, instanceId } = await policyDueSoon('Early renewal, then reconcile')

    const renewed = await markRenewed(instanceId)
    expect(renewed.ok).toBe(true)

    const result = await reconcileDueInstances(admin, holdingId, through)

    const instance = await instanceOn(holdingId, dueDate)
    expect(instance?.payment_status).toBe('paid')
    expect(instance?.off_schedule).toBe(false)
    expect(result.preserved).toBe(0)
    expect(result.deleted).toBe(0)
  })

  // Instances renewed early before this was fixed were flagged, and nothing
  // cleared the flag. The next reconciliation must clear it.
  it('clears a stale off-schedule flag on a renewed instance back on the grid', async () => {
    const { holdingId, instanceId } = await policyDueSoon('Early renewal, stale flag')
    expect((await markRenewed(instanceId)).ok).toBe(true)

    const { data: flagged, error } = await admin
      .from('due_instances')
      .update({ off_schedule: true })
      .eq('id', instanceId)
      .select('id')
    if (error) throw new Error(`fixture update failed: ${error.message}`)
    expect(flagged).toHaveLength(1)

    await reconcileDueInstances(admin, holdingId, through)

    const instance = await instanceOn(holdingId, dueDate)
    expect(instance?.off_schedule).toBe(false)
    expect(instance?.payment_status).toBe('paid')
  })

  it('keeps the renewed instance when its tick is reset to Unknown afterwards', async () => {
    const { holdingId, instanceId } = await policyDueSoon('Early renewal, tick reset')

    expect((await markRenewed(instanceId)).ok).toBe(true)
    expect((await setPaymentStatus(instanceId, 'unknown')).ok).toBe(true)

    await reconcileDueInstances(admin, holdingId, through)

    const instance = await instanceOn(holdingId, dueDate)
    expect(instance?.id).toBe(instanceId)
    expect(instance?.off_schedule).toBe(false)
  })

  it('keeps the instance the advisor is told to tick by hand after a partial failure', async () => {
    const { holdingId, instanceId } = await policyDueSoon('Early renewal, tick failed')

    mockCreateServerSupabase.mockImplementationOnce(async () =>
      failSecondDueInstancesWrite(await signedInClient(EMAIL, PASSWORD)),
    )
    expect((await markRenewed(instanceId)).ok).toBe(false)

    await reconcileDueInstances(admin, holdingId, through)

    const instance = await instanceOn(holdingId, dueDate)
    expect(instance?.id).toBe(instanceId)
    expect(instance?.off_schedule).toBe(false)
    // The row survives, so the Paid column the message points to is still there.
    expect((await setPaymentStatus(instanceId, 'paid')).ok).toBe(true)
  })

  async function nextDueOf(holdingId: string): Promise<string | null> {
    const { data, error } = await admin
      .from('holdings')
      .select('next_due_date')
      .eq('id', holdingId)
      .single()
    if (error) throw new Error(`fixture read failed: ${error.message}`)
    return data!.next_due_date as string | null
  }

  // Renewing a later row would jump the holding past the instances in
  // between, which reconciliation would then treat as history.
  it('refuses to renew a row later than the current due date, and names the current one', async () => {
    const { holdingId } = await policyDueSoon('Renew a later row')
    const laterDate = toISODate(addYears(fromISODate(dueDate)!, 1))
    const later = await instanceOn(holdingId, laterDate)
    if (!later) throw new Error('fixture later instance was not generated')

    const result = await markRenewed(later.id as string)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.formError).toContain(formatDMY(dueDate))
    expect(await nextDueOf(holdingId)).toBe(dueDate)
    expect((await instanceOn(holdingId, laterDate))?.payment_status).toBe('unknown')
  })

  // A second click on a row already renewed would previously advance from
  // that row again; from an older row it moved next_due_date backwards.
  it('refuses to renew a row already renewed, and points to the Paid column', async () => {
    const { holdingId, instanceId } = await policyDueSoon('Renew the same row twice')
    const nextDate = toISODate(addYears(fromISODate(dueDate)!, 1))

    expect((await markRenewed(instanceId)).ok).toBe(true)
    expect(await nextDueOf(holdingId)).toBe(nextDate)

    const again = await markRenewed(instanceId)

    expect(again.ok).toBe(false)
    if (!again.ok) {
      expect(again.formError).toMatch(/Paid column/)
      expect(again.formError).toContain(formatDMY(nextDate))
    }
    expect(await nextDueOf(holdingId)).toBe(nextDate)
  })

  // A holding with no anchor has no schedule to advance along. The instance's
  // own date is not a substitute for one.
  it('refuses a holding with no anchor date', async () => {
    const { data: holding, error } = await admin
      .from('holdings')
      .insert({
        family_id: familyId,
        category: 'life_insurance',
        label: 'Unanchored policy',
        due_frequency: 'annual',
        anchor_due_date: null,
        next_due_date: dueDate,
      })
      .select('id')
      .single()
    if (error) throw new Error(`fixture holding insert failed: ${error.message}`)
    const { data: instance, error: instanceError } = await admin
      .from('due_instances')
      .insert({ holding_id: holding!.id, due_date: dueDate })
      .select('id')
      .single()
    if (instanceError) throw new Error(`fixture due instance insert failed: ${instanceError.message}`)

    const result = await markRenewed(instance!.id)

    expect(result.ok).toBe(false)
    expect(await nextDueOf(holding!.id)).toBe(dueDate)
    expect(await statusFor(instance!.id)).toBe('unknown')
  })

  // The listing is what decides which row offers the button, so it has to
  // carry the holding's current due date alongside each instance's own.
  it("lists each instance with its holding's current due date", async () => {
    const { holdingId, instanceId } = await policyDueSoon('Listing after renewal')
    expect((await markRenewed(instanceId)).ok).toBe(true)
    const nextDate = toISODate(addYears(fromISODate(dueDate)!, 1))

    const { rows } = await listRenewals(admin, { from: today, to: through, familyId })
    const mine = rows.filter((row) => row.holdingId === holdingId)

    expect(mine.map((row) => [row.dueDate, row.holdingNextDueDate])).toEqual([
      [dueDate, nextDate],
      [nextDate, nextDate],
    ])
  })
})
