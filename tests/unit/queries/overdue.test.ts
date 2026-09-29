import { describe, expect, it } from 'vitest'
import { daysOverdue, isOverdue } from '@/lib/queries/renewals'

const TODAY = '2026-09-29'

function row(
  overrides: Partial<{
    dueDate: string
    paymentStatus: 'paid' | 'unpaid' | 'unknown'
    offSchedule: boolean
    holdingNextDueDate: string | null
  }> = {},
) {
  const dueDate = overrides.dueDate ?? '2026-09-20'
  return {
    dueDate,
    paymentStatus: overrides.paymentStatus ?? 'unknown',
    offSchedule: overrides.offSchedule ?? false,
    // Current by default: the row is its holding's next due date.
    holdingNextDueDate:
      overrides.holdingNextDueDate === undefined ? dueDate : overrides.holdingNextDueDate,
  } as const
}

describe('isOverdue', () => {
  it('is true for a past due date whose payment was never recorded', () => {
    expect(isOverdue(row(), TODAY)).toBe(true)
  })

  it('is true for a past due date explicitly marked unpaid', () => {
    expect(isOverdue(row({ paymentStatus: 'unpaid' }), TODAY)).toBe(true)
  })

  it('is false once the payment is marked paid', () => {
    expect(isOverdue(row({ paymentStatus: 'paid' }), TODAY)).toBe(false)
  })

  it('is false on the due date itself — due today is not yet late', () => {
    expect(isOverdue(row({ dueDate: TODAY }), TODAY)).toBe(false)
  })

  it('is false for a future due date', () => {
    expect(isOverdue(row({ dueDate: '2026-10-05' }), TODAY)).toBe(false)
  })

  it('is false for an off-schedule instance, which is kept as evidence rather than owed', () => {
    expect(isOverdue(row({ offSchedule: true }), TODAY)).toBe(false)
  })

  it('is false for a period the holding has already been renewed past', () => {
    // The holding has moved on to a later due date, so this period is closed
    // whatever its tick reads — the same rule the reminder sweep applies.
    expect(isOverdue(row({ holdingNextDueDate: '2027-09-20' }), TODAY)).toBe(false)
  })

  it('is still true when the holding has no cached next due date', () => {
    expect(isOverdue(row({ holdingNextDueDate: null }), TODAY)).toBe(true)
  })
})

describe('daysOverdue', () => {
  it('counts calendar days from the due date to today', () => {
    expect(daysOverdue('2026-09-20', TODAY)).toBe(9)
  })

  it('counts across a month boundary', () => {
    expect(daysOverdue('2026-08-31', TODAY)).toBe(29)
  })

  it('is 1 the day after the due date', () => {
    expect(daysOverdue('2026-09-28', TODAY)).toBe(1)
  })
})
