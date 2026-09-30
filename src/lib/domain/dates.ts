const DMY = /^(\d{2})-(\d{2})-(\d{4})$/
const ISO = /^(\d{4})-(\d{2})-(\d{2})/

/** Converts a Date to a storage-safe yyyy-mm-dd string. */
export function toISODate(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const INDIA_CALENDAR = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * Today's calendar date in India, as yyyy-mm-dd.
 *
 * The advisor's business day is the Indian one, whatever zone the server
 * runs in. Production runs in UTC, where the host date is still yesterday
 * between 00:00 and 05:30 IST; reading the host clock in that window would
 * stamp a payment a day early and treat yesterday's due date as not yet past.
 * Every "today" that decides anything should come from here.
 */
export function todayInIndia(now: Date = new Date()): string {
  const parts = INDIA_CALENDAR.formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

const INDIA_CLOCK = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** An instant as the advisor's clock showed it: DD-MM-YYYY, HH:mm in India. */
export function formatDateTimeIST(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return '—'
  const parts = INDIA_CLOCK.formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value
  return `${part('day')}-${part('month')}-${part('year')}, ${part('hour')}:${part('minute')}`
}

/** Parses a yyyy-mm-dd string as a local calendar day. */
export function fromISODate(value: string): Date | null {
  const match = ISO.exec(value)
  if (!match) return null
  return buildDate(Number(match[1]), Number(match[2]), Number(match[3]))
}

/** Displays a date in the Indian DD-MM-YYYY convention. */
export function formatDMY(value: Date | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const date = typeof value === 'string' ? fromISODate(value) : value
  if (!date || Number.isNaN(date.getTime())) return '—'
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${day}-${month}-${date.getFullYear()}`
}

/** Reads DD-MM-YYYY user input. Returns null for anything malformed. */
export function parseDMY(value: string): Date | null {
  const match = DMY.exec(value.trim())
  if (!match) return null
  return buildDate(Number(match[3]), Number(match[2]), Number(match[1]))
}

/** Builds a local date, rejecting values the calendar rolled over (e.g. 31 Feb). */
function buildDate(year: number, month: number, day: number): Date | null {
  const date = new Date(year, month - 1, day)
  const survived =
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
  return survived ? date : null
}

/**
 * The years a date anywhere in the app may fall in. Wide enough for any real
 * policy, deposit or maturity; narrow enough to catch a year typed short —
 * "0202" for "2020" — which would otherwise be stored as the year 202.
 * The calendar picker, the typed-date check and the server schema all read
 * these, so the three cannot disagree about what a sensible date is.
 */
export const EARLIEST_YEAR = 1950
export const LATEST_YEAR = 2100

/**
 * What is wrong with a typed DD-MM-YYYY date, in words the advisor can act
 * on, or null when it is fine. Blank is not a problem here: whether a date is
 * required is the caller's decision, not the format's.
 *
 * Kept separate from `parseDMY`, which only answers yes or no: "Use
 * DD-MM-YYYY" is the wrong thing to say about 31-02-2027, which is in exactly
 * that format and simply does not exist.
 */
export function describeDMYProblem(text: string): string | null {
  const trimmed = text.trim()
  if (trimmed === '') return null
  const match = DMY.exec(trimmed)
  if (!match) return 'Use DD-MM-YYYY.'
  if (!parseDMY(trimmed)) return 'That date does not exist.'
  const year = Number(match[3])
  if (year < EARLIEST_YEAR || year > LATEST_YEAR) {
    return `Enter a year between ${EARLIEST_YEAR} and ${LATEST_YEAR}.`
  }
  return null
}
