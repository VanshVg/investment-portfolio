import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { adminClient, ensureUser, signedInClient } from '../helpers/db'

const ADMIN_EMAIL = 'reminder-settings-admin@example.test'
const STAFF_EMAIL = 'reminder-settings-staff@example.test'
const OTHER_EMAIL = 'reminder-settings-other@example.test'
const PASSWORD = 'test-password-123'

// Service-role client, used only to arrange/inspect fixtures — never as the
// thing under test. Matches reminder-rules.test.ts and family-actions.test.ts.
const admin = adminClient()

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

mockCreateServerSupabase.mockImplementation(() => signedInClient(ADMIN_EMAIL, PASSWORD))

const { updateReminderRule, updateAdvisorMobile } = await import(
  '@/app/(app)/settings/reminders/actions'
)

let advisorId: string
let otherId: string

// A family + holding this file owns exclusively, whose holding-scoped
// reminder rule is the only row updateReminderRule's tests ever mutate.
//
// The four seeded category rules (life_insurance/general_insurance/
// mutual_fund/fixed_income, migration 20260904104843, each {30,15} active)
// are deliberately never written here. They are shared, live state: the
// partial unique index reminder_rules_one_active_per_category already claims
// all four active slots, other integration suites (reminder-rules.test.ts,
// sweep.test.ts, cron-reminders.test.ts) read them concurrently under the
// `unit` project's file-level parallelism, and updateReminderRule's own SQL
// (`update reminder_rules set days_before = ..., is_active = ... where id =
// $1 returning id`) does not care whether the row it is given is category- or
// holding-scoped — a holding-scoped fixture the size of exactly one row
// exercises the identical write path without racing anything else in the
// suite. See task-14-report.md for why this was chosen over serializing a
// seeded-rule-mutating test alongside cron-reminders.test.ts.
let familyId: string
let holdingId: string
let ruleId: string

afterAll(async () => {
  if (!familyId) return
  const { data, error } = await admin.from('families').delete().in('id', [familyId]).select('id')
  if (error) throw new Error(`fixture cleanup failed: ${error.message}`)
  if (!data || data.length === 0) {
    throw new Error('fixture cleanup deleted no rows — familyId did not match a live row')
  }
})

