import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { adminClient, anonClient, ensureUser, signedInClient } from '../helpers/db'
import { applyDueDateEdit } from '@/lib/domain/due-dates'
import { reconcileDueInstances } from '@/lib/reminders/reconcile'
import { addDays } from 'date-fns'
import { fromISODate, toISODate, todayInIndia } from '@/lib/domain/dates'

const EMAIL = 'holding-actions@example.test'
const PASSWORD = 'test-password-123'
let advisorId: string
let familyId: string

// The reconcile-on-update test below deletes an old due instance because it
// no longer sits on the holding's schedule -- but reconciliation only ever
// touches rows at or after today, so the old date must still be there when
// the fix runs. Derived from today, not hardcoded, so this stays true no
// matter how long this suite goes unrun.
const RECONCILE_TODAY = todayInIndia()
const RECONCILE_OLD_DATE = toISODate(addDays(fromISODate(RECONCILE_TODAY)!, 10))
const RECONCILE_NEW_DATE = toISODate(addDays(fromISODate(RECONCILE_TODAY)!, 40))

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

// Wraps the real reconcileDueInstances in a vi.fn whose default behaviour is
// the actual implementation, so every existing test in this file still runs
// real reconciliation unless a test explicitly queues a one-off failure with
// mockImplementationOnce (see the "still reports success" test below). This
// is deliberately not a blanket mock — most of this file needs the genuine
// generation behaviour to be under test.
vi.mock('@/lib/reminders/reconcile', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/reminders/reconcile')>()
  return { ...actual, reconcileDueInstances: vi.fn(actual.reconcileDueInstances) }
})

mockCreateServerSupabase.mockImplementation(() => signedInClient(EMAIL, PASSWORD))

const { createHolding, updateHolding, deleteHolding } = await import(
  '@/app/(app)/families/[familyId]/holding-actions'
)

// Cascades away the shared 'Holding Fixture' family along with every holding
// and due instance the tests below created against it, so repeated local
// runs don't accumulate orphaned fixture data.
afterAll(async () => {
  await adminClient().from('families').delete().eq('id', familyId)
})

describe('holding records', () => {
  beforeAll(async () => {
    const user = await ensureUser(EMAIL, PASSWORD, 'admin')
    advisorId = user!.id
    const { data } = await adminClient()
      .from('families')
      .insert({ name: 'Holding Fixture', owner_advisor_id: advisorId })
      .select()
      .single()
    familyId = data!.id
  })

  it('stores a re-anchored due date on both columns', async () => {
    const admin = adminClient()
    const { data: created } = await admin
      .from('holdings')
      .insert({
        family_id: familyId,
        category: 'life_insurance',
        label: 'Re-anchor probe',
        anchor_due_date: '2026-01-15',
        next_due_date: '2027-01-15',
      })
      .select()
      .single()

    const schedule = applyDueDateEdit(
      { anchorDueDate: created!.anchor_due_date, nextDueDate: created!.next_due_date },
      '2027-01-20',
    )

    const { data: updated } = await admin
      .from('holdings')
      .update({ anchor_due_date: schedule.anchorDueDate, next_due_date: schedule.nextDueDate })
      .eq('id', created!.id)
      .select()
      .single()

    expect(updated!.anchor_due_date).toBe('2027-01-20')
    expect(updated!.next_due_date).toBe('2027-01-20')
  })

  it('cascades due instances when a holding is deleted', async () => {
    const admin = adminClient()
    const { data: holding } = await admin
      .from('holdings')
      .insert({ family_id: familyId, category: 'fixed_income', label: 'Delete probe' })
      .select()
      .single()
    await admin.from('due_instances').insert({ holding_id: holding!.id, due_date: '2027-02-01' })

    await admin.from('holdings').delete().eq('id', holding!.id)

    const { data } = await admin.from('due_instances').select('id').eq('holding_id', holding!.id)
    expect(data).toEqual([])
  })

  it('denies anonymous holding inserts', async () => {
    const { error } = await anonClient()
      .from('holdings')
      .insert({ family_id: familyId, category: 'life_insurance', label: 'Anon' })
    expect(error).not.toBeNull()
  })

  it('denies anonymous holding updates', async () => {
    const admin = adminClient()
    const { data: holding } = await admin
      .from('holdings')
      .insert({ family_id: familyId, category: 'life_insurance', label: 'Anon update target' })
      .select()
      .single()

    await anonClient().from('holdings').update({ label: 'Hacked' }).eq('id', holding!.id)

    const { data: after } = await admin
      .from('holdings')
      .select('label')
      .eq('id', holding!.id)
      .single()
    expect(after!.label).toBe('Anon update target')
  })
})

