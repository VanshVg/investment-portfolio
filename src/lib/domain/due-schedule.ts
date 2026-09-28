import { MONTHS_PER_STEP, nthDueDate, type DueFrequency } from './due-dates'
import { fromISODate, toISODate } from './dates'

/**
 * Steps of margin added on top of the window-derived walk bound below, to
 * cover the deliberate two-step back-off applied to the starting estimate and
 * the +/-1 step of drift month-length clamping can introduce near either
 * edge of the window.
 */
const WALK_MARGIN_STEPS = 4

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
    if (
      occurrence &&
      occurrence.getTime() >= fromDate.getTime() &&
      occurrence.getTime() <= throughDate.getTime()
    ) {
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

  // The walk bound is sized to the window, not to the anchor's distance from
  // it: however many occurrences of this frequency can actually fit between
  // from and through, plus WALK_MARGIN_STEPS to cover the back-off and
  // clamping drift above. This is a safety valve on the starting-index
  // estimate, not a cap on how many occurrences a caller may legitimately
  // ask for -- so exhausting it below is treated as a bug in that estimate,
  // never as a signal to hand back a truncated (and silently wrong) list.
  const windowMonths =
    (throughDate.getFullYear() - fromDate.getFullYear()) * 12 +
    (throughDate.getMonth() - fromDate.getMonth()) +
    1
  const maxWalk = Math.ceil(windowMonths / step) + WALK_MARGIN_STEPS

  let walk = 0
  for (; walk < maxWalk; walk += 1, n += 1) {
    const occurrence = nthDueDate(anchorDate, frequency, n)
    if (!occurrence) break
    if (occurrence.getTime() > throughDate.getTime()) break
    if (occurrence.getTime() >= fromDate.getTime()) dates.push(toISODate(occurrence))
  }

  if (walk === maxWalk) {
    throw new Error(
      `dueDatesBetween: exhausted walk bound (${maxWalk} steps) without reaching the end ` +
        `of the window -- anchor=${anchor}, frequency=${frequency}, from=${from}, ` +
        `through=${through}. This means the starting-index estimate was wrong, which is a ` +
        'bug in this function, not a case of unusually large legitimate input.',
    )
  }

  return dates
}
