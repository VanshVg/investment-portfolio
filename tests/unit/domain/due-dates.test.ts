import { describe, expect, it } from 'vitest'
import { nextDueDateAfter, nthDueDate } from '@/lib/domain/due-dates'
import { toISODate } from '@/lib/domain/dates'

const iso = (d: Date | null) => (d ? toISODate(d) : null)
const at = (value: string) => new Date(`${value}T00:00:00`)

describe('nthDueDate', () => {
  it('steps annually', () => {
    expect(iso(nthDueDate(at('2026-03-15'), 'annual', 1))).toBe('2027-03-15')
  })

  it('steps quarterly and half-yearly', () => {
    expect(iso(nthDueDate(at('2026-01-10'), 'quarterly', 3))).toBe('2026-10-10')
    expect(iso(nthDueDate(at('2026-01-10'), 'half_yearly', 2))).toBe('2027-01-10')
  })

  it('never advances a one-time holding', () => {
    expect(iso(nthDueDate(at('2027-10-01'), 'one_time', 0))).toBe('2027-10-01')
    expect(nthDueDate(at('2027-10-01'), 'one_time', 1)).toBeNull()
  })

  it('does not drift away from a month-end anchor', () => {
    // The whole reason anchor_due_date exists: rolling forward from the previous
    // due date would give 28-03, permanently losing the end-of-month intent.
    expect(iso(nthDueDate(at('2026-01-31'), 'monthly', 1))).toBe('2026-02-28')
    expect(iso(nthDueDate(at('2026-01-31'), 'monthly', 2))).toBe('2026-03-31')
    expect(iso(nthDueDate(at('2026-01-31'), 'monthly', 3))).toBe('2026-04-30')
  })

  it('clamps a leap-day anchor in common years, then restores it', () => {
    expect(iso(nthDueDate(at('2024-02-29'), 'annual', 1))).toBe('2025-02-28')
    expect(iso(nthDueDate(at('2024-02-29'), 'annual', 4))).toBe('2028-02-29')
  })
})

describe('nextDueDateAfter', () => {
  it('finds the next occurrence strictly after the given day', () => {
    expect(iso(nextDueDateAfter(at('2026-03-15'), 'annual', at('2026-09-04')))).toBe('2027-03-15')
    expect(iso(nextDueDateAfter(at('2026-03-15'), 'annual', at('2026-01-01')))).toBe('2026-03-15')
  })

  it('treats the due date itself as not yet passed', () => {
    expect(iso(nextDueDateAfter(at('2026-03-15'), 'annual', at('2026-03-15')))).toBe('2027-03-15')
  })

  it('returns null for a one-time date already gone', () => {
    expect(nextDueDateAfter(at('2020-01-01'), 'one_time', at('2026-09-04'))).toBeNull()
  })

  it('handles an anchor many years in the past without drifting', () => {
    expect(iso(nextDueDateAfter(at('2010-01-31'), 'monthly', at('2026-09-04')))).toBe('2026-09-30')
  })
})

import { applyDueDateEdit } from '@/lib/domain/due-dates'

describe('applyDueDateEdit', () => {
  const current = { anchorDueDate: '2026-01-15', nextDueDate: '2027-01-15' }

  it('re-anchors when the advisor changes the due date', () => {
    // A correction is the new truth: every future occurrence derives from it.
    expect(applyDueDateEdit(current, '2027-01-20')).toEqual({
      anchorDueDate: '2027-01-20',
      nextDueDate: '2027-01-20',
    })
  })

  it('leaves the anchor untouched when the date was not edited', () => {
    // Saving an unrelated field must not silently rewrite the schedule.
    expect(applyDueDateEdit(current, '2027-01-15')).toEqual(current)
  })

  it('re-anchors when a date is added to a holding that had none', () => {
    expect(applyDueDateEdit({ anchorDueDate: null, nextDueDate: null }, '2027-06-01')).toEqual({
      anchorDueDate: '2027-06-01',
      nextDueDate: '2027-06-01',
    })
  })

  it('clears both columns when the date is removed', () => {
    expect(applyDueDateEdit(current, null)).toEqual({ anchorDueDate: null, nextDueDate: null })
  })
})
