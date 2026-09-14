import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminClient, ensureUser } from '../helpers/db'
import { runReminderSweep } from '@/lib/reminders/sweep'
import type { SupabaseClient } from '@supabase/supabase-js'

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

// The catch-up scenario needs its own pair of dates: day one lands exactly on
// the 30-day window, day two is one day later so only the 30-day window is
// still eligible (29 days remaining satisfies <=30 but not <=15) — proving
// catch-up without also proving something about the 15-day window.
const CATCHUP_DAY_ONE = '2026-09-06'
const CATCHUP_DAY_TWO = '2026-09-07'
const CATCHUP_DUE = '2026-10-06'

let advisorId: string
let unreachableAdvisorId: string

let dueSelfId: string
let dueExternalId: string
let dueNoConsentId: string
let dueDisabledId: string
let dueUnreachableId: string
let dueCatchupId: string

const CONSENTING_MOBILE = '+919876500001'
const EXTERNAL_MEMBER_MOBILE = '+919876500003'
const CATCHUP_MEMBER_MOBILE = '+919876500005'

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

    // Family C: a dedicated holding for the catch-up / idempotency scenarios,
    // isolated from the routing fixtures above so those tests' repeated
    // sweep runs at different "today" values can't interact with them.
    const familyC = await insertFamily('Sweep fixture — catch-up', advisorId)
    const catchupMember = await insertMember(
      familyC,
      'Catch-up client',
      CATCHUP_MEMBER_MOBILE,
      true,
    )
    const catchupHoldingId = await insertHolding({
      familyId: familyC,
      memberId: catchupMember,
      managedBy: 'self',
      label: 'Catch-up plan',
      remindersEnabled: true,
    })
    dueCatchupId = await insertDueInstance(catchupHoldingId, CATCHUP_DUE)
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

  it('catches up a missed day without double-queueing', async () => {
    await runReminderSweep(admin, CATCHUP_DAY_ONE) // 30-day window fires
    await runReminderSweep(admin, CATCHUP_DAY_TWO) // both 30 and 15 evaluated again

    const rows = await logRowsFor(dueCatchupId)
    expect(rows.filter((r) => r.days_before === 30)).toHaveLength(2) // advisor + client, once each
    expect(rows.map((r) => r.recipient_type).sort()).toEqual(['advisor', 'client'])
  })

  it('is idempotent across repeated runs on the same day', async () => {
    const before = await logRowsFor(dueCatchupId)
    await runReminderSweep(admin, CATCHUP_DAY_ONE)
    expect(await logRowsFor(dueCatchupId)).toHaveLength(before.length)
  })
})
