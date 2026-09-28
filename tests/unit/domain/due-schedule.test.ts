import { describe, expect, it } from 'vitest'
import { dueDatesBetween } from '@/lib/domain/due-schedule'

describe('dueDatesBetween', () => {
  it('returns annual occurrences inside the window', () => {
    expect(dueDatesBetween('2026-04-10', 'annual', '2026-04-10', '2028-01-01')).toEqual([
      '2026-04-10',
      '2027-04-10',
    ])
  })

  it('excludes occurrences before the lower bound', () => {
    // The anchor is years old; history must not be invented.
    expect(dueDatesBetween('2015-01-05', 'monthly', '2026-09-01', '2026-11-30')).toEqual([
      '2026-09-05',
      '2026-10-05',
      '2026-11-05',
    ])
  })

  it('does not drift a month-end anchor', () => {
    // Stepping month by month would give 28-02 then 28-03. Measuring from the
    // anchor gives 28-02 then 31-03, which is what "due on the 31st" means.
    expect(dueDatesBetween('2026-01-31', 'monthly', '2026-01-31', '2026-03-31')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
    ])
  })

  it('handles a leap-year anchor', () => {
    expect(dueDatesBetween('2028-02-29', 'annual', '2028-02-29', '2029-12-31')).toEqual([
      '2028-02-29',
      '2029-02-28',
    ])
  })

  it('yields the anchor once for one_time, and nothing outside the window', () => {
    expect(dueDatesBetween('2027-10-01', 'one_time', '2026-01-01', '2028-01-01')).toEqual([
      '2027-10-01',
    ])
    expect(dueDatesBetween('2027-10-01', 'one_time', '2026-01-01', '2026-12-31')).toEqual([])
  })

  it('includes an overdue lower bound, because an overdue renewal still counts', () => {
    expect(dueDatesBetween('2026-08-01', 'quarterly', '2026-08-01', '2026-12-31')).toEqual([
      '2026-08-01',
      '2026-11-01',
    ])
  })

  it('returns nothing for a malformed date or an inverted window', () => {
    expect(dueDatesBetween('not-a-date', 'annual', '2026-01-01', '2027-01-01')).toEqual([])
    expect(dueDatesBetween('2026-01-01', 'annual', '2027-01-01', '2026-01-01')).toEqual([])
  })

  it('finds occurrences for an anchor decades before the window', () => {
    // A monthly SIP anchored in 1970 sits far more than 600 months before the
    // window. Walking from the anchor exhausts any fixed iteration cap and
    // returns nothing, which reads as "no dues" rather than as a failure.
    expect(dueDatesBetween('1970-01-15', 'monthly', '2026-09-01', '2026-11-30')).toEqual([
      '2026-09-15',
      '2026-10-15',
      '2026-11-15',
    ])
  })

  it('fully enumerates a wide monthly window instead of truncating it', () => {
    // Anchor sits at the start of the window itself, six years before the end
    // of it. A monthly cadence over that span has 73 legitimate occurrences
    // (n = 0..72) -- comfortably past a walk cap sized for "a handful of
    // months," which is exactly the failure this guards against.
    const dates = dueDatesBetween('2020-01-15', 'monthly', '2020-01-15', '2026-01-15')
    expect(dates).toHaveLength(73)
    expect(dates[0]).toBe('2020-01-15')
    expect(dates[dates.length - 1]).toBe('2026-01-15')
  })
})
