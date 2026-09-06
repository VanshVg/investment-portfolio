import { beforeAll, describe, expect, it, vi } from 'vitest'
import { adminClient, anonClient, ensureUser, signedInClient } from '../helpers/db'
import { familyInput } from '@/lib/validation/families'

const EMAIL = 'family-actions@example.test'
const PASSWORD = 'test-password-123'
let advisorId: string

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

const { createFamily, updateFamily, deleteFamily } = await import('@/app/(app)/families/actions')

describe('family input and cascade behaviour', () => {
  beforeAll(async () => {
    const user = await ensureUser(EMAIL, PASSWORD, 'admin')
    advisorId = user!.id
  })

  it('normalises the head mobile and coerces numerics before the database sees them', () => {
    const parsed = familyInput.parse({
      name: 'Patel',
      headName: 'Rakesh',
      headMobile: '98765 43210',
      notes: '',
      goalHorizonYears: '10',
      assumedCagr: '12.5',
    })
    expect(parsed.headMobile).toBe('+919876543210')
    expect(parsed.goalHorizonYears).toBe(10)
    expect(parsed.assumedCagr).toBe(12.5)
    expect(parsed.notes).toBeNull()
  })

  it('rejects a horizon the database check would also reject', () => {
    expect(
      familyInput.safeParse({
        name: 'Patel',
        headName: '',
        headMobile: '',
        notes: '',
        goalHorizonYears: '99',
        assumedCagr: '12',
      }).success,
    ).toBe(false)
  })

  it('cascades members, holdings and due instances when a family is deleted', async () => {
    const admin = adminClient()
    const { data: family } = await admin
      .from('families')
      .insert({ name: 'Cascade Probe', owner_advisor_id: advisorId })
      .select()
      .single()

    await admin.from('family_members').insert({ family_id: family!.id, name: 'M', relation: 'other' })
    const { data: holding } = await admin
      .from('holdings')
      .insert({ family_id: family!.id, category: 'life_insurance', label: 'H' })
      .select()
      .single()
    await admin.from('due_instances').insert({ holding_id: holding!.id, due_date: '2027-01-01' })

    await admin.from('families').delete().eq('id', family!.id)

    const { data: members } = await admin
      .from('family_members')
      .select('id')
      .eq('family_id', family!.id)
    const { data: holdings } = await admin.from('holdings').select('id').eq('family_id', family!.id)
    const { data: instances } = await admin
      .from('due_instances')
      .select('id')
      .eq('holding_id', holding!.id)

    expect(members).toEqual([])
    expect(holdings).toEqual([])
    expect(instances).toEqual([])
  })
})

