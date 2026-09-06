import { nthDueDate, type DueFrequency } from './due-dates'
import { fromISODate, toISODate } from './dates'

/**
 * A guard against an unbounded walk, not a product limit. The widest legitimate
 * case is a monthly holding across the 13-month horizon: 14 occurrences. Any
 * value near this ceiling means the caller passed a window it did not intend.
 */
const MAX_OCCURRENCES = 600

/**
 * Occurrences on the anchor grid falling within [from, through], inclusive.
 *
 * The lower bound is what stops generation inventing history: an anchor may be
 * years older than the first date this system is responsible for.
 */
export function dueDatesBetween(
  anchor: string,
  frequency: DueFrequency,
  from: string,
  through: string,
): string[] {
  const anchorDate = fromISODate(anchor)
  const fromDate = fromISODate(from)
  const throughDate = fromISODate(through)
  if (!anchorDate || !fromDate || !throughDate) return []
  if (fromDate.getTime() > throughDate.getTime()) return []

  const dates: string[] = []
  for (let n = 0; n < MAX_OCCURRENCES; n += 1) {
    const occurrence = nthDueDate(anchorDate, frequency, n)
    if (!occurrence) break
    if (occurrence.getTime() > throughDate.getTime()) break
    if (occurrence.getTime() >= fromDate.getTime()) dates.push(toISODate(occurrence))
  }
  return dates
}
