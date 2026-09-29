import { z } from 'zod'
import { optionalIndianMobile } from './contact'

export const MAX_REMINDER_DAYS = 365

/**
 * Mirrors `reminder_rules_days_before_present` and
 * `reminder_rules_days_before_non_negative`: at least one window, no negative
 * values, whole days only. The database constraint remains the authority —
 * this exists so the advisor sees a message here instead of a raw Postgres
 * error after the round trip.
 *
 * `0` is accepted deliberately: "remind on the due date itself" is a legal,
 * meaningful window (see the sweep). Sorted widest-first on the way out, so
 * the order the advisor sees always matches the order reminders actually
 * fire in, regardless of the order they were typed.
 */
const daysBefore = z.string().transform((raw, ctx) => {
  const parts = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')

  if (parts.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Add at least one reminder window.' })
    return z.NEVER
  }

  const days: number[] = []
  for (const part of parts) {
    // A plain digit run also rules out negative numbers (the leading `-`
    // does not match) and fractions (the `.` does not match) in one rule,
    // rather than three separate checks that could disagree with each other.
    if (!/^\d+$/.test(part)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Use whole, non-negative numbers of days, separated by commas.',
      })
      return z.NEVER
    }
    const value = Number(part)
    // days_before is an int[] and the sweep scans that far ahead, so a
    // window has to stop somewhere; a reminder more than a year out is not
    // one anyone acts on.
    if (value > MAX_REMINDER_DAYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `A reminder can be at most ${MAX_REMINDER_DAYS} days before the due date.`,
      })
      return z.NEVER
    }
    days.push(value)
  }

  return Array.from(new Set(days)).sort((a, b) => b - a)
})

export const reminderRuleInput = z.object({
  daysBefore,
  isActive: z.boolean(),
})

export type ReminderRuleInput = z.infer<typeof reminderRuleInput>

/**
 * The advisor's own WhatsApp number. `reminderRecipients` (src/lib/domain/
 * routing.ts) reads this from `profiles.mobile` for every reminder — both
 * parties for a holding managed here, the advisor alone for an externally
 * managed one, deliberately, as the cross-sell trigger — so a blank value
 * here is what leaves that routing with nowhere to send an externally
 * managed reminder at all.
 */
export const advisorMobileInput = z.object({
  mobile: optionalIndianMobile,
})

export type AdvisorMobileInput = z.infer<typeof advisorMobileInput>
