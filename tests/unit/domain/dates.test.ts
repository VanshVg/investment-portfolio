import { describe, expect, it } from 'vitest'
import { formatDMY, parseDMY, toISODate } from '@/lib/domain/dates'

describe('formatDMY', () => {
  it('renders Indian day-month-year order', () => {
    expect(formatDMY('2026-09-04')).toBe('04-09-2026')
    expect(formatDMY(new Date(2027, 0, 31))).toBe('31-01-2027')
  })

  it('renders an em dash for a missing date', () => {
    expect(formatDMY(null)).toBe('—')
    expect(formatDMY(undefined)).toBe('—')
  })
})

describe('parseDMY', () => {
  it('reads day-month-year input', () => {
    expect(toISODate(parseDMY('04-09-2026')!)).toBe('2026-09-04')
  })

  it('rejects malformed and impossible dates', () => {
    expect(parseDMY('2026-09-04')).toBeNull()
    expect(parseDMY('31-02-2026')).toBeNull()
    expect(parseDMY('not a date')).toBeNull()
  })
})
