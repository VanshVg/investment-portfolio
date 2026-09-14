import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { adminClient, ensureUser } from '../helpers/db'
import { hasActiveRules, runReminderSweep } from '@/lib/reminders/sweep'
import { loadReminderRules, maxWindow, type RuleSet } from '@/lib/reminders/rules'
import type { SupabaseClient } from '@supabase/supabase-js'

// Wraps the real loadReminderRules in a vi.fn whose default behaviour is the
// actual implementation, so every test in this file still reads the genuine
// reminder_rules table (including the seeded {30,15} category defaults)
// unless a test explicitly overrides one call with mockImplementationOnce —
// see "queues a day-of reminder when the sweep sees only {0} rules" below.
// This is what lets a test control what the sweep sees without touching the
// live, shared reminder_rules table, which other suites and the running app
// depend on and which no test may mutate.
vi.mock('@/lib/reminders/rules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/reminders/rules')>()
  return { ...actual, loadReminderRules: vi.fn(actual.loadReminderRules) }
})

const ADVISOR_EMAIL = 'sweep-admin@example.test'
const UNREACHABLE_ADVISOR_EMAIL = 'sweep-admin-no-mobile@example.test'
const PASSWORD = 'test-password-123'
const ADVISOR_MOBILE = '+919000001111'

// The sweep is meant to run with elevated privilege — it reads across every
// advisor's families, which the profiles_select_own policy alone would not
// allow a signed-in user to do for anyone but themselves — so the
// service-role client stands in for both "arrange fixtures" and "the thing
// under test", matching reminder-rules.test.ts and ensure-due-instances.test.ts.
const admin: SupabaseClient = adminClient()

// A fixed "today" for the single-run scenarios (tests 1-5). Every fixture due
// instance below is dated exactly 30 days out, so exactly one window (the
// seeded life_insurance default's {30,15}) has come due — never the 15-day
// one — which keeps each scenario's row count unambiguous.
const TODAY = '2026-01-01'
const DUE = '2026-01-31'

let advisorId: string
let unreachableAdvisorId: string

let dueSelfId: string
let dueExternalId: string
let dueNoConsentId: string
let dueDisabledId: string
let dueUnreachableId: string

const CONSENTING_MOBILE = '+919876500001'
const EXTERNAL_MEMBER_MOBILE = '+919876500003'

// Every family this suite creates, so afterAll can cascade all of them away
// (holdings, due instances and reminder_log rows go with them) in one go.
const familyIds: string[] = []

async function logRowsFor(dueInstanceId: string) {
  const { data, error } = await admin
    .from('reminder_log')
    .select('recipient_type, recipient_mobile, days_before, status')
    .eq('due_instance_id', dueInstanceId)
  if (error) throw new Error(error.message)
  return data ?? []
}

async function insertFamily(name: string, ownerAdvisorId: string) {
  const { data, error } = await admin
    .from('families')
    .insert({ name, owner_advisor_id: ownerAdvisorId })
    .select()
    .single()
  if (error) throw new Error(error.message)
  familyIds.push(data!.id)
  return data!.id
}

async function insertMember(familyId: string, name: string, mobile: string, consent: boolean) {
  const { data, error } = await admin
    .from('family_members')
    .insert({ family_id: familyId, name, relation: 'self', mobile, whatsapp_consent: consent })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data!.id
}

