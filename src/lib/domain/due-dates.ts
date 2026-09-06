import { addMonths, startOfDay } from 'date-fns'

export type DueFrequency = 'annual' | 'half_yearly' | 'quarterly' | 'monthly' | 'one_time'

const MONTHS_PER_STEP: Record<Exclude<DueFrequency, 'one_time'>, number> = {
  annual: 12,
  half_yearly: 6,
  quarterly: 3,
  monthly: 1,
}

/**
 * The nth occurrence counted from the anchor, where n = 0 is the anchor itself.
 *
 * Always measured from the anchor rather than from the previous occurrence.
 * Stepping month by month would turn 31 Jan into 28 Feb and then 28 Mar,
 * silently losing the end-of-month intent; measuring from the anchor gives
 * 28 Feb then 31 Mar, which is what a policy due on the 31st actually means.
 */
export function nthDueDate(anchor: Date, frequency: DueFrequency, n: number): Date | null {
  if (frequency === 'one_time') return n === 0 ? startOfDay(anchor) : null
  if (n < 0) return null
  return startOfDay(addMonths(startOfDay(anchor), MONTHS_PER_STEP[frequency] * n))
}

/** The first occurrence strictly after `after`. Null when none remains. */
export function nextDueDateAfter(
  anchor: Date,
  frequency: DueFrequency,
  after: Date,
): Date | null {
  const start = startOfDay(anchor)
  const cutoff = startOfDay(after)

  if (frequency === 'one_time') {
    return start.getTime() > cutoff.getTime() ? start : null
  }

  const step = MONTHS_PER_STEP[frequency]
  const monthsApart =
    (cutoff.getFullYear() - start.getFullYear()) * 12 + (cutoff.getMonth() - start.getMonth())

  // Start slightly behind the estimate, then walk forward. Month-length clamping
  // means the estimate can be off by one step in either direction.
  let n = Math.max(0, Math.floor(monthsApart / step) - 1)

  for (let attempt = 0; attempt < 4; attempt += 1, n += 1) {
    const candidate = nthDueDate(start, frequency, n)
    if (candidate && candidate.getTime() > cutoff.getTime()) return candidate
  }

  return null
}

export interface DueDateSchedule {
  anchorDueDate: string | null
  nextDueDate: string | null
}

/**
 * Applies a manual due-date edit.
 *
 * A correction re-anchors: the submitted date becomes both the next occurrence
 * and the anchor every future occurrence derives from, so the correction sticks
 * instead of being snapped away by the next renewal.
 *
 * Contrast "mark as renewed" (Milestone 3), which advances along the existing
 * grid and deliberately leaves the anchor alone. Two operations write the same
 * column with opposite anchor behaviour — keeping both described here is what
 * stops one being mistaken for the other.
 *
 * An unchanged date is not an edit, so saving some other field on the row must
 * not rewrite the schedule.
 */
export function applyDueDateEdit(
  current: DueDateSchedule,
  submittedDueDate: string | null,
): DueDateSchedule {
  if (submittedDueDate === current.nextDueDate) return current
  return { anchorDueDate: submittedDueDate, nextDueDate: submittedDueDate }
}
