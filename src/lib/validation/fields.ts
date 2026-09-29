import { z } from 'zod'
import { EARLIEST_YEAR, fromISODate, LATEST_YEAR } from '@/lib/domain/dates'

/**
 * The building blocks every schema is made of, so a rule and its message are
 * written once. Before these existed the holding details used bare
 * `z.string().min(1)` and `z.number().positive()`, and the advisor read the
 * library's own defaults: "Too small: expected number to be >0", "Invalid
 * input: expected string, received undefined".
 *
 * Messages name the field when it is missing ("Asset type is required."),
 * and otherwise say what to do. They are shown next to the field they belong
 * to, so they do not need to repeat its name.
 */

/** Text lengths. Generous for real data; they exist to stop a pasted page, or
 *  an importer's malformed cell, being stored as a policy name (follow-up T3). */
export const MAX_LENGTH = {
  name: 120,
  label: 200,
  code: 50,
  short: 80,
  note: 1000,
} as const

const tooLong = (max: number) => `Keep this under ${max} characters.`

/** Text that must be present. Spaces alone count as missing. */
export function requiredText(label: string, max: number) {
  const missing = `${label} is required.`
  return z.string({ error: missing }).trim().min(1, missing).max(max, tooLong(max))
}

/** Optional top-level text: blank is stored as null. */
export function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, tooLong(max))
    .transform((value) => value || null)
}

/**
 * Optional text inside a holding's `details`. Blank becomes absent rather
 * than an empty string, because the details column is free-form JSON and an
 * empty key is noise in it.
 */
export function optionalDetailText(max: number) {
  return z
    .string()
    .trim()
    .max(max, tooLong(max))
    .transform((value) => value || undefined)
    .optional()
}

/**
 * holdings.principal_amount and periodic_amount are numeric(14, 2): twelve
 * digits before the point and two after. An amount outside that used to pass
 * the schema and fail at the database as "Could not save", attributed to no
 * field, and a third decimal was silently rounded away.
 */
export const LARGEST_AMOUNT = 999_999_999_999.99

function hasAtMostTwoDecimals(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-6
}

/** The checks every amount gets, whichever shape it arrives in. */
export function amountRules(value: number, ctx: z.RefinementCtx) {
  if (!Number.isFinite(value) || value < 0) {
    ctx.addIssue({ code: 'custom', message: 'Enter an amount of zero or more.' })
  } else if (value > LARGEST_AMOUNT) {
    ctx.addIssue({ code: 'custom', message: 'Enter an amount below ₹1,00,000 crore.' })
  } else if (!hasAtMostTwoDecimals(value)) {
    ctx.addIssue({ code: 'custom', message: 'Use at most two decimal places.' })
  }
}

/** A required amount held in `details` (a mutual fund's target goal). */
export function requiredDetailAmount(label: string) {
  return z.number({ error: `${label} is required.` }).superRefine(amountRules)
}

/** Whole years within a range, optional, for details such as a policy term. */
export function optionalYears(label: string, min: number, max: number) {
  return z
    .number({ error: `Enter the ${label.toLowerCase()} in years.` })
    .int('Use whole years.')
    .min(min, `${label} must be at least ${min} ${min === 1 ? 'year' : 'years'}.`)
    .max(max, `${label} must be ${max} years or less.`)
    .optional()
}

/** A real calendar date in storage form, within the app's year range. */
export function isoDateRules(value: string, ctx: z.RefinementCtx) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? fromISODate(value) : null
  if (!date) {
    ctx.addIssue({ code: 'custom', message: 'Enter a valid date.' })
    return
  }
  const year = date.getFullYear()
  if (year < EARLIEST_YEAR || year > LATEST_YEAR) {
    ctx.addIssue({
      code: 'custom',
      message: `Enter a date between ${EARLIEST_YEAR} and ${LATEST_YEAR}.`,
    })
  }
}