async function insertHolding(input: {
  familyId: string
  memberId: string | null
  managedBy: 'self' | 'external'
  label: string
  remindersEnabled: boolean
}) {
  const { data, error } = await admin
    .from('holdings')
    .insert({
      family_id: input.familyId,
      member_id: input.memberId,
      category: 'life_insurance',
      managed_by: input.managedBy,
      label: input.label,
      reminders_enabled: input.remindersEnabled,
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data!.id
}

async function insertDueInstance(holdingId: string, dueDate: string) {
  const { data, error } = await admin
    .from('due_instances')
    .insert({ holding_id: holdingId, due_date: dueDate, amount_due: 25_000 })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data!.id
}

/** An active per-holding override. Cascades away with its holding, not tracked separately. */
async function insertHoldingRule(holdingId: string, daysBefore: number[]) {
  const { error } = await admin
    .from('reminder_rules')
    .insert({ holding_id: holdingId, days_before: daysBefore })
  if (error) throw new Error(error.message)
}

// Cascades away every family this suite created. Must not mask a real
// cleanup failure, so an empty or partial delete throws rather than passing
// silently — and must never touch the seeded reminder rules or any profile
// this suite did not itself create.
afterAll(async () => {
  if (familyIds.length === 0) return
  const { data, error } = await admin.from('families').delete().in('id', familyIds).select('id')
  if (error) throw new Error(`fixture cleanup failed: ${error.message}`)
  if (!data || data.length !== familyIds.length) {
    throw new Error(
      `fixture cleanup deleted ${data?.length ?? 0} of ${familyIds.length} families`,
    )
  }
})

describe('runReminderSweep', () => {
  beforeAll(async () => {
    // Every seeded profile (including Hiral's) currently has a null mobile.
    // reminderRecipients takes the advisor's number from profiles.mobile, so
    // a fixture that relied on a shared profile would produce zero advisor
    // recipients and the routing assertions below would pass for the wrong
    // reason. This suite creates and owns its own advisor instead, and sets
    // its mobile — never the seeded Hiral profile, never a profile another
    // suite might share.
    const advisor = await ensureUser(ADVISOR_EMAIL, PASSWORD, 'admin')
    advisorId = advisor!.id
    const { data: updatedAdvisor, error: advisorMobileError } = await admin
      .from('profiles')
      .update({ mobile: ADVISOR_MOBILE })
      .eq('id', advisorId)
      .select('id')
    if (advisorMobileError) throw new Error(advisorMobileError.message)
    if (!updatedAdvisor || updatedAdvisor.length === 0) {
      throw new Error('setting the fixture advisor mobile affected no rows')
    }

    // A second, dedicated advisor whose mobile is left at its natural null
    // default — the "no recipient can be reached" scenario needs an advisor
    // with no number on file, and reusing this suite's own main advisor for
    // that would mean un-setting the mobile the other scenarios depend on.
    const unreachableAdvisor = await ensureUser(UNREACHABLE_ADVISOR_EMAIL, PASSWORD, 'admin')
    unreachableAdvisorId = unreachableAdvisor!.id

    // Family A: three holdings against the mobile-having advisor, covering
    // self-managed+consent, external, and self-managed+no-consent — plus a
    // fourth holding with reminders disabled entirely.
    const familyA = await insertFamily('Sweep fixture — routing scenarios', advisorId)
    const consentingMember = await insertMember(
      familyA,
      'Consenting client',
      CONSENTING_MOBILE,
      true,
    )
    const nonConsentingMember = await insertMember(
      familyA,
      'Non-consenting client',
      '+919876500002',
      false,
    )
    const externalMember = await insertMember(
      familyA,
      'External-holding client',
      EXTERNAL_MEMBER_MOBILE,
      true,
    )

    const selfHoldingId = await insertHolding({
      familyId: familyA,
      memberId: consentingMember,
      managedBy: 'self',
      label: 'Self-managed, consenting',
      remindersEnabled: true,
    })
    dueSelfId = await insertDueInstance(selfHoldingId, DUE)

    const externalHoldingId = await insertHolding({
      familyId: familyA,
      memberId: externalMember,
      managedBy: 'external',
      label: 'Externally managed, consenting anyway',
      remindersEnabled: true,
    })
    dueExternalId = await insertDueInstance(externalHoldingId, DUE)

    const noConsentHoldingId = await insertHolding({
      familyId: familyA,
      memberId: nonConsentingMember,
      managedBy: 'self',
      label: 'Self-managed, no consent',
      remindersEnabled: true,
    })
    dueNoConsentId = await insertDueInstance(noConsentHoldingId, DUE)

    const disabledHoldingId = await insertHolding({
      familyId: familyA,
      memberId: consentingMember,
      managedBy: 'self',
      label: 'Reminders disabled',
      remindersEnabled: false,
    })
    dueDisabledId = await insertDueInstance(disabledHoldingId, DUE)

    // Family B: owned by the advisor with no mobile on file, holding managed
    // externally. Even a consenting member must not be told about an
    // externally managed holding, and here the advisor cannot be reached
    // either, so no recipient exists at all.
    const familyB = await insertFamily(
      'Sweep fixture — unreachable advisor',
      unreachableAdvisorId,
    )
    const unreachableMember = await insertMember(
      familyB,
      'Unreachable-advisor client',
      '+919876500004',
      true,
    )
    const unreachableHoldingId = await insertHolding({
      familyId: familyB,
      memberId: unreachableMember,
      managedBy: 'external',
      label: 'External, advisor has no mobile',
      remindersEnabled: true,
    })
    dueUnreachableId = await insertDueInstance(unreachableHoldingId, DUE)

    // The catch-up, no-requeue, idempotency and zero-window scenarios below
    // each build their own dedicated family/holding/due-instance inline,
    // rather than sharing one here — each needs a different "today" and a
    // fixture that isn't left over from a sibling test's run.
  })

  it('queues a reminder to advisor and client for a self-managed holding', async () => {
    await runReminderSweep(admin, TODAY)

    const rows = await logRowsFor(dueSelfId)
    expect(rows.map((r) => r.recipient_type).sort()).toEqual(['advisor', 'client'])
    expect(rows.every((r) => r.status === 'pending')).toBe(true)
    expect(rows.every((r) => r.days_before === 30)).toBe(true)

    // Assert who, not just how many: the mobiles must be the advisor's and
    // this specific client's, not merely "some row was written".
    const advisorRow = rows.find((r) => r.recipient_type === 'advisor')
    const clientRow = rows.find((r) => r.recipient_type === 'client')
    expect(advisorRow?.recipient_mobile).toBe(ADVISOR_MOBILE)
    expect(clientRow?.recipient_mobile).toBe(CONSENTING_MOBILE)
  })

  it('queues the advisor only for an externally managed holding', async () => {
    await runReminderSweep(admin, TODAY)

    // The cross-sell path. The client must never be told about a policy the
    // advisor does not manage, regardless of consent — this member has
    // consented, and still gets nothing.
    const rows = await logRowsFor(dueExternalId)
    expect(rows.map((r) => r.recipient_type)).toEqual(['advisor'])
    expect(rows[0]?.recipient_mobile).toBe(ADVISOR_MOBILE)
  })

  it('queues the advisor only when the member has not consented', async () => {
    await runReminderSweep(admin, TODAY)

    const rows = await logRowsFor(dueNoConsentId)
    expect(rows.map((r) => r.recipient_type)).toEqual(['advisor'])
    expect(rows[0]?.recipient_mobile).toBe(ADVISOR_MOBILE)
  })

  it('queues nothing when no recipient can be reached', async () => {
    await runReminderSweep(admin, TODAY)

    // External holding, and the owning advisor's profile has no mobile: no
    // recipient exists, so nothing should be written at all.
    const rows = await logRowsFor(dueUnreachableId)
    expect(rows).toHaveLength(0)
  })

  it('does not queue for a holding with reminders disabled', async () => {
    await runReminderSweep(admin, TODAY)

    const rows = await logRowsFor(dueDisabledId)
    expect(rows).toHaveLength(0)
  })

  it('catches up a reminder window whose activation day was never swept', async () => {
    // The first sweep call here does not land on the 30-day window's
    // activation day (that would be 30 days before the due date) — it lands
    // ten days after it, at 20 days remaining, as if every run in between
    // had been missed. A window that only fired on its exact activation day
    // would lose this reminder entirely; firedWindows keeps it firing until
    // the due date passes, which is the property this test actually pins.
    const family = await insertFamily('Sweep fixture — catch-up', advisorId)
    const member = await insertMember(family, 'Catch-up client', '+919876500005', true)
    const holdingId = await insertHolding({
      familyId: family,
      memberId: member,
      managedBy: 'self',
      label: 'Missed-activation-day plan',
      remindersEnabled: true,
    })
    const FIRST_SWEEP_DAY = '2026-03-01'
    const DUE_DATE = '2026-03-21' // 20 days out on the first (and only) sweep call
    const dueInstanceId = await insertDueInstance(holdingId, DUE_DATE)

    await runReminderSweep(admin, FIRST_SWEEP_DAY)

    const rows = await logRowsFor(dueInstanceId)
    expect(rows.filter((r) => r.days_before === 30)).toHaveLength(2) // advisor + client
    expect(rows.map((r) => r.recipient_type).sort()).toEqual(['advisor', 'client'])
  })

  it('does not re-queue a window already logged when swept again on a later day', async () => {
    // Self-contained: its own fixture, its own two sweep calls, so this
    // assertion does not depend on rows a previous test happened to leave
    // behind. Day one fires the 30-day window (25 days remaining); day two
    // is a week later, still short of the 15-day window (18 days remaining),
    // so no new window is introduced — any growth in the day-30 rows here
    // can only be a duplicate.
    const family = await insertFamily('Sweep fixture — no requeue on a later day', advisorId)
    const member = await insertMember(family, 'No-requeue client', '+919876500006', true)
    const holdingId = await insertHolding({
      familyId: family,
      memberId: member,
      managedBy: 'self',
      label: 'No-requeue plan',
      remindersEnabled: true,
    })
    const DAY_ONE = '2026-04-01'
    const DAY_TWO = '2026-04-08' // one week later
    const DUE_DATE = '2026-04-26' // 25 days out on day one, 18 on day two
    const dueInstanceId = await insertDueInstance(holdingId, DUE_DATE)

    await runReminderSweep(admin, DAY_ONE)
    const afterDayOne = await logRowsFor(dueInstanceId)
    expect(afterDayOne.filter((r) => r.days_before === 30)).toHaveLength(2)

    await runReminderSweep(admin, DAY_TWO)
    const afterDayTwo = await logRowsFor(dueInstanceId)
    expect(afterDayTwo.filter((r) => r.days_before === 30)).toHaveLength(2)
  })

  it('is idempotent across repeated runs on the same day', async () => {
    // Its own fixture too: the baseline it compares against must come from
    // this test's own first run, not from whatever a sibling test left in
    // the log.
    const family = await insertFamily('Sweep fixture — same-day idempotency', advisorId)
    const member = await insertMember(family, 'Idempotency client', '+919876500007', true)
    const holdingId = await insertHolding({
      familyId: family,
      memberId: member,
      managedBy: 'self',
      label: 'Idempotency plan',
      remindersEnabled: true,
    })
    const DAY = '2026-05-01'
    const DUE_DATE = '2026-05-31' // 30 days out
    const dueInstanceId = await insertDueInstance(holdingId, DUE_DATE)

    await runReminderSweep(admin, DAY)
    const before = await logRowsFor(dueInstanceId)
    expect(before.length).toBeGreaterThan(0)

    await runReminderSweep(admin, DAY)
    expect(await logRowsFor(dueInstanceId)).toHaveLength(before.length)
  })

  it('queues a day-of reminder for a holding whose only rule is {0}', async () => {
    // reminder_rules_days_before_non_negative allows 0 ("remind on the due
    // date itself"), and a per-holding override of {0} replaces the
    // category default outright (windowsFor prefers byHolding over
    // byCategory). Note this cannot, on its own, distinguish the fixed sweep
    // from the one it replaced: the seeded life_insurance/general_insurance/
    // mutual_fund/fixed_income category defaults are permanently active at
    // {30,15} and must not be touched by any test, so the table's true
    // global maxWindow is always >= 30 here regardless of this holding's own
    // rule — the old widest === 0 short-circuit was therefore never reached
    // by this fixture either, before or after the fix. What this test does
    // pin is that the {0} pipeline itself — windowsFor preferring the
    // override, firedWindows firing a 0-day window on the due date, routing,
    // and the insert — works end to end, given a live table whose global
    // maxWindow is already nonzero. It cannot reach the short-circuit branch
    // itself; the mocked test below ("queues a day-of reminder when the
    // sweep sees only {0} rules") does that by controlling what
    // loadReminderRules returns rather than what the shared table contains.
    const family = await insertFamily('Sweep fixture — zero-day window', advisorId)
    const member = await insertMember(family, 'Zero-day client', '+919876500008', true)
    const holdingId = await insertHolding({
      familyId: family,
      memberId: member,
      managedBy: 'self',
      label: 'Day-of reminder plan',
      remindersEnabled: true,
    })
    await insertHoldingRule(holdingId, [0])

    const ZERO_DAY = '2026-06-01'
    const dueInstanceId = await insertDueInstance(holdingId, ZERO_DAY) // due today

    await runReminderSweep(admin, ZERO_DAY)

    const rows = await logRowsFor(dueInstanceId)
    expect(rows.map((r) => r.recipient_type).sort()).toEqual(['advisor', 'client'])
    expect(rows.every((r) => r.days_before === 0)).toBe(true)
  })

  it('queues a day-of reminder when the sweep sees only {0} rules', async () => {
    // Pins the sweep's actual use of hasActiveRules, not just the helper in
    // isolation. The live reminder_rules table can never exercise this: the
    // four seeded category defaults are permanently active at {30,15} and
    // off limits to mutate, so the real global maxWindow is always >= 30 no
    // matter what any fixture's own holding override says — see the note on
    // the test above. Overriding loadReminderRules for this one call is the
    // only way to make the sweep see a RuleSet whose sole entry is {0},
    // without touching that shared table. maxWindow itself is untouched —
    // this is the real implementation applied to the mocked data, so the
    // test exercises the sweep's actual decision (hasActiveRules), not a
    // stubbed arithmetic result.
    const family = await insertFamily('Sweep fixture — hasActiveRules short-circuit', advisorId)
    const member = await insertMember(family, 'Short-circuit client', '+919876500009', true)
    const holdingId = await insertHolding({
      familyId: family,
      memberId: member,
      managedBy: 'self',
      label: 'Short-circuit plan',
      remindersEnabled: true,
    })
    const ZERO_DAY = '2026-07-01'
    const dueInstanceId = await insertDueInstance(holdingId, ZERO_DAY) // due today

    const mockedLoadReminderRules = vi.mocked(loadReminderRules)
    mockedLoadReminderRules.mockImplementationOnce(async () => ({
      byCategory: new Map([['life_insurance', [0]]]),
      byHolding: new Map(),
    }))

    await runReminderSweep(admin, ZERO_DAY)

    const rows = await logRowsFor(dueInstanceId)
    expect(rows.map((r) => r.recipient_type).sort()).toEqual(['advisor', 'client'])
    expect(rows.every((r) => r.days_before === 0)).toBe(true)
  })
})

describe('hasActiveRules', () => {
  // maxWindow's 0 is ambiguous by construction: it is a width, not a
  // presence flag, and cannot tell "no rule exists" apart from "every active
  // rule is legitimately {0}". The sweep used to treat both the same way —
  // short-circuiting before touching the database — which silently stops
  // every day-of reminder the moment a category (or holding) is configured
  // with nothing but {0}. This is a pure-function pin of the distinction the
  // fix actually depends on: it fails to compile against the pre-fix
  // sweep.ts (hasActiveRules did not exist), and cannot be satisfied by
  // reading the live table either, since the seeded category defaults keep
  // the real global maxWindow at >= 30 regardless of what this suite adds —
  // see the note on the {0}-holding integration test above.
  it('is false when no active rule exists anywhere', () => {
    const empty: RuleSet = { byCategory: new Map(), byHolding: new Map() }
    expect(hasActiveRules(empty)).toBe(false)
    expect(maxWindow(empty)).toBe(0)
  })

  it('is true when every active rule is legitimately {0}, despite maxWindow also reporting 0', () => {
    const zeroOnly: RuleSet = {
      byCategory: new Map([['life_insurance', [0]]]),
      byHolding: new Map([['some-holding-id', [0]]]),
    }
    expect(hasActiveRules(zeroOnly)).toBe(true)
    expect(maxWindow(zeroOnly)).toBe(0) // the same value as the empty case above
  })
})
