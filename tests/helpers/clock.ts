import { vi } from 'vitest'

/**
 * 00:30 IST on 20 September 2026, which is still 19 September in UTC. Any
 * code that takes "today" from the host clock on a UTC server names the
 * wrong day at this instant.
 */
export const JUST_AFTER_IST_MIDNIGHT = '2026-09-19T19:00:00Z'
export const IST_DATE_AT_THAT_INSTANT = '2026-09-20'
export const UTC_DATE_AT_THAT_INSTANT = '2026-09-19'

/**
 * Runs `fn` as if on a UTC host (as production is) at the given instant.
 *
 * Only `Date` is faked, so network calls to the local database still run on
 * real timers. The host zone is restored afterwards even if `fn` throws.
 */
export async function onUtcHostAt<T>(instant: string, fn: () => Promise<T>): Promise<T> {
  const hostTimeZone = process.env.TZ
  process.env.TZ = 'UTC'
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(instant))
  try {
    return await fn()
  } finally {
    vi.useRealTimers()
    if (hostTimeZone === undefined) delete process.env.TZ
    else process.env.TZ = hostTimeZone
  }
}