describe('createHolding / updateHolding / deleteHolding server actions', () => {
  beforeAll(async () => {
    const user = await ensureUser(EMAIL, PASSWORD, 'admin')
    advisorId = user!.id
  })

  it('creates a holding with every mapped column, including details, and revalidates the family page', async () => {
    revalidatePath.mockClear()
    const input = {
      memberId: null,
      managedBy: 'self',
      label: 'HDFC Click2Protect',
      institution: 'HDFC Life',
      principalAmount: 5_000_000,
      periodicAmount: 12_500,
      nextDueDate: '2027-03-12',
      dueFrequency: 'annual',
      remindersEnabled: true,
      category: 'life_insurance',
      details: { policy_number: 'P/1234', term_years: 20 },
    }

    const result = await createHolding(familyId, input)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok result')

    const admin = adminClient()
    const { data: row, error } = await admin
      .from('holdings')
      .select('*')
      .eq('id', result.id)
      .single()
    expect(error).toBeNull()
    expect(row?.family_id).toBe(familyId)
    expect(row?.member_id).toBeNull()
    expect(row?.category).toBe('life_insurance')
    expect(row?.managed_by).toBe('self')
    expect(row?.label).toBe('HDFC Click2Protect')
    expect(row?.institution).toBe('HDFC Life')
    expect(Number(row?.principal_amount)).toBe(5_000_000)
    expect(Number(row?.periodic_amount)).toBe(12_500)
    // A new record's first due date is by definition its anchor.
    expect(row?.anchor_due_date).toBe('2027-03-12')
    expect(row?.next_due_date).toBe('2027-03-12')
    expect(row?.due_frequency).toBe('annual')
    expect(row?.reminders_enabled).toBe(true)
    expect(row?.details).toEqual({ policy_number: 'P/1234', term_years: 20 })

    expect(revalidatePath).toHaveBeenCalledWith(`/families/${familyId}`)

    await admin.from('holdings').delete().eq('id', result.id)
  })

  it('updates the intended fields', async () => {
    const admin = adminClient()
    const { data: holding } = await admin
      .from('holdings')
      .insert({
        family_id: familyId,
        category: 'fixed_income',
        label: 'Before update',
        details: { asset_type: 'Bank FD' },
      })
      .select()
      .single()

    revalidatePath.mockClear()
    const result = await updateHolding(holding!.id, familyId, {
      memberId: null,
      managedBy: 'external',
      label: 'After update',
      institution: 'SBI',
      principalAmount: 1_000_000,
      periodicAmount: null,
      nextDueDate: null,
      dueFrequency: 'one_time',
      remindersEnabled: false,
      category: 'fixed_income',
      details: { asset_type: 'Bank FD', interest_rate: 6.5 },
    })
    expect(result.ok).toBe(true)

    const { data: row } = await admin.from('holdings').select('*').eq('id', holding!.id).single()
    expect(row?.managed_by).toBe('external')
    expect(row?.label).toBe('After update')
    expect(row?.institution).toBe('SBI')
    expect(Number(row?.principal_amount)).toBe(1_000_000)
    expect(row?.periodic_amount).toBeNull()
    expect(row?.due_frequency).toBe('one_time')
    expect(row?.reminders_enabled).toBe(false)
    expect(row?.details).toEqual({ asset_type: 'Bank FD', interest_rate: 6.5 })

    expect(revalidatePath).toHaveBeenCalledWith(`/families/${familyId}`)

    await admin.from('holdings').delete().eq('id', holding!.id)
  })

  it('re-anchors both columns through the action when the due date is edited, and writes neither when it is untouched', async () => {
    const admin = adminClient()
    const { data: holding } = await admin
      .from('holdings')
      .insert({
        family_id: familyId,
        category: 'life_insurance',
        label: 'Action re-anchor probe',
        anchor_due_date: '2026-01-15',
        next_due_date: '2027-01-15',
      })
      .select()
      .single()

    const baseInput = {
      memberId: null,
      managedBy: 'self',
      label: 'Action re-anchor probe',
      institution: '',
      principalAmount: null,
      periodicAmount: null,
      dueFrequency: 'annual',
      remindersEnabled: true,
      category: 'life_insurance',
      details: {},
    }

    const untouched = await updateHolding(holding!.id, familyId, {
      ...baseInput,
      nextDueDate: '2027-01-15', // same as the current next_due_date: not an edit
    })
    expect(untouched.ok).toBe(true)

    const { data: afterUntouched } = await admin
      .from('holdings')
      .select('anchor_due_date, next_due_date')
      .eq('id', holding!.id)
      .single()
    expect(afterUntouched?.anchor_due_date).toBe('2026-01-15')
    expect(afterUntouched?.next_due_date).toBe('2027-01-15')

    const edited = await updateHolding(holding!.id, familyId, {
      ...baseInput,
      nextDueDate: '2027-01-20',
    })
    expect(edited.ok).toBe(true)

    const { data: afterEdit } = await admin
      .from('holdings')
      .select('anchor_due_date, next_due_date')
      .eq('id', holding!.id)
      .single()
    expect(afterEdit?.anchor_due_date).toBe('2027-01-20')
    expect(afterEdit?.next_due_date).toBe('2027-01-20')

    await admin.from('holdings').delete().eq('id', holding!.id)
  })

  it('deletes a holding and cascades due instances, driven through the action rather than a raw client', async () => {
    const admin = adminClient()
    const { data: holding } = await admin
      .from('holdings')
      .insert({ family_id: familyId, category: 'fixed_income', label: 'Action delete probe' })
      .select()
      .single()
    await admin.from('due_instances').insert({ holding_id: holding!.id, due_date: '2027-02-01' })

    revalidatePath.mockClear()
    const result = await deleteHolding(holding!.id, familyId)
    expect(result.ok).toBe(true)

    const { data: row } = await admin
      .from('holdings')
      .select('id')
      .eq('id', holding!.id)
      .maybeSingle()
    expect(row).toBeNull()

    const { data: instances } = await admin
      .from('due_instances')
      .select('id')
      .eq('holding_id', holding!.id)
    expect(instances).toEqual([])

    expect(revalidatePath).toHaveBeenCalledWith(`/families/${familyId}`)
  })

  it('returns a failure result without writing when the caller is unauthenticated', async () => {
    mockCreateServerSupabase.mockImplementationOnce(async () => anonClient())

    const admin = adminClient()
    const before = await admin
      .from('holdings')
      .select('id')
      .eq('family_id', familyId)
      .eq('label', 'Auth-guard probe')

    const result = await createHolding(familyId, {
      memberId: null,
      managedBy: 'self',
      label: 'Auth-guard probe',
      institution: '',
      principalAmount: null,
      periodicAmount: null,
      nextDueDate: null,
      dueFrequency: 'annual',
      remindersEnabled: true,
      category: 'life_insurance',
      details: {},
    })

    expect(result.ok).toBe(false)

    const after = await admin
      .from('holdings')
      .select('id')
      .eq('family_id', familyId)
      .eq('label', 'Auth-guard probe')
    expect(after.data ?? []).toEqual(before.data ?? [])
  })

  it('rejects a details field foreign to the category and writes nothing', async () => {
    const admin = adminClient()
    const before = await admin
      .from('holdings')
      .select('id')
      .eq('family_id', familyId)
      .eq('label', 'Invalid details probe')

    const result = await createHolding(familyId, {
      memberId: null,
      managedBy: 'self',
      label: 'Invalid details probe',
      institution: '',
      principalAmount: null,
      periodicAmount: null,
      nextDueDate: null,
      dueFrequency: 'annual',
      remindersEnabled: true,
      category: 'mutual_fund',
      // policy_number belongs to life_insurance, not mutual_fund: the strict
      // schema must reject it rather than silently store it.
      details: { target_goal: 1_000_000, policy_number: 'P/1234' },
    })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure result')
    expect(result.fieldErrors ?? result.formError).toBeTruthy()

    const after = await admin
      .from('holdings')
      .select('id')
      .eq('family_id', familyId)
      .eq('label', 'Invalid details probe')
    expect(after.data ?? []).toEqual(before.data ?? [])
  })

  it('rejects an update whose category disagrees with the stored row, and writes nothing', async () => {
    const admin = adminClient()
    const { data: holding } = await admin
      .from('holdings')
      .insert({
        family_id: familyId,
        category: 'life_insurance',
        label: 'Category mismatch probe',
        details: { policy_number: 'ORIG-1' },
      })
      .select()
      .single()

    const result = await updateHolding(holding!.id, familyId, {
      memberId: null,
      managedBy: 'self',
      label: 'Category mismatch probe',
      institution: '',
      principalAmount: null,
      periodicAmount: null,
      nextDueDate: null,
      dueFrequency: 'annual',
      remindersEnabled: true,
      category: 'mutual_fund',
      details: { target_goal: 999_999 },
    })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure result')
    expect(result.fieldErrors ?? result.formError).toBeTruthy()

    const { data: row } = await admin
      .from('holdings')
      .select('category, details')
      .eq('id', holding!.id)
      .single()
    expect(row?.category).toBe('life_insurance')
    expect(row?.details).toEqual({ policy_number: 'ORIG-1' })

    await admin.from('holdings').delete().eq('id', holding!.id)
  })

  it('rejects a mismatched update for a second category pairing, and writes nothing', async () => {
    const admin = adminClient()
    const { data: holding } = await admin
      .from('holdings')
      .insert({
        family_id: familyId,
        category: 'fixed_income',
        label: 'Category mismatch probe 2',
        details: { asset_type: 'Bank FD' },
      })
      .select()
      .single()

    const result = await updateHolding(holding!.id, familyId, {
      memberId: null,
      managedBy: 'self',
      label: 'Category mismatch probe 2',
      institution: '',
      principalAmount: null,
      periodicAmount: null,
      nextDueDate: null,
      dueFrequency: 'annual',
      remindersEnabled: true,
      category: 'general_insurance',
      details: { sub_category: 'health', insured_asset: 'Self', policy_type: 'Mediclaim' },
    })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure result')
    expect(result.fieldErrors ?? result.formError).toBeTruthy()

    const { data: row } = await admin
      .from('holdings')
      .select('category, details')
      .eq('id', holding!.id)
      .single()
    expect(row?.category).toBe('fixed_income')
    expect(row?.details).toEqual({ asset_type: 'Bank FD' })

    await admin.from('holdings').delete().eq('id', holding!.id)
  })

  it('still updates a holding when the submitted category matches the stored row', async () => {
    const admin = adminClient()
    const { data: holding } = await admin
      .from('holdings')
      .insert({
        family_id: familyId,
        category: 'mutual_fund',
        label: 'Same-category update probe',
        details: { target_goal: 100_000 },
      })
      .select()
      .single()

    const result = await updateHolding(holding!.id, familyId, {
      memberId: null,
      managedBy: 'self',
      label: 'Same-category update probe',
      institution: 'Parag Parikh',
      principalAmount: null,
      periodicAmount: null,
      nextDueDate: null,
      dueFrequency: 'monthly',
      remindersEnabled: true,
      category: 'mutual_fund',
      details: { target_goal: 500_000 },
    })

    expect(result.ok).toBe(true)

    const { data: row } = await admin
      .from('holdings')
      .select('category, institution, details, due_frequency')
      .eq('id', holding!.id)
      .single()
    expect(row?.category).toBe('mutual_fund')
    expect(row?.institution).toBe('Parag Parikh')
    expect(row?.details).toEqual({ target_goal: 500_000 })
    expect(row?.due_frequency).toBe('monthly')

    await admin.from('holdings').delete().eq('id', holding!.id)
  })

  // Postgres applies RLS's USING clause to UPDATE/DELETE as a row filter,
  // not an error: an anonymous write against a real row comes back with
  // `error: null`, and the row survives untouched. A test that only checks
  // `result.ok` cannot see that — it has to read the row back to catch it.
  it('reports failure, not success, when an anonymous client attempts an update, and writes nothing', async () => {
    const admin = adminClient()
    const { data: holding } = await admin
      .from('holdings')
      .insert({ family_id: familyId, category: 'life_insurance', label: 'Anon action update target' })
      .select()
      .single()

    mockCreateServerSupabase.mockImplementationOnce(async () => anonClient())

    const result = await updateHolding(holding!.id, familyId, {
      memberId: null,
      managedBy: 'self',
      label: 'Hacked',
      institution: '',
      principalAmount: null,
      periodicAmount: null,
      nextDueDate: null,
      dueFrequency: 'annual',
      remindersEnabled: true,
      category: 'life_insurance',
      details: {},
    })

    expect(result.ok).toBe(false)

    const { data: row } = await admin
      .from('holdings')
      .select('label')
      .eq('id', holding!.id)
      .single()
    expect(row?.label).toBe('Anon action update target')

    await admin.from('holdings').delete().eq('id', holding!.id)
  })

  it('reports failure, not success, when an anonymous client attempts a delete, and the row survives', async () => {
    const admin = adminClient()
    const { data: holding } = await admin
      .from('holdings')
      .insert({ family_id: familyId, category: 'life_insurance', label: 'Anon action delete target' })
      .select()
      .single()

    mockCreateServerSupabase.mockImplementationOnce(async () => anonClient())

    const result = await deleteHolding(holding!.id, familyId)

    expect(result.ok).toBe(false)

    const { data: row } = await admin
      .from('holdings')
      .select('id')
      .eq('id', holding!.id)
      .maybeSingle()
    expect(row).not.toBeNull()

    await admin.from('holdings').delete().eq('id', holding!.id)
  })

  describe('memberId ownership', () => {
    let otherFamilyId: string
    let otherMemberId: string

    beforeAll(async () => {
      const admin = adminClient()
      const { data: otherFamily } = await admin
        .from('families')
        .insert({ name: 'Holding Fixture — other family', owner_advisor_id: advisorId })
        .select()
        .single()
      otherFamilyId = otherFamily!.id
      const { data: otherMember } = await admin
        .from('family_members')
        .insert({ family_id: otherFamilyId, name: 'Foreign member', relation: 'other' })
        .select()
        .single()
      otherMemberId = otherMember!.id
    })

    afterAll(async () => {
      await adminClient().from('families').delete().eq('id', otherFamilyId)
    })

    it('rejects createHolding when memberId belongs to a different family, and writes nothing', async () => {
      const admin = adminClient()
      const before = await admin
        .from('holdings')
        .select('id')
        .eq('family_id', familyId)
        .eq('label', 'Cross-family member probe')

      const result = await createHolding(familyId, {
        memberId: otherMemberId,
        managedBy: 'self',
        label: 'Cross-family member probe',
        institution: '',
        principalAmount: null,
        periodicAmount: null,
        nextDueDate: null,
        dueFrequency: 'annual',
        remindersEnabled: true,
        category: 'life_insurance',
        details: {},
      })

      expect(result.ok).toBe(false)
      if (result.ok) throw new Error('expected failure result')
      expect(result.fieldErrors?.memberId).toBeTruthy()

      const after = await admin
        .from('holdings')
        .select('id')
        .eq('family_id', familyId)
        .eq('label', 'Cross-family member probe')
      expect(after.data ?? []).toEqual(before.data ?? [])
    })

    it('rejects updateHolding when memberId belongs to a different family, and writes nothing', async () => {
      const admin = adminClient()
      const { data: holding } = await admin
        .from('holdings')
        .insert({
          family_id: familyId,
          category: 'life_insurance',
          label: 'Cross-family update probe',
          member_id: null,
        })
        .select()
        .single()

      const result = await updateHolding(holding!.id, familyId, {
        memberId: otherMemberId,
        managedBy: 'self',
        label: 'Cross-family update probe',
        institution: '',
        principalAmount: null,
        periodicAmount: null,
        nextDueDate: null,
        dueFrequency: 'annual',
        remindersEnabled: true,
        category: 'life_insurance',
        details: {},
      })

      expect(result.ok).toBe(false)
      if (result.ok) throw new Error('expected failure result')
      expect(result.fieldErrors?.memberId).toBeTruthy()

      const { data: row } = await admin
        .from('holdings')
        .select('member_id')
        .eq('id', holding!.id)
        .single()
      expect(row?.member_id).toBeNull()

      await admin.from('holdings').delete().eq('id', holding!.id)
    })
  })
})

