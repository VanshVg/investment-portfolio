import { describe, expect, it } from 'vitest'
import { firedWindows } from '@/lib/domain/reminder-windows'

const at = (value: string) => new Date(`${value}T00:00:00`)

describe('firedWindows', () => {
  it('fires nothing while every window is still ahead', () => {
    expect(firedWindows(at('2027-03-15'), [30, 15], at('2027-01-01'))).toEqual([])
  })

  it('fires the 30-day window on its exact day', () => {
    expect(firedWindows(at('2027-03-15'), [30, 15], at('2027-02-13'))).toEqual([30])
  })

  it('fires both windows once the nearer one arrives', () => {
    expect(firedWindows(at('2027-03-15'), [30, 15], at('2027-02-28'))).toEqual([30, 15])
  })

  it('still fires a window whose day was missed', () => {
    // A skipped cron run must not lose a reminder. The unique constraint on
    // reminder_log is what stops the caught-up window sending twice.
    expect(firedWindows(at('2027-03-15'), [30, 15], at('2027-03-10'))).toEqual([30, 15])
  })

  it('fires on the due date itself', () => {
    expect(firedWindows(at('2027-03-15'), [30, 15, 0], at('2027-03-15'))).toEqual([30, 15, 0])
  })

  it('stops once the due date has passed', () => {
    expect(firedWindows(at('2027-03-15'), [30, 15], at('2027-03-16'))).toEqual([])
  })

  it('returns windows widest first, regardless of input order', () => {
    expect(firedWindows(at('2027-03-15'), [15, 30], at('2027-03-01'))).toEqual([30, 15])
  })
})
