import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminClient, ensureUser } from '../helpers/db'
import { ensureDueInstances } from '@/lib/reminders/ensure-due-instances'
import type { SupabaseClient } from '@supabase/supabase-js'

const EMAIL = 'ensure-due-admin@example.test'
const PASSWORD = 'test-password-123'

// The routine under test is meant to run with elevated privilege (the save
// path and the daily job both call it server-side), so the service-role
// client stands in for both "arrange fixtures" and "the thing under test".
const admin: SupabaseClient = adminClient()

// A single horizon shared across the whole-window tests, matching the shape
// the real callers use ("through" a fixed number of months out).
const THROUGH = '2027-10-06'

let familyId: string
let holdingId: string
let monthlyHoldingId: string
let refreshHoldingId: string
let touchedHoldingId: string
let offScheduleHoldingId: string
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

async function offScheduleFor(id: string, dueDate: string): Promise<boolean> {
  const { data, error } = await admin
    .from('due_instances')
    .select('off_schedule')
    .eq('holding_id', id)
    .eq('due_date', dueDate)
    .single()
  if (error) throw new Error(error.message)
  return Boolean(data?.off_schedule)
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

  it('clears off_schedule when a date returns to the schedule', async () => {
    await ensureDueInstances(admin, offScheduleHoldingId, THROUGH)

    const { error: markOffScheduleError } = await admin
      .from('due_instances')
      .update({ off_schedule: true })
      .eq('holding_id', offScheduleHoldingId)
      .eq('due_date', '2027-10-01')
    if (markOffScheduleError) throw new Error(markOffScheduleError.message)
    expect(await offScheduleFor(offScheduleHoldingId, '2027-10-01')).toBe(true)

    await ensureDueInstances(admin, offScheduleHoldingId, THROUGH)
    expect(await offScheduleFor(offScheduleHoldingId, '2027-10-01')).toBe(false)
  })

  it('skips a holding with no next_due_date', async () => {
    const result = await ensureDueInstances(admin, undatedHoldingId, THROUGH)
    expect(result).toEqual({ created: 0, refreshed: 0 })
  })
})
