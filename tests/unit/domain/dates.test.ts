import { afterEach, describe, expect, it } from 'vitest'
import { formatDMY, parseDMY, toISODate, todayInIndia } from '@/lib/domain/dates'

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

describe('todayInIndia', () => {
  const hostTimeZone = process.env.TZ

  afterEach(() => {
    if (hostTimeZone === undefined) delete process.env.TZ
    else process.env.TZ = hostTimeZone
  })

  // Production runs in UTC and development in IST, so every expectation is
  // checked under both, plus a zone on the far side of UTC. Node re-reads TZ
  // on assignment, so this changes what Date's local-time methods return.
  const HOST_ZONES = ['UTC', 'Asia/Kolkata', 'America/Los_Angeles']

  const CASES: Array<[instant: string, expected: string, why: string]> = [
    ['2026-09-19T18:29:59Z', '2026-09-19', 'one second before IST midnight'],
    ['2026-09-19T18:30:00Z', '2026-09-20', 'IST midnight exactly'],
    ['2026-09-19T19:00:00Z', '2026-09-20', '00:30 IST, while the UTC date is still the 19th'],
    ['2026-09-19T23:59:59Z', '2026-09-20', '05:29:59 IST, the last second the UTC date lags'],
    ['2026-09-20T00:00:00Z', '2026-09-20', '05:30 IST, where the UTC date catches up'],
    ['2026-12-31T18:30:00Z', '2027-01-01', 'IST midnight on New Year, crossing the year'],
  ]

  for (const zone of HOST_ZONES) {
    for (const [instant, expected, why] of CASES) {
      it(`names ${expected} at ${instant} (${why}) on a host in ${zone}`, () => {
        process.env.TZ = zone
        expect(todayInIndia(new Date(instant))).toBe(expected)
      })
    }
  }
})