describe('updateReminderRule', () => {
  beforeAll(async () => {
    const user = await ensureUser(ADMIN_EMAIL, PASSWORD, 'admin')
    advisorId = user!.id
    await ensureUser(STAFF_EMAIL, PASSWORD, 'staff')

    const { data: family, error: familyError } = await admin
      .from('families')
      .insert({ name: 'Reminder settings fixture', owner_advisor_id: advisorId })
      .select()
      .single()
    if (familyError) throw new Error(familyError.message)
    familyId = family!.id

    const { data: holding, error: holdingError } = await admin
      .from('holdings')
      .insert({
        family_id: familyId,
        category: 'life_insurance',
        label: 'Reminder settings fixture holding',
      })
      .select()
      .single()
    if (holdingError) throw new Error(holdingError.message)
    holdingId = holding!.id

    // The partial unique index reminder_rules_one_active_per_holding allows
    // exactly one active holding-scoped rule; this fixture holding never
    // gets a second one, so nothing here can collide with it.
    const { data: rule, error: ruleError } = await admin
      .from('reminder_rules')
      .insert({ holding_id: holdingId, days_before: [30, 15], is_active: true })
      .select()
      .single()
    if (ruleError) throw new Error(ruleError.message)
    ruleId = rule!.id
  })

  it('updates days_before and is_active by id, deduplicating and sorting, and revalidates the page', async () => {
    revalidatePath.mockClear()

    const result = await updateReminderRule(ruleId, { daysBefore: '45, 10, 10', isActive: false })
    expect(result.ok).toBe(true)

    const { data: row } = await admin
      .from('reminder_rules')
      .select('days_before, is_active')
      .eq('id', ruleId)
      .single()
    expect(row?.days_before).toEqual([45, 10])
    expect(row?.is_active).toBe(false)

    expect(revalidatePath).toHaveBeenCalledWith('/settings/reminders')

    // Restore: the tests below assume the fixture rule is active at {30,15}.
    await admin
      .from('reminder_rules')
      .update({ days_before: [30, 15], is_active: true })
      .eq('id', ruleId)
  })

  it('rejects an empty window without writing, attributed to the daysBefore field', async () => {
    const result = await updateReminderRule(ruleId, { daysBefore: '', isActive: true })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.fieldErrors?.daysBefore).toBeTruthy()

    const { data: row } = await admin
      .from('reminder_rules')
      .select('days_before')
      .eq('id', ruleId)
      .single()
    expect(row?.days_before).toEqual([30, 15])
  })

  it('reports a failed write, not a silent no-op, when nothing matches the id', async () => {
    const result = await updateReminderRule('00000000-0000-0000-0000-000000000000', {
      daysBefore: '30',
      isActive: true,
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.formError).toBeTruthy()
  })

  it('denies a non-admin write, which RLS reports as an empty result rather than an error', async () => {
    mockCreateServerSupabase.mockImplementationOnce(() => signedInClient(STAFF_EMAIL, PASSWORD))

    const result = await updateReminderRule(ruleId, { daysBefore: '99', isActive: true })
    expect(result.ok).toBe(false)

    const { data: row } = await admin
      .from('reminder_rules')
      .select('days_before')
      .eq('id', ruleId)
      .single()
    expect(row?.days_before).toEqual([30, 15])
  })

  it('leaves the four seeded category rules exactly as migration 20260904104843 left them', async () => {
    const { data: rows, error } = await admin
      .from('reminder_rules')
      .select('category, days_before, is_active')
      .not('category', 'is', null)
      .order('category')
    if (error) throw new Error(error.message)

    expect(rows).toHaveLength(4)
    for (const row of rows ?? []) {
      expect(row.days_before).toEqual([30, 15])
      expect(row.is_active).toBe(true)
    }
  })
})

describe('updateAdvisorMobile', () => {
  beforeAll(async () => {
    const user = await ensureUser(ADMIN_EMAIL, PASSWORD, 'admin')
    advisorId = user!.id
    const other = await ensureUser(OTHER_EMAIL, PASSWORD, 'admin')
    otherId = other!.id

    // Both fixture profiles start from a known state so assertions below
    // don't depend on whatever a previous local run left behind. Neither
    // email is the seeded "Hiral Investmentwala" profile or one another
    // suite shares.
    await admin.from('profiles').update({ mobile: null }).eq('id', advisorId)
    await admin.from('profiles').update({ mobile: null }).eq('id', otherId)
  })

  afterAll(async () => {
    await admin.from('profiles').update({ mobile: null }).eq('id', advisorId)
    await admin.from('profiles').update({ mobile: null }).eq('id', otherId)
  })

  it("saves the signed-in advisor's own mobile and reads it back", async () => {
    mockCreateServerSupabase.mockImplementationOnce(() => signedInClient(ADMIN_EMAIL, PASSWORD))

    const result = await updateAdvisorMobile({ mobile: '98765 43210' })
    expect(result.ok).toBe(true)

    const { data: row } = await admin
      .from('profiles')
      .select('mobile')
      .eq('id', advisorId)
      .single()
    expect(row?.mobile).toBe('+919876543210')
  })

  it('cannot write another user’s row, even when the caller smuggles a different id into the input', async () => {
    mockCreateServerSupabase.mockImplementationOnce(() => signedInClient(ADMIN_EMAIL, PASSWORD))

    const result = await updateAdvisorMobile({
      mobile: '90000 00001',
      id: otherId,
      profileId: otherId,
    })
    expect(result.ok).toBe(true)

    const { data: mine } = await admin
      .from('profiles')
      .select('mobile')
      .eq('id', advisorId)
      .single()
    expect(mine?.mobile).toBe('+919000000001')

    const { data: theirs } = await admin
      .from('profiles')
      .select('mobile')
      .eq('id', otherId)
      .single()
    expect(theirs?.mobile).toBeNull()
  })
})
