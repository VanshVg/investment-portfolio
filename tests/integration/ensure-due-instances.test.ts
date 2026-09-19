import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminClient, ensureUser } from '../helpers/db'
import { ensureDueInstances } from '@/lib/reminders/ensure-due-instances'
import { addMonths } from 'date-fns'
import { fromISODate, toISODate, todayInIndia } from '@/lib/domain/dates'
import type { SupabaseClient } from '@supabase/supabase-js'
import { JUST_AFTER_IST_MIDNIGHT, UTC_DATE_AT_THAT_INSTANT, onUtcHostAt } from '../helpers/clock'

const EMAIL = 'ensure-due-admin@example.test'
const PASSWORD = 'test-password-123'

// The routine under test is meant to run with elevated privilege (the save
// path and the daily job both call it server-side), so the service-role
// client stands in for both "arrange fixtures" and "the thing under test".
const admin: SupabaseClient = adminClient()

// A single horizon shared across the whole-window tests, matching the shape
// the real callers use ("through" a fixed number of months out).
const THROUGH = '2027-10-06'

// Computed the same way the implementation computes "today", rather than a
// hardcoded literal, so the "due exactly today" case below can't drift out
// of alignment with the boundary it is testing.
const TODAY = todayInIndia()

let familyId: string
let holdingId: string
let monthlyHoldingId: string
let refreshHoldingId: string
let touchedHoldingId: string
let offScheduleHoldingId: string
let dueTodayHoldingId: string
let undatedHoldingId: string

// Cascades away the shared fixture family, taking every holding and due
// instance created against it with it, so repeated local runs don't
// accumulate orphaned fixture data.
afterAll(async () => {
  if (!familyId) return
  await admin.from('families').delete().in('id', [familyId])
})

async function amountFor(id: string, dueDate: string): Promise<number | null> {
  const { data, error } = await admin
    .from('due_instances')
    .select('amount_due')
    .eq('holding_id', id)
    .eq('due_date', dueDate)
    .single()
  if (error) throw new Error(error.message)
  return data?.amount_due ?? null
}

async function instanceFor(id: string, dueDate: string) {
  const { data, error } = await admin
    .from('due_instances')
    .select('amount_due, payment_status, note, off_schedule')
    .eq('holding_id', id)
    .eq('due_date', dueDate)
    .single()
  if (error) throw new Error(error.message)
  return data!
}

