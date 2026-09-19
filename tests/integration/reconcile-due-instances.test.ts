import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminClient, ensureUser } from '../helpers/db'
import { ensureDueInstances } from '@/lib/reminders/ensure-due-instances'
import { reconcileDueInstances } from '@/lib/reminders/reconcile'
import { horizonFrom } from '@/lib/reminders/horizon'
import { addDays, addMonths, addYears } from 'date-fns'
import { fromISODate, toISODate, todayInIndia } from '@/lib/domain/dates'
import type { SupabaseClient } from '@supabase/supabase-js'
import { JUST_AFTER_IST_MIDNIGHT, UTC_DATE_AT_THAT_INSTANT, onUtcHostAt } from '../helpers/clock'

const EMAIL = 'reconcile-due-admin@example.test'
const PASSWORD = 'test-password-123'

// Reconciliation runs from the save path and the daily job, both server-side
// with elevated privilege, so the service-role client stands in for both
// "arrange fixtures" and "the thing under test" — matching
// ensure-due-instances.test.ts, the module this one builds directly on.
const admin: SupabaseClient = adminClient()

// Computed the same way the implementation computes "today", rather than a
// hardcoded literal, so the boundary tests below (today vs. yesterday) can't
// drift out of alignment with the boundary they exist to pin.
const TODAY = todayInIndia()
const YESTERDAY = toISODate(addDays(fromISODate(TODAY)!, -1))

// Matches the horizon shape the real callers use (a fixed number of months
// out from today) — derived from TODAY via the real horizon function.
const THROUGH = horizonFrom(TODAY)

// A year in the past relative to whenever this suite runs, so it stays
// safely in the past no matter how long the suite goes unrun.
const PAST_PRISTINE_DATE = toISODate(addYears(fromISODate(TODAY)!, -1))

// Far enough beyond THROUGH that a holding rescheduled to it always has an
// empty wanted schedule, regardless of what "today" happens to be when this
// suite runs — the boundary tests below need the old instance to be
// unambiguously off-schedule, not just off by coincidence of date.
const FAR_FUTURE_ANCHOR = toISODate(addYears(fromISODate(TODAY)!, 5))

// The initial schedule several fixtures below start from: two weeks out (so
// comfortably inside THROUGH) with its annual occurrence a year later (still
// comfortably inside THROUGH) — a schedule the fixtures then move away from.
const INITIAL_ANCHOR = toISODate(addDays(fromISODate(TODAY)!, 14))
const INITIAL_SECOND = toISODate(addMonths(fromISODate(INITIAL_ANCHOR)!, 12))

// The corrected schedule those fixtures are rescheduled to — far enough past
// INITIAL_ANCHOR/INITIAL_SECOND to sit on a clearly distinct grid, and still
// comfortably inside THROUGH.
const RESCHEDULED_ANCHOR = toISODate(addDays(fromISODate(TODAY)!, 45))

let familyId: string
let scheduleHoldingId: string
let paidHoldingId: string
let noteHoldingId: string
let reminderHoldingId: string
let pastHoldingId: string
let countsHoldingId: string
let dueTodayHoldingId: string
let dueYesterdayHoldingId: string

// Cascades away the shared fixture family, taking every holding, due
// instance and reminder_log row created against it with it, so repeated
// local runs don't accumulate orphaned fixture data. Guarded so a failure
// during setup (familyId never assigned) can't throw here and mask the real
// failure that happened earlier.
afterAll(async () => {
  if (!familyId) return
  const { error } = await admin.from('families').delete().in('id', [familyId])
  if (error) throw new Error(`fixture cleanup failed: ${error.message}`)
})

async function datesFor(holdingId: string): Promise<string[]> {
  const { data, error } = await admin
    .from('due_instances')
    .select('due_date')
    .eq('holding_id', holdingId)
    .order('due_date')
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => row.due_date)
}