describe('createFamily / updateFamily / deleteFamily server actions', () => {
  beforeAll(async () => {
    const user = await ensureUser(EMAIL, PASSWORD, 'admin')
    advisorId = user!.id
  })

  it('creates a family with the mapped columns and owner, and revalidates the list', async () => {
    revalidatePath.mockClear()
    const input = {
      name: 'Shah — action create',
      headName: 'Bhavesh Shah',
      headMobile: '98765 11111',
      notes: 'Prefers evening calls',
      goalHorizonYears: '12',
      assumedCagr: '11.5',
    }

    const result = await createFamily(input)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok result')

    const admin = adminClient()
    const { data: row, error } = await admin
      .from('families')
      .select('*')
      .eq('id', result.id)
      .single()
    expect(error).toBeNull()
    expect(row?.name).toBe('Shah — action create')
    expect(row?.head_name).toBe('Bhavesh Shah')
    expect(row?.head_mobile).toBe('+919876511111')
    expect(row?.notes).toBe('Prefers evening calls')
    expect(row?.goal_horizon_years).toBe(12)
    expect(Number(row?.assumed_cagr)).toBe(11.5)
    expect(row?.owner_advisor_id).toBe(advisorId)

    expect(revalidatePath).toHaveBeenCalledWith('/families')

    await admin.from('families').delete().eq('id', result.id)
  })

  it('updates the intended fields without touching owner_advisor_id', async () => {
    const admin = adminClient()
    const { data: family } = await admin
      .from('families')
      .insert({ name: 'Shah — action update', owner_advisor_id: advisorId })
      .select()
      .single()

    revalidatePath.mockClear()
    const result = await updateFamily(family!.id, {
      name: 'Shah — action update (renamed)',
      headName: 'Renamed Head',
      headMobile: '',
      notes: '',
      goalHorizonYears: '20',
      assumedCagr: '9',
    })
    expect(result.ok).toBe(true)

    const { data: row } = await admin.from('families').select('*').eq('id', family!.id).single()
    expect(row?.name).toBe('Shah — action update (renamed)')
    expect(row?.head_name).toBe('Renamed Head')
    expect(row?.goal_horizon_years).toBe(20)
    expect(Number(row?.assumed_cagr)).toBe(9)
    expect(row?.owner_advisor_id).toBe(advisorId)

    expect(revalidatePath).toHaveBeenCalledWith('/families')
    expect(revalidatePath).toHaveBeenCalledWith(`/families/${family!.id}`)

    await admin.from('families').delete().eq('id', family!.id)
  })

  it('deletes the family and cascades to its dependents through the action', async () => {
    const admin = adminClient()
    const { data: family } = await admin
      .from('families')
      .insert({ name: 'Shah — action delete', owner_advisor_id: advisorId })
      .select()
      .single()
    await admin.from('family_members').insert({ family_id: family!.id, name: 'Dep', relation: 'other' })
    await admin
      .from('holdings')
      .insert({ family_id: family!.id, category: 'life_insurance', label: 'Dep holding' })

    revalidatePath.mockClear()
    const result = await deleteFamily(family!.id)
    expect(result.ok).toBe(true)

    const { data: row } = await admin.from('families').select('id').eq('id', family!.id).maybeSingle()
    expect(row).toBeNull()

    const { data: members } = await admin
      .from('family_members')
      .select('id')
      .eq('family_id', family!.id)
    const { data: holdings } = await admin.from('holdings').select('id').eq('family_id', family!.id)
    expect(members).toEqual([])
    expect(holdings).toEqual([])

    expect(revalidatePath).toHaveBeenCalledWith('/families')
  })

  it('returns a failure result without writing when no user is signed in', async () => {
    mockCreateServerSupabase.mockImplementationOnce(async () => {
      const client = await signedInClient(EMAIL, PASSWORD)
      client.auth.getUser = (async () => ({
        data: { user: null },
        error: null,
      })) as unknown as typeof client.auth.getUser
      return client
    })

    const admin = adminClient()
    const before = await admin.from('families').select('id').eq('name', 'Shah — no session')

    const result = await createFamily({
      name: 'Shah — no session',
      headName: '',
      headMobile: '',
      notes: '',
      goalHorizonYears: '10',
      assumedCagr: '12',
    })

    expect(result).toEqual({ ok: false, formError: 'Your session has expired. Sign in again.' })

    const after = await admin.from('families').select('id').eq('name', 'Shah — no session')
    expect(after.data?.length ?? 0).toBe(before.data?.length ?? 0)
  })

  it('rejects invalid input and writes nothing to the database', async () => {
    const admin = adminClient()
    const before = await admin.from('families').select('id').eq('name', 'Shah — invalid horizon')

    const result = await createFamily({
      name: 'Shah — invalid horizon',
      headName: '',
      headMobile: '',
      notes: '',
      goalHorizonYears: '99',
      assumedCagr: '12',
    })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure result')
    expect(result.fieldErrors?.goalHorizonYears).toBeTruthy()

    const after = await admin.from('families').select('id').eq('name', 'Shah — invalid horizon')
    expect(after.data ?? []).toEqual(before.data ?? [])
  })

  // Postgres applies RLS's USING clause to UPDATE/DELETE as a row filter,
  // not an error: an anonymous write against a real row comes back with
  // `error: null`, and the row survives untouched. A test that only checks
  // `result.ok` cannot see that — it has to read the row back to catch it.
  it('reports failure, not success, when an anonymous client attempts an update, and writes nothing', async () => {
    const admin = adminClient()
    const { data: family } = await admin
      .from('families')
      .insert({ name: 'Shah — anon update target', owner_advisor_id: advisorId, notes: 'original' })
      .select()
      .single()

    mockCreateServerSupabase.mockImplementationOnce(async () => anonClient())

    const result = await updateFamily(family!.id, {
      name: 'Hacked',
      headName: '',
      headMobile: '',
      notes: 'hacked',
      goalHorizonYears: '10',
      assumedCagr: '12',
    })

    expect(result.ok).toBe(false)

    const { data: row } = await admin.from('families').select('*').eq('id', family!.id).single()
    expect(row?.name).toBe('Shah — anon update target')
    expect(row?.notes).toBe('original')

    await admin.from('families').delete().eq('id', family!.id)
  })

  it('reports failure, not success, when an anonymous client attempts a delete, and the row survives', async () => {
    const admin = adminClient()
    const { data: family } = await admin
      .from('families')
      .insert({ name: 'Shah — anon delete target', owner_advisor_id: advisorId })
      .select()
      .single()

    mockCreateServerSupabase.mockImplementationOnce(async () => anonClient())

    const result = await deleteFamily(family!.id)

    expect(result.ok).toBe(false)

    const { data: row } = await admin.from('families').select('id').eq('id', family!.id).maybeSingle()
    expect(row).not.toBeNull()

    await admin.from('families').delete().eq('id', family!.id)
  })
})
