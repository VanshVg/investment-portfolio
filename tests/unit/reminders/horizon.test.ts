import { describe, expect, it } from 'vitest'
import { HORIZON_MONTHS, horizonFrom } from '@/lib/reminders/horizon'

describe('horizonFrom', () => {
  it('is thirteen months out', () => {
    expect(HORIZON_MONTHS).toBe(13)
    expect(horizonFrom('2026-09-06')).toBe('2027-10-06')
  })

  it('clamps to the end of a shorter month rather than overflowing', () => {
    expect(horizonFrom('2026-01-31')).toBe('2027-02-28')
  })
})
