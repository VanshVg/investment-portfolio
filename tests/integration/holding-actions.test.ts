import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { adminClient, anonClient, ensureUser, signedInClient } from '../helpers/db'
import { applyDueDateEdit } from '@/lib/domain/due-dates'

const EMAIL = 'holding-actions@example.test'
const PASSWORD = 'test-password-123'
let advisorId: string
let familyId: string

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
      institution: '',
      principalAmount: null,
      periodicAmount: null,
      nextDueDate: null,
      dueFrequency: 'monthly',
      remindersEnabled: true,
      category: 'mutual_fund',
      details: { target_goal: 500_000, fund_house: 'Parag Parikh' },
    })

    expect(result.ok).toBe(true)

    const { data: row } = await admin
      .from('holdings')
      .select('category, details, due_frequency')
      .eq('id', holding!.id)
      .single()
    expect(row?.category).toBe('mutual_fund')
    expect(row?.details).toEqual({ target_goal: 500_000, fund_house: 'Parag Parikh' })
    expect(row?.due_frequency).toBe('monthly')

    await admin.from('holdings').delete().eq('id', holding!.id)
  })
})
