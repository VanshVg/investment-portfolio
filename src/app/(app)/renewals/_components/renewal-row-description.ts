import { formatDMY } from '@/lib/domain/dates'
import type { RenewalRow } from '@/lib/queries/renewals'

/**
 * A human-readable description of one renewal row: which policy, whose
 * family, which member (or the whole family), and when it's due. Shared by
 * every per-row control's accessible name.
 *
 * The renewals page's default view spans every family it tracks — that is
 * the whole point of the page — so a holding's label plus its due date is
 * not a safe identifier on its own: two different families can each hold a
 * policy with the same label, due the same day, and two members of the same
 * family can too. Family name (and member name, when the holding is not
 * whole-family) close that gap. Playwright matches accessible names by
 * substring, so a collision here would make two different rows' controls
 * indistinguishable to that tooling, not just to a screen reader.
 *
 * Plain module, not `'use client'`, so a server component can call it
 * directly rather than only render it as JSX.
 *
 * Residual case, deliberately not solved here: the same member holding two
 * identically labelled policies due on the same day would still collide.
 * That is duplicate data entry, not a realistic portfolio, and is not worth
 * spelling a database id into a name a screen reader will read aloud.
 */
export function describeRenewalRow(row: RenewalRow): string {
  const who = row.memberName ?? 'whole family'
  return `${row.label}, ${row.familyName} (${who}), due ${formatDMY(row.dueDate)}`
}