async function datesFor(holdingId: string): Promise<string[]> {
  const admin = adminClient()
  const { data, error } = await admin
    .from('due_instances')
    .select('due_date')
    .eq('holding_id', holdingId)
    .order('due_date')
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => row.due_date)
}

async function instanceIdsFor(holdingId: string): Promise<string[]> {
  const admin = adminClient()
  const { data, error } = await admin
    .from('due_instances')
    .select('id')
    .eq('holding_id', holdingId)
    .order('due_date')
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => row.id)
}

// These exercise the save path's due-instance generation (Task 6): createHolding
// and updateHolding must each trigger reconciliation so a holding entered in
// front of a client shows its due dates immediately, without waiting on the
// nightly job. Driven through the actions themselves, not through direct
// inserts, since that wiring is exactly what these tests are checking for.
describe('due instance generation on the write path', () => {
  const baseInput = {
    memberId: null,
    managedBy: 'self' as const,
    label: 'Generation probe',
    institution: '',
    principalAmount: null,
    periodicAmount: 25_000,
    dueFrequency: 'annual' as const,
    remindersEnabled: true,
    category: 'life_insurance' as const,
    details: {},
  }

  it('creates due instances when a holding is created', async () => {
    const result = await createHolding(familyId, { ...baseInput, nextDueDate: '2026-10-01' })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok result')

    const dates = await datesFor(result.id)
    expect(dates).toContain('2026-10-01')

    await adminClient().from('holdings').delete().eq('id', result.id)
  })

  it('reconciles due instances when the due date is corrected', async () => {
    const created = await createHolding(familyId, {
      ...baseInput,
      label: 'Reconcile-on-update probe',
      dueFrequency: 'one_time',
      nextDueDate: RECONCILE_OLD_DATE,
    })
    expect(created.ok).toBe(true)
    if (!created.ok) throw new Error('expected ok result')

    const updated = await updateHolding(created.id, familyId, {
      ...baseInput,
      label: 'Reconcile-on-update probe',
      dueFrequency: 'one_time',
      nextDueDate: RECONCILE_NEW_DATE,
    })
    expect(updated.ok).toBe(true)

    const dates = await datesFor(created.id)
    expect(dates).toContain(RECONCILE_NEW_DATE)
    expect(dates).not.toContain(RECONCILE_OLD_DATE)

    await adminClient().from('holdings').delete().eq('id', created.id)
  })

  it('does not regenerate when a non-schedule field changes', async () => {
    const created = await createHolding(familyId, {
      ...baseInput,
      label: 'Stable schedule probe',
      nextDueDate: '2026-10-01',
    })
    expect(created.ok).toBe(true)
    if (!created.ok) throw new Error('expected ok result')

    const idsBefore = await instanceIdsFor(created.id)
    expect(idsBefore.length).toBeGreaterThan(0)

    const relabelled = await updateHolding(created.id, familyId, {
      ...baseInput,
      label: 'Stable schedule probe (renamed)',
      nextDueDate: '2026-10-01', // unchanged: not a schedule edit
    })
    expect(relabelled.ok).toBe(true)

    expect(await instanceIdsFor(created.id)).toEqual(idsBefore)

    await adminClient().from('holdings').delete().eq('id', created.id)
  })

  // The rule this task exists to protect: the holding write and the due-
  // instance refresh are two separate statements, and the holding write is
  // the advisor's actual data. If reconciliation fails after that write has
  // already landed, reporting failure would claim the write did not happen
  // when it did — so createHolding/updateHolding must still report success,
  // and the row must genuinely be there. Stale instances are not lost: the
  // next nightly reconciliation run repairs them the same way it repairs a
  // missed run. If this test ever fails, the fix is almost certainly to
  // restore the swallow in `refreshSchedule`, not to remove this test.
  it('still reports success and still writes the holding when reconciliation throws', async () => {
    const forcedFailure = new Error('forced failure for regression test')

    vi.mocked(reconcileDueInstances).mockImplementationOnce(async () => {
      throw forcedFailure
    })
    const created = await createHolding(familyId, {
      ...baseInput,
      label: 'Swallow-rule probe (create)',
      nextDueDate: '2026-10-01',
    })
    expect(created.ok).toBe(true)
    if (!created.ok) throw new Error('expected ok result')

    // Assert the write really happened by reading the row back — a version
    // of refreshSchedule that returned ok:true without actually writing
    // anything would pass a check on the returned id alone.
    const { data: createdRow } = await adminClient()
      .from('holdings')
      .select('id, label')
      .eq('id', created.id)
      .maybeSingle()
    expect(createdRow?.label).toBe('Swallow-rule probe (create)')

    vi.mocked(reconcileDueInstances).mockImplementationOnce(async () => {
      throw forcedFailure
    })
    const updated = await updateHolding(created.id, familyId, {
      ...baseInput,
      label: 'Swallow-rule probe (updated)',
      nextDueDate: '2026-10-01',
    })
    expect(updated.ok).toBe(true)

    const { data: updatedRow } = await adminClient()
      .from('holdings')
      .select('label')
      .eq('id', created.id)
      .single()
    expect(updatedRow?.label).toBe('Swallow-rule probe (updated)')

    await adminClient().from('holdings').delete().eq('id', created.id)
  })
})
