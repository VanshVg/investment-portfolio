import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminClient, ensureUser } from '../helpers/db'
import { ensureDueInstances } from '@/lib/reminders/ensure-due-instances'
import { reconcileDueInstances } from '@/lib/reminders/reconcile'
import type { SupabaseClient } from '@supabase/supabase-js'

const EMAIL = 'reconcile-due-admin@example.test'
const PASSWORD = 'test-password-123'

// Reconciliation runs from the save path and the daily job, both server-side
// with elevated privilege, so the service-role client stands in for both
// "arrange fixtures" and "the thing under test" — matching
// ensure-due-instances.test.ts, the module this one builds directly on.
const admin: SupabaseClient = adminClient()

// Matches the horizon shape the real callers use (a fixed number of months
// out from today).
const THROUGH = '2027-10-06'

// A date safely in the past relative to any plausible run of this suite.
const PAST_PRISTINE_DATE = '2025-01-01'

let familyId: string
let scheduleHoldingId: string
let paidHoldingId: string
let noteHoldingId: string
let reminderHoldingId: string
let pastHoldingId: string
let countsHoldingId: string

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

/** A fresh annual holding due 2026-10-01, with its first two instances generated. */
async function newScheduledHolding(label: string): Promise<string> {
  const { data: holding, error } = await admin
    .from('holdings')
    .insert({
      family_id: familyId,
      category: 'life_insurance',
      label,
      periodic_amount: 25_000,
      anchor_due_date: '2026-10-01',
      next_due_date: '2026-10-01',
      due_frequency: 'annual',
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  const id = holding!.id as string
  // 2026-10-01 and 2027-10-01 within THROUGH.
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
    await rescheduleTo(scheduleHoldingId, '2026-11-01')

    // Scenario 2: a future instance carrying a payment status — kept, flagged.
    paidHoldingId = await newScheduledHolding('Paid off-schedule plan')
    const { error: paidError } = await admin
      .from('due_instances')
      .update({ payment_status: 'paid', paid_on: '2027-10-01' })
      .eq('holding_id', paidHoldingId)
      .eq('due_date', '2027-10-01')
    if (paidError) throw new Error(paidError.message)
    await rescheduleTo(paidHoldingId, '2026-11-01')

    // Scenario 3: a future instance carrying a note — kept, flagged.
    noteHoldingId = await newScheduledHolding('Noted off-schedule plan')
    const { error: noteError } = await admin
      .from('due_instances')
      .update({ note: 'Called client, asked to confirm renewal date.' })
      .eq('holding_id', noteHoldingId)
      .eq('due_date', '2027-10-01')
    if (noteError) throw new Error(noteError.message)
    await rescheduleTo(noteHoldingId, '2026-11-01')

    // Scenario 4: a future instance with a logged reminder — kept, flagged.
    reminderHoldingId = await newScheduledHolding('Reminded off-schedule plan')
    const { data: reminderInstance, error: reminderInstanceError } = await admin
      .from('due_instances')
      .select('id')
      .eq('holding_id', reminderHoldingId)
      .eq('due_date', '2027-10-01')
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
    await rescheduleTo(reminderHoldingId, '2026-11-01')

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
        anchor_due_date: '2026-10-01',
        next_due_date: '2026-10-01',
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
    await rescheduleTo(pastHoldingId, '2026-11-01')

    // Scenario 7: counts. A fresh holding, rescheduled the same way, so the
    // run under test both deletes and creates.
    countsHoldingId = await newScheduledHolding('Counts plan')
    await rescheduleTo(countsHoldingId, '2026-11-01')
  })

  it('deletes a future pristine instance that left the schedule', async () => {
    await reconcileDueInstances(admin, scheduleHoldingId, THROUGH)
    expect(await datesFor(scheduleHoldingId)).not.toContain('2027-10-01')
  })

  it('keeps a future instance carrying a payment status, and marks it off-schedule', async () => {
    await reconcileDueInstances(admin, paidHoldingId, THROUGH)
    expect(await offScheduleFor(paidHoldingId, '2027-10-01')).toBe(true)
    expect(await statusFor(paidHoldingId, '2027-10-01')).toBe('paid')
  })

  it('keeps a future instance carrying a note, and marks it off-schedule', async () => {
    await reconcileDueInstances(admin, noteHoldingId, THROUGH)
    const instance = await instanceFor(noteHoldingId, '2027-10-01')
    expect(instance.off_schedule).toBe(true)
    // Evidence intact, not merely "present": the note that made it evidence
    // in the first place must survive alongside the flag.
    expect(instance.note).toBe('Called client, asked to confirm renewal date.')
  })

  it('keeps a future instance with a logged reminder, and marks it off-schedule', async () => {
    await reconcileDueInstances(admin, reminderHoldingId, THROUGH)
    const instance = await instanceFor(reminderHoldingId, '2027-10-01')
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
    expect(await datesFor(scheduleHoldingId)).toContain('2026-11-01')
  })

  it('reports counts that add up', async () => {
    const result = await reconcileDueInstances(admin, countsHoldingId, THROUGH)
    expect(result.deleted).toBeGreaterThan(0)
    expect(result.created).toBeGreaterThan(0)
  })
})
