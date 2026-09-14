import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { adminClient, anonClient, ensureUser, signedInClient } from '../helpers/db'
import { toISODate } from '@/lib/domain/dates'

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

const { setPaymentStatus } = await import('@/app/(app)/renewals/actions')

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
