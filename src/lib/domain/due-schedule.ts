import { nthDueDate, type DueFrequency } from './due-dates'
import { fromISODate, toISODate } from './dates'

const MONTHS_PER_STEP: Record<Exclude<DueFrequency, 'one_time'>, number> = {
  annual: 12,
  half_yearly: 6,
  quarterly: 3,
  monthly: 1,
}

/**
 * A safety valve bounding the walk when the anchor is far from the window.
 * Prevents infinite loops; does not bound how many occurrences exist.
 * Starting `n` is estimated from the gap and backed off by a step, so the
 * bound is reached only on pathological input.
 */
const MAX_WALK = 50

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

  if (frequency === 'one_time') {
    // one_time holdings yield the anchor or nothing.
    const occurrence = nthDueDate(anchorDate, frequency, 0)
    if (occurrence && occurrence.getTime() >= fromDate.getTime() && occurrence.getTime() <= throughDate.getTime()) {
      dates.push(toISODate(occurrence))
    }
    return dates
  }

  // For recurring frequencies, estimate starting n from the gap between anchor
  // and from. Start a step or two behind, since month-length clamping can shift
  // occurrences by ±1 step.
  const step = MONTHS_PER_STEP[frequency]
  const monthsApart =
    (fromDate.getFullYear() - anchorDate.getFullYear()) * 12 +
    (fromDate.getMonth() - anchorDate.getMonth())
  let n = Math.max(0, Math.floor(monthsApart / step) - 2)

  for (let walk = 0; walk < MAX_WALK; walk += 1, n += 1) {
    const occurrence = nthDueDate(anchorDate, frequency, n)
    if (!occurrence) break
    if (occurrence.getTime() > throughDate.getTime()) break
    if (occurrence.getTime() >= fromDate.getTime()) dates.push(toISODate(occurrence))
  }
  return dates
}
