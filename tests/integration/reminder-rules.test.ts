import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminClient, ensureUser } from '../helpers/db'
import { loadReminderRules, maxWindow, windowsFor, type RuleSet } from '@/lib/reminders/rules'
import type { SupabaseClient } from '@supabase/supabase-js'

const EMAIL = 'reminder-rules-admin@example.test'
const PASSWORD = 'test-password-123'

// Rule resolution reads live, and the daily sweep will read with the same
// elevated privilege, so the service-role client stands in for both "arrange
// fixtures" and "the thing under test" — matching reconcile-due-instances.test.ts.
const admin: SupabaseClient = adminClient()

let familyId: string
// The single holding these tests layer a rule override onto and off of, in
// order: no override -> active override -> deactivated override. Sequencing
// through one holding (rather than three) is what lets the "falls back to
// default" test prove the fallback actually happens, instead of merely
// reading a holding that never had an override to begin with.
let holdingId: string
let holdingRuleId: string

// Cascades away the fixture family, taking the holding and its holding-scoped
// rule with it (reminder_rules.holding_id references holdings on delete
// cascade), so repeated local runs don't accumulate rows and the seeded
// category rules are never touched by this suite's cleanup.
afterAll(async () => {
  if (!familyId) return
  const { data, error } = await admin.from('families').delete().in('id', [familyId]).select('id')
  if (error) throw new Error(`fixture cleanup failed: ${error.message}`)
  if (!data || data.length === 0) {
    throw new Error('fixture cleanup deleted no rows — familyId did not match a live row')
  }
})

describe('reminder rule resolution', () => {
  beforeAll(async () => {
    const user = await ensureUser(EMAIL, PASSWORD, 'admin')

    const { data: family, error: familyError } = await admin
      .from('families')
      .insert({ name: 'Reminder rules fixture', owner_advisor_id: user!.id })
      .select()
      .single()
    if (familyError) throw new Error(familyError.message)
    familyId = family!.id

    const { data: holding, error: holdingError } = await admin
      .from('holdings')
      .insert({
        family_id: familyId,
        category: 'life_insurance',
        label: 'Reminder rules fixture holding',
      })
      .select()
      .single()
    if (holdingError) throw new Error(holdingError.message)
    holdingId = holding!.id
  })

  it('uses the category default when a holding has no override', async () => {
    const rules = await loadReminderRules(admin)
    // life_insurance is seeded active with {30,15} by migration
    // 20260904104843, and this holding carries no rule of its own yet.
    expect(windowsFor(rules, { category: 'life_insurance', holdingId })).toEqual([30, 15])
  })

  it('prefers a holding override over the category default', async () => {
    // The partial unique index reminder_rules_one_active_per_holding allows
    // exactly one active holding-scoped rule; this is the only one this
    // holding ever gets, so nothing here can collide with it.
    const { data: rule, error } = await admin
      .from('reminder_rules')
      .insert({ holding_id: holdingId, days_before: [7] })
      .select()
      .single()
    if (error) throw new Error(error.message)
    holdingRuleId = rule!.id

    const rules = await loadReminderRules(admin)
    expect(windowsFor(rules, { category: 'life_insurance', holdingId })).toEqual([7])
  })

  it('ignores an inactive rule and falls back to the category default', async () => {
    // Deactivating a rule this suite created (and cascades away in afterAll)
    // is the safe way to exercise the inactive-rule path: unlike the seeded
    // category rules, there is no other suite or running app depending on
    // this row's state, and no teardown-race can leave a shared rule disabled.
    const { data, error } = await admin
      .from('reminder_rules')
      .update({ is_active: false })
      .eq('id', holdingRuleId)
      .select('id')
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) {
      throw new Error('deactivating the holding rule affected no rows')
    }

    const rules = await loadReminderRules(admin)
    expect(windowsFor(rules, { category: 'life_insurance', holdingId })).toEqual([30, 15])
  })

  // Every one of the four categories in this schema is seeded with an active
  // default rule (migration 20260904104843), and the partial unique index
  // reminder_rules_one_active_per_category forbids a second active row for a
  // category that already has one. There is therefore no real category in
  // the live database that lacks an active rule, and no fixture can create
  // that condition without mutating (and having to perfectly restore) seeded,
  // shared state. windowsFor is a pure function of the RuleSet it is given,
  // so this exercises the "neither map has an entry" branch directly with a
  // hand-built, empty RuleSet instead of database state that cannot exist.
  it('returns no windows for a category with no active rule', () => {
    const empty: RuleSet = { byCategory: new Map(), byHolding: new Map() }
    expect(windowsFor(empty, { category: 'mutual_fund', holdingId: 'unused-holding-id' })).toEqual(
      [],
    )
  })

  it('reports the widest window across every active rule', async () => {
    const rules = await loadReminderRules(admin)
    // The four seeded category defaults are each {30,15}; this holding's own
    // rule is inactive by this point, and even active it was {7} — smaller
    // either way. 30 is the true widest window across everything active.
    expect(maxWindow(rules)).toBe(30)
  })
})
