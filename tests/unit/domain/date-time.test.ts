import { describe, expect, it } from 'vitest'
import { formatDateTimeIST } from '@/lib/domain/dates'

describe('formatDateTimeIST', () => {
  it('shows an instant as DD-MM-YYYY and a 24-hour time in India', () => {
    expect(formatDateTimeIST('2027-03-15T04:00:00Z')).toBe('15-03-2027, 09:30')
  })

  it('crosses midnight into the next Indian day', () => {
    expect(formatDateTimeIST('2027-03-15T20:00:00Z')).toBe('16-03-2027, 01:30')
  })

  it('shows a dash for nothing', () => {
    expect(formatDateTimeIST(null)).toBe('—')
  })
})
