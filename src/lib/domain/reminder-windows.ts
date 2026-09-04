import { differenceInCalendarDays, startOfDay } from 'date-fns'

/**
 * Which configured reminder windows have come due for a given date.
 *
 * A window fires once its day arrives and keeps firing until the due date
 * passes, so a missed scheduled run catches up rather than losing the
 * reminder. The unique constraint on reminder_log is what prevents a caught-up
 * window from sending a second message.
 */
export function firedWindows(dueDate: Date, daysBefore: number[], today: Date): number[] {
  const daysRemaining = differenceInCalendarDays(startOfDay(dueDate), startOfDay(today))
  if (daysRemaining < 0) return []

  return [...daysBefore].sort((a, b) => b - a).filter((window) => daysRemaining <= window)
}