describe('ensureDueInstances', () => {
  beforeAll(async () => {
    const user = await ensureUser(EMAIL, PASSWORD, 'admin')

    const { data: family, error: familyError } = await admin
      .from('families')
      .insert({ name: 'Ensure due instances fixture', owner_advisor_id: user!.id })
      .select()
      .single()
    if (familyError) throw new Error(familyError.message)
    familyId = family!.id

    const { data: annual, error: annualError } = await admin
      .from('holdings')
      .insert({
        family_id: familyId,
        category: 'life_insurance',
        label: 'Annual term plan',
        periodic_amount: 25_000,
        anchor_due_date: '2026-10-01',
        next_due_date: '2026-10-01',
        due_frequency: 'annual',
      })
      .select()
      .single()
    if (annualError) throw new Error(annualError.message)
    holdingId = annual!.id

    const { data: monthly, error: monthlyError } = await admin
      .from('holdings')
      .insert({
        family_id: familyId,
        category: 'mutual_fund',
        label: 'Monthly SIP',
        periodic_amount: 5_000,
        anchor_due_date: '2015-01-05',
        next_due_date: '2026-09-05',
        due_frequency: 'monthly',
      })
      .select()
      .single()
    if (monthlyError) throw new Error(monthlyError.message)
    monthlyHoldingId = monthly!.id

    const { data: refreshHolding, error: refreshError } = await admin
      .from('holdings')
      .insert({
        family_id: familyId,
        category: 'life_insurance',
        label: 'Refresh candidate plan',
        periodic_amount: 25_000,
        anchor_due_date: '2027-10-01',
        next_due_date: '2027-10-01',
        due_frequency: 'annual',
      })
      .select()
      .single()
    if (refreshError) throw new Error(refreshError.message)
    refreshHoldingId = refreshHolding!.id

    const { data: touchedHolding, error: touchedError } = await admin
      .from('holdings')
      .insert({
        family_id: familyId,
        category: 'life_insurance',
        label: 'Touched plan',
        periodic_amount: 25_000,
        anchor_due_date: '2027-10-01',
        next_due_date: '2027-10-01',
        due_frequency: 'annual',
      })
      .select()
      .single()
    if (touchedError) throw new Error(touchedError.message)
    touchedHoldingId = touchedHolding!.id

    const { data: offScheduleHolding, error: offScheduleError } = await admin
      .from('holdings')
      .insert({
        family_id: familyId,
        category: 'life_insurance',
        label: 'Off-schedule plan',
        periodic_amount: 25_000,
        anchor_due_date: '2027-10-01',
        next_due_date: '2027-10-01',
        due_frequency: 'annual',
      })
      .select()
      .single()
    if (offScheduleError) throw new Error(offScheduleError.message)
    offScheduleHoldingId = offScheduleHolding!.id

    const { data: dueTodayHolding, error: dueTodayError } = await admin
      .from('holdings')
      .insert({
        family_id: familyId,
        category: 'life_insurance',
        label: 'Due today plan',
        periodic_amount: 10_000,
        anchor_due_date: TODAY,
        next_due_date: TODAY,
        // one_time: a single occurrence, so this fixture can assert an exact
        // refreshed count without an unrelated future annual recurrence
        // (anchor + 1 year) also matching the refresh filter.
        due_frequency: 'one_time',
      })
      .select()
      .single()
    if (dueTodayError) throw new Error(dueTodayError.message)
    dueTodayHoldingId = dueTodayHolding!.id

    const { data: undatedHolding, error: undatedError } = await admin
      .from('holdings')
      .insert({
        family_id: familyId,
        category: 'mutual_fund',
        label: 'Undated plan',
        periodic_amount: 5_000,
      })
      .select()
      .single()
    if (undatedError) throw new Error(undatedError.message)
    undatedHoldingId = undatedHolding!.id
  })

  it('creates one instance per scheduled date in the window', async () => {
    const result = await ensureDueInstances(admin, holdingId, THROUGH)
    expect(result.created).toBe(2) // 2026-10-01 and 2027-10-01
  })

  it('is a no-op on a second run', async () => {
    await ensureDueInstances(admin, holdingId, THROUGH)
    const second = await ensureDueInstances(admin, holdingId, THROUGH)
    expect(second.created).toBe(0)
    // Rows the first run already brought in line must not be re-matched by
    // the amount refresh or the off_schedule clear on a steady-state rerun.
    expect(second.refreshed).toBe(0)
    expect(second.offScheduleCleared).toBe(0)
  })

  it('does not invent instances before next_due_date', async () => {
    await ensureDueInstances(admin, monthlyHoldingId, THROUGH)
    const { data, error } = await admin
      .from('due_instances')
      .select('due_date')
      .eq('holding_id', monthlyHoldingId)
      .order('due_date')
    if (error) throw new Error(error.message)
    expect(data![0].due_date).toBe('2026-09-05')
  })

  it('refreshes the amount on a future pristine instance', async () => {
    await ensureDueInstances(admin, refreshHoldingId, THROUGH)
    expect(await amountFor(refreshHoldingId, '2027-10-01')).toBe(25_000)

    const { error } = await admin
      .from('holdings')
      .update({ periodic_amount: 30_000 })
      .eq('id', refreshHoldingId)
    if (error) throw new Error(error.message)

    await ensureDueInstances(admin, refreshHoldingId, THROUGH)
    expect(await amountFor(refreshHoldingId, '2027-10-01')).toBe(30_000)
  })

  it('leaves the amount alone on an instance the advisor has touched', async () => {
    const paidDate = '2027-10-01'
    await ensureDueInstances(admin, touchedHoldingId, THROUGH)

    const { error: markPaidError } = await admin
      .from('due_instances')
      .update({ payment_status: 'paid', paid_on: paidDate })
      .eq('holding_id', touchedHoldingId)
      .eq('due_date', paidDate)
    if (markPaidError) throw new Error(markPaidError.message)

    const { error: premiumError } = await admin
      .from('holdings')
      .update({ periodic_amount: 30_000 })
      .eq('id', touchedHoldingId)
    if (premiumError) throw new Error(premiumError.message)

    await ensureDueInstances(admin, touchedHoldingId, THROUGH)
    expect(await amountFor(touchedHoldingId, paidDate)).toBe(25_000)
  })

  it('clears off_schedule on a touched instance without moving its evidence', async () => {
    // Mirrors how off_schedule actually gets set (Decision 3): reconciliation
    // only preserves-and-flags a row that is NOT pristine, so the realistic
    // case is a row that is both ticked paid AND off_schedule. Clearing the
    // flag must not require the row to be pristine, and must not touch the
    // payment status or note that made it evidence in the first place.
    await ensureDueInstances(admin, offScheduleHoldingId, THROUGH)

    const { error: markTouchedError } = await admin
      .from('due_instances')
      .update({ payment_status: 'paid', paid_on: '2027-10-01', off_schedule: true })
      .eq('holding_id', offScheduleHoldingId)
      .eq('due_date', '2027-10-01')
    if (markTouchedError) throw new Error(markTouchedError.message)

    const before = await instanceFor(offScheduleHoldingId, '2027-10-01')
    expect(before.off_schedule).toBe(true)
    expect(before.payment_status).toBe('paid')

    const result = await ensureDueInstances(admin, offScheduleHoldingId, THROUGH)
    expect(result.offScheduleCleared).toBe(1)

    const after = await instanceFor(offScheduleHoldingId, '2027-10-01')
    expect(after.off_schedule).toBe(false)
    expect(after.payment_status).toBe('paid') // evidence untouched
  })

  it('treats an instance due exactly today as not-past, eligible for the amount refresh', async () => {
    await ensureDueInstances(admin, dueTodayHoldingId, THROUGH)
    expect(await amountFor(dueTodayHoldingId, TODAY)).toBe(10_000)

    const { error } = await admin
      .from('holdings')
      .update({ periodic_amount: 20_000 })
      .eq('id', dueTodayHoldingId)
    if (error) throw new Error(error.message)

    const result = await ensureDueInstances(admin, dueTodayHoldingId, THROUGH)
    expect(result.refreshed).toBe(1)
    expect(await amountFor(dueTodayHoldingId, TODAY)).toBe(20_000)
  })

  // A fixed deposit has no premium, so its periodic_amount is null, yet its
  // maturity instance may carry a real amount (entered by hand, seeded or
  // imported). A missing premium is not an instruction to erase that amount.
  it('never refreshes amount_due to null when the holding has no periodic amount', async () => {
    const maturity = toISODate(addMonths(fromISODate(TODAY)!, 2))
    const { data: holding, error } = await admin
      .from('holdings')
      .insert({
        family_id: familyId,
        category: 'fixed_income',
        label: 'FD with no premium',
        periodic_amount: null,
        anchor_due_date: maturity,
        next_due_date: maturity,
        due_frequency: 'one_time',
      })
      .select()
      .single()
    if (error) throw new Error(error.message)
    const id = holding!.id as string

    const { error: instanceError } = await admin
      .from('due_instances')
      .insert({ holding_id: id, due_date: maturity, amount_due: 1_000_000 })
    if (instanceError) throw new Error(instanceError.message)

    const result = await ensureDueInstances(admin, id, THROUGH)
    expect(result.refreshed).toBe(0)
    expect(await amountFor(id, maturity)).toBe(1_000_000)
  })

  // Past instances are the advisor's record and are never modified. A holding
  // whose next_due_date has slipped into the past generates past dates, and
  // one of those already carrying the off_schedule flag must keep it.
  it('leaves off_schedule alone on a past instance', async () => {
    const pastDue = toISODate(addMonths(fromISODate(TODAY)!, -2))
    const { data: holding, error } = await admin
      .from('holdings')
      .insert({
        family_id: familyId,
        category: 'mutual_fund',
        label: 'Lapsed SIP with a past off-schedule row',
        periodic_amount: 5_000,
        anchor_due_date: pastDue,
        next_due_date: pastDue,
        due_frequency: 'monthly',
      })
      .select()
      .single()
    if (error) throw new Error(error.message)
    const id = holding!.id as string
    await ensureDueInstances(admin, id, THROUGH)

    const { data: flagged, error: flagError } = await admin
      .from('due_instances')
      .update({ off_schedule: true })
      .eq('holding_id', id)
      .eq('due_date', pastDue)
      .select('id')
    if (flagError) throw new Error(flagError.message)
    expect(flagged).toHaveLength(1)

    await ensureDueInstances(admin, id, THROUGH)
    expect((await instanceFor(id, pastDue)).off_schedule).toBe(true)
  })

  // Just after IST midnight a UTC server still reads yesterday's date. The
  // instance due on that IST yesterday is past, so a premium change must not
  // re-price it — even though the UTC date says it is due today.
  it('treats the IST yesterday as past on a UTC host just after IST midnight', async () => {
    const { data: holding, error } = await admin
      .from('holdings')
      .insert({
        family_id: familyId,
        category: 'life_insurance',
        label: 'IST boundary refresh plan',
        periodic_amount: 10_000,
        anchor_due_date: UTC_DATE_AT_THAT_INSTANT,
        next_due_date: UTC_DATE_AT_THAT_INSTANT,
        due_frequency: 'annual',
      })
      .select()
      .single()
    if (error) throw new Error(error.message)
    const id = holding!.id as string
    await ensureDueInstances(admin, id, THROUGH)
    expect(await amountFor(id, UTC_DATE_AT_THAT_INSTANT)).toBe(10_000)

    const { error: premiumError } = await admin
      .from('holdings')
      .update({ periodic_amount: 20_000 })
      .eq('id', id)
    if (premiumError) throw new Error(premiumError.message)

    await onUtcHostAt(JUST_AFTER_IST_MIDNIGHT, () => ensureDueInstances(admin, id, THROUGH))
    expect(await amountFor(id, UTC_DATE_AT_THAT_INSTANT)).toBe(10_000)
  })

  it('skips a holding with no next_due_date', async () => {
    const result = await ensureDueInstances(admin, undatedHoldingId, THROUGH)
    expect(result).toEqual({ created: 0, refreshed: 0, offScheduleCleared: 0 })
  })
})
