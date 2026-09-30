import { formatDMY } from '@/lib/domain/dates'
import { formatINR } from '@/lib/domain/money'

/**
 * The approved templates' names. The wording itself lives at Meta; see
 * docs/specs/2026-09-30-milestone-4-whatsapp-sender-design.md for the text
 * each was submitted with. A parameter list here must match its template's
 * variables one for one and in order.
 */
export const TEMPLATES = {
  clientReminder: 'policy_due_reminder',
  advisorSummary: 'advisor_daily_summary',
  /** Created by Meta on every WhatsApp Business account; used by the test button. */
  test: 'hello_world',
} as const

const MAX_PARAM_LENGTH = 1000
const SUMMARY_ITEMS = 5

/**
 * Meta rejects a parameter holding a newline, a tab or more than four spaces
 * in a row, or an empty one. Names and labels come from free-text fields, so
 * every value passes through here.
 */
export function sanitizeParam(value: string): string {
  const clean = value.replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim()
  return clean === '' ? '-' : clean.slice(0, MAX_PARAM_LENGTH)
}

/** policy_due_reminder: {{1}} member, {{2}} advisor, {{3}} holding, {{4}} date, {{5}} amount. */
export function clientReminderParams(input: {
  memberName: string
  advisorName: string
  holdingLabel: string
  dueDate: string
  amountDue: number | null
}): string[] {
  return [
    input.memberName,
    input.advisorName,
    input.holdingLabel,
    formatDMY(input.dueDate),
    input.amountDue === null ? 'as per your policy' : formatINR(input.amountDue),
  ].map(sanitizeParam)
}

export interface SummaryItem {
  familyName: string
  holdingLabel: string
  dueDate: string
}

/**
 * advisor_daily_summary: {{1}} count, {{2}} the list, {{3}} overdue count,
 * {{4}} the renewals link. A parameter cannot hold a line break, so the list
 * is one line, soonest first, naming at most five.
 */
export function advisorSummaryParams(input: {
  items: SummaryItem[]
  overdueCount: number
  renewalsUrl: string
}): string[] {
  const sorted = [...input.items].sort(
    (a, b) => a.dueDate.localeCompare(b.dueDate) || a.familyName.localeCompare(b.familyName),
  )
  const named = sorted
    .slice(0, SUMMARY_ITEMS)
    .map((item) => `${item.familyName} – ${item.holdingLabel} (${formatDMY(item.dueDate)})`)
  const rest = sorted.length - named.length
  const list = named.join('; ') + (rest > 0 ? ` and ${rest} more` : '')

  return [String(sorted.length), list, String(input.overdueCount), input.renewalsUrl].map(
    sanitizeParam,
  )
}

/** Free text, sent inside the 24-hour window the client's own STOP opened. */
export function optOutConfirmation(advisorName: string): string {
  return (
    `You won't receive further reminders from ${advisorName}. ` +
    'Reply START if you change your mind.'
  )
}
