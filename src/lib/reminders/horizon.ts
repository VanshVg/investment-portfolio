import { addMonths } from 'date-fns'
import { fromISODate, toISODate } from '@/lib/domain/dates'

/**
 * Long enough to cover an annual policy once with a month of slack.
 *
 * Defined once, and imported by both callers of ensureDueInstances. If the save
 * path and the daily job ever disagreed about how far ahead to generate, the
 * difference would appear as due dates that exist only until something else
 * touches the holding — which is precisely the kind of fault that hides.
 */
export const HORIZON_MONTHS = 13

/** The far edge of the generation window, as an ISO date. */
export function horizonFrom(today: string): string {
  const start = fromISODate(today)
  if (!start) throw new Error(`horizonFrom: expected yyyy-mm-dd, received "${today}"`)
  return toISODate(addMonths(start, HORIZON_MONTHS))
}