async function instanceFor(holdingId: string, dueDate: string) {
  const { data, error } = await admin
    .from('due_instances')
    .select('id, payment_status, note, off_schedule')
    .eq('holding_id', holdingId)
    .eq('due_date', dueDate)
    .single()
  if (error) throw new Error(error.message)
  return data!
}

async function offScheduleFor(holdingId: string, dueDate: string): Promise<boolean> {
  return (await instanceFor(holdingId, dueDate)).off_schedule
}

async function statusFor(holdingId: string, dueDate: string): Promise<string> {
  return (await instanceFor(holdingId, dueDate)).payment_status
}

/** A fresh annual holding due INITIAL_ANCHOR, with its first two instances generated. */
async function newScheduledHolding(label: string): Promise<string> {
  const { data: holding, error } = await admin
    .from('holdings')
    .insert({
      family_id: familyId,
      category: 'life_insurance',
      label,
      periodic_amount: 25_000,
      anchor_due_date: INITIAL_ANCHOR,
      next_due_date: INITIAL_ANCHOR,
      due_frequency: 'annual',
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  const id = holding!.id as string
  // INITIAL_ANCHOR and INITIAL_SECOND, both within THROUGH.
  await ensureDueInstances(admin, id, THROUGH)
  return id
}

/** Corrects a holding's schedule so its previously generated dates fall off it. */
async function rescheduleTo(holdingId: string, anchor: string): Promise<void> {
  const { error } = await admin
    .from('holdings')
    .update({ anchor_due_date: anchor, next_due_date: anchor })
    .eq('id', holdingId)
  if (error) throw new Error(error.message)
}

describe('reconcileDueInstances', () => {
  beforeAll(async () => {
    const user = await ensureUser(EMAIL, PASSWORD, 'admin')

    const { data: family, error: familyError } = await admin
      .from('families')
      .insert({ name: 'Reconcile due instances fixture', owner_advisor_id: user!.id })
      .select()
      .single()
    if (familyError) throw new Error(familyError.message)
    familyId = family!.id

    // Scenario 1 & 6: a pristine future instance that leaves the schedule —
    // deleted, and the new schedule's date takes its place.
    scheduleHoldingId = await newScheduledHolding('Pristine reschedule plan')
    await rescheduleTo(scheduleHoldingId, RESCHEDULED_ANCHOR)

    // Scenario 2: a future instance carrying a payment status — kept, flagged.
    paidHoldingId = await newScheduledHolding('Paid off-schedule plan')
    const { error: paidError } = await admin
      .from('due_instances')
      .update({ payment_status: 'paid', paid_on: INITIAL_SECOND })
      .eq('holding_id', paidHoldingId)
      .eq('due_date', INITIAL_SECOND)
    if (paidError) throw new Error(paidError.message)
    await rescheduleTo(paidHoldingId, RESCHEDULED_ANCHOR)

    // Scenario 3: a future instance carrying a note — kept, flagged.
    noteHoldingId = await newScheduledHolding('Noted off-schedule plan')
    const { error: noteError } = await admin
      .from('due_instances')
      .update({ note: 'Called client, asked to confirm renewal date.' })
      .eq('holding_id', noteHoldingId)
      .eq('due_date', INITIAL_SECOND)
    if (noteError) throw new Error(noteError.message)
    await rescheduleTo(noteHoldingId, RESCHEDULED_ANCHOR)

    // Scenario 4: a future instance with a logged reminder — kept, flagged.
    reminderHoldingId = await newScheduledHolding('Reminded off-schedule plan')
    const { data: reminderInstance, error: reminderInstanceError } = await admin
      .from('due_instances')
      .select('id')
      .eq('holding_id', reminderHoldingId)
      .eq('due_date', INITIAL_SECOND)
      .single()
    if (reminderInstanceError) throw new Error(reminderInstanceError.message)
    const { error: logError } = await admin.from('reminder_log').insert({
      due_instance_id: reminderInstance!.id,
      days_before: 30,
      recipient_type: 'advisor',
      recipient_mobile: '+919000000001',
      channel: 'whatsapp',
      status: 'sent',
    })
    if (logError) throw new Error(logError.message)
    await rescheduleTo(reminderHoldingId, RESCHEDULED_ANCHOR)

    // Scenario 5: a past pristine instance, off any schedule — must never be
    // touched. Inserted directly: due_instances need not sit on the anchor
    // grid, and this is the one case that must never reach the candidate set
    // at all, regardless of what "pristine" or "off-schedule" would say about it.
    const { data: pastHolding, error: pastHoldingError } = await admin
      .from('holdings')
      .insert({
        family_id: familyId,
        category: 'life_insurance',
        label: 'Past instance plan',
        periodic_amount: 25_000,
        anchor_due_date: INITIAL_ANCHOR,
        next_due_date: INITIAL_ANCHOR,
        due_frequency: 'annual',
      })
      .select()
      .single()
    if (pastHoldingError) throw new Error(pastHoldingError.message)
    pastHoldingId = pastHolding!.id
    const { error: pastInstanceError } = await admin
      .from('due_instances')
      .insert({ holding_id: pastHoldingId, due_date: PAST_PRISTINE_DATE, amount_due: 25_000 })
    if (pastInstanceError) throw new Error(pastInstanceError.message)
    await rescheduleTo(pastHoldingId, RESCHEDULED_ANCHOR)

    // Scenario 7: counts. A fresh holding, rescheduled the same way, so the
    // run under test both deletes and creates.
    countsHoldingId = await newScheduledHolding('Counts plan')
    await rescheduleTo(countsHoldingId, RESCHEDULED_ANCHOR)

    // Boundary: Decision 3 defines past as strictly due_date < today, so an
    // instance due exactly today is not past and stays eligible for
    // reconciliation, while one due yesterday is past and must never be
    // touched. one_time keeps each holding down to the single instance the
    // boundary is about, so no unrelated recurrence can pass or fail the
    // assertion by coincidence.
    const { data: dueTodayHolding, error: dueTodayError } = await admin
      .from('holdings')
      .insert({
        family_id: familyId,
        category: 'life_insurance',
        label: 'Due today boundary plan',
        periodic_amount: 25_000,
        anchor_due_date: TODAY,
        next_due_date: TODAY,
        due_frequency: 'one_time',
      })
      .select()
      .single()
    if (dueTodayError) throw new Error(dueTodayError.message)
    dueTodayHoldingId = dueTodayHolding!.id
    await ensureDueInstances(admin, dueTodayHoldingId, THROUGH)
    await rescheduleTo(dueTodayHoldingId, FAR_FUTURE_ANCHOR)

    const { data: dueYesterdayHolding, error: dueYesterdayError } = await admin
      .from('holdings')
      .insert({
        family_id: familyId,
        category: 'life_insurance',
        label: 'Due yesterday boundary plan',
        periodic_amount: 25_000,
        anchor_due_date: YESTERDAY,
        next_due_date: YESTERDAY,
        due_frequency: 'one_time',
      })
      .select()
      .single()
    if (dueYesterdayError) throw new Error(dueYesterdayError.message)
    dueYesterdayHoldingId = dueYesterdayHolding!.id
    await ensureDueInstances(admin, dueYesterdayHoldingId, THROUGH)
    await rescheduleTo(dueYesterdayHoldingId, FAR_FUTURE_ANCHOR)
  })

  it('deletes a future pristine instance that left the schedule', async () => {
    await reconcileDueInstances(admin, scheduleHoldingId, THROUGH)
    expect(await datesFor(scheduleHoldingId)).not.toContain(INITIAL_SECOND)
  })

  it('keeps a future instance carrying a payment status, and marks it off-schedule', async () => {
    await reconcileDueInstances(admin, paidHoldingId, THROUGH)
    expect(await offScheduleFor(paidHoldingId, INITIAL_SECOND)).toBe(true)
    expect(await statusFor(paidHoldingId, INITIAL_SECOND)).toBe('paid')
  })

  it('keeps a future instance carrying a note, and marks it off-schedule', async () => {
    await reconcileDueInstances(admin, noteHoldingId, THROUGH)
    const instance = await instanceFor(noteHoldingId, INITIAL_SECOND)
    expect(instance.off_schedule).toBe(true)
    // Evidence intact, not merely "present": the note that made it evidence
    // in the first place must survive alongside the flag.
    expect(instance.note).toBe('Called client, asked to confirm renewal date.')
  })

  it('keeps a future instance with a logged reminder, and marks it off-schedule', async () => {
    await reconcileDueInstances(admin, reminderHoldingId, THROUGH)
    const instance = await instanceFor(reminderHoldingId, INITIAL_SECOND)
    expect(instance.off_schedule).toBe(true)

    // Evidence intact: the logged reminder that made this instance
    // non-pristine must still be there, not cascaded away by a mistaken
    // delete-then-recreate.
    const { data: logs, error } = await admin
      .from('reminder_log')
      .select('id')
      .eq('due_instance_id', instance.id)
    if (error) throw new Error(error.message)
    expect(logs).toHaveLength(1)
  })

  it('never deletes a past instance, even a pristine one off the new schedule', async () => {
    // This is the assertion that protects payment history. If it ever fails,
    // stop and do not "fix" it by changing the expectation.
    await reconcileDueInstances(admin, pastHoldingId, THROUGH)
    expect(await datesFor(pastHoldingId)).toContain(PAST_PRISTINE_DATE)
  })

  it('generates the new schedule after clearing the old', async () => {
    await reconcileDueInstances(admin, scheduleHoldingId, THROUGH)
    expect(await datesFor(scheduleHoldingId)).toContain(RESCHEDULED_ANCHOR)
  })

  it('reports counts that add up', async () => {
    const result = await reconcileDueInstances(admin, countsHoldingId, THROUGH)
    expect(result.deleted).toBeGreaterThan(0)
    expect(result.created).toBeGreaterThan(0)
  })

  // These two pin the past/not-past boundary from both sides — either one
  // alone would also pass against a boundary shifted a day in the wrong
  // direction, since only one of the two dates would land wrong.
  it('deletes a pristine instance due exactly today, since today is not past', async () => {
    await reconcileDueInstances(admin, dueTodayHoldingId, THROUGH)
    expect(await datesFor(dueTodayHoldingId)).not.toContain(TODAY)
  })

  it('never touches a pristine instance due yesterday, since yesterday is past', async () => {
    await reconcileDueInstances(admin, dueYesterdayHoldingId, THROUGH)
    expect(await datesFor(dueYesterdayHoldingId)).toContain(YESTERDAY)
  })

  // Just after IST midnight a UTC server still reads yesterday's date. "Past"
  // is judged by the advisor's calendar, so the instance due on the IST
  // yesterday is past and must survive, even though the UTC date says today.
  it('treats the IST yesterday as past on a UTC host just after IST midnight', async () => {
    const { data: holding, error } = await admin
      .from('holdings')
      .insert({
        family_id: familyId,
        category: 'life_insurance',
        label: 'IST boundary reconcile plan',
        periodic_amount: 25_000,
        anchor_due_date: UTC_DATE_AT_THAT_INSTANT,
        next_due_date: UTC_DATE_AT_THAT_INSTANT,
        due_frequency: 'one_time',
      })
      .select()
      .single()
    if (error) throw new Error(error.message)
    const id = holding!.id as string
    await ensureDueInstances(admin, id, THROUGH)
    await rescheduleTo(id, FAR_FUTURE_ANCHOR)

    await onUtcHostAt(JUST_AFTER_IST_MIDNIGHT, () => reconcileDueInstances(admin, id, THROUGH))
    expect(await datesFor(id)).toContain(UTC_DATE_AT_THAT_INSTANT)
  })
})
