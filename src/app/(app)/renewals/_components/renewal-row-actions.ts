import type { RenewalRow } from '@/lib/queries/renewals'

/**
 * Whether a row offers "Mark renewed".
 *
 * Only the holding's current due date can be renewed: renewal advances the
 * holding from that date by one period, so offering it on a later row would
 * skip the dates in between, and on a row already renewed would advance from
 * a stale date. markRenewed refuses both; not offering them keeps the advisor
 * from meeting that refusal at all. A one_time holding has no next period.
 * The payment tick is unaffected and stays on every row.
 *
 * Plain module, not `'use client'`, so it can be called from anywhere.
 */
export function canMarkRenewed(
  row: Pick<RenewalRow, 'dueFrequency' | 'dueDate' | 'holdingNextDueDate'>,
): boolean {
  return row.dueFrequency !== 'one_time' && row.dueDate === row.holdingNextDueDate
}
