import { z } from 'zod'
import {
  amountRules,
  isoDateRules,
  MAX_LENGTH,
  optionalDetailAmount,
  optionalDetailText,
  optionalText,
  optionalYears,
  requiredDetailAmount,
  requiredText,
} from './fields'

/** Storage format is always ISO yyyy-mm-dd; DD-MM-YYYY exists only in the UI. */
const isoDate = z.string().superRefine(isoDateRules)

// maturity_date was removed: nothing in the UI, seed script, or importer ever
// wrote it (life cover doesn't mature the way an FD does — its renewal date
// already lives in next_due_date), and .strict() makes a field cheap to drop
// now and expensive to add back once real rows exist. If a real need for a
// separate maturity date on life policies shows up, re-add it here with a
// writer and an allowlist entry (see tests/unit/components/error-slots.test.tsx)
// rather than leaving it silently unused again.
export const lifeInsuranceDetails = z
  .object({
    policy_number: optionalDetailText(MAX_LENGTH.code),
    plan_type: optionalDetailText(MAX_LENGTH.short),
    term_years: optionalYears('Term', 1, 100),
  })
  .strict()

export const generalInsuranceDetails = z
  .object({
    sub_category: z.enum(['health', 'vehicle', 'other'], { error: 'Choose a category.' }),
    insured_asset: requiredText('Insured asset', MAX_LENGTH.name),
    policy_type: requiredText('Policy type', MAX_LENGTH.short),
    policy_number: optionalDetailText(MAX_LENGTH.code),
  })
  .strict()

export const mutualFundDetails = z
  .object({
    target_goal: requiredDetailAmount('Target goal'),
    // Capped at the family horizon's own limit (families_goal_horizon_positive).
    goal_horizon_years: optionalYears('Goal horizon', 1, 40),
    folio_number: optionalDetailText(MAX_LENGTH.code),
  })
  .strict()

export const fixedIncomeDetails = z
  .object({
    asset_type: requiredText('Asset type', MAX_LENGTH.short),
    // What the deposit pays out on maturity; the renewals page shows it as
    // the amount due, falling back to the amount invested (decision D4).
    maturity_amount: optionalDetailAmount(),
    maturity_date: isoDate.optional(),
    // No deposit or bond pays half its principal a year; 50% catches "750"
    // typed for 7.50 without rejecting anything real.
    interest_rate: z
      .number({ error: 'Enter the rate as a number.' })
      .min(0, 'Interest rate cannot be negative.')
      .max(50, 'Interest rate must be 50% or less.')
      .optional(),
    payout_frequency: optionalDetailText(MAX_LENGTH.short),
    remarks: optionalDetailText(MAX_LENGTH.note),
  })
  .strict()

export const holdingDetailSchemas = {
  life_insurance: lifeInsuranceDetails,
  general_insurance: generalInsuranceDetails,
  mutual_fund: mutualFundDetails,
  fixed_income: fixedIncomeDetails,
} as const

export type HoldingCategory = keyof typeof holdingDetailSchemas
export type HoldingDetails = {
  [K in HoldingCategory]: z.infer<(typeof holdingDetailSchemas)[K]>
}

// Null is included explicitly in the input union for uniformity and visibility
// at the input boundary: an empty holding draft supplies null for principalAmount,
// periodicAmount, and nextDueDate, so the schemas must accept null as input.
const optionalIsoDate = z
  .union([z.string(), z.null()])
  .transform((value) => {
    if (value === null) return null
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  })
  .superRefine((value, ctx) => {
    if (value !== null) isoDateRules(value, ctx)
  })

const optionalAmount = z
  .union([z.number(), z.string(), z.null()])
  .transform((value) => {
    if (value === null) return null
    if (typeof value === 'number') return value
    const trimmed = value.trim()
    return trimmed === '' ? null : Number(trimmed)
  })
  .superRefine((value, ctx) => {
    if (value !== null) amountRules(value, ctx)
  })

const holdingBase = {
  memberId: z.string().uuid('Choose a member from the list.').nullable(),
  managedBy: z.enum(['self', 'external'], { error: 'Choose who manages this.' }),
  label: requiredText('A name for this record', MAX_LENGTH.label),
  institution: optionalText(MAX_LENGTH.name),
  principalAmount: optionalAmount,
  periodicAmount: optionalAmount,
  nextDueDate: optionalIsoDate,
  dueFrequency: z.enum(['annual', 'half_yearly', 'quarterly', 'monthly', 'one_time']),
  remindersEnabled: z.boolean(),
  /**
   * The due date the edit form was opened with. It is how an update tells
   * "the advisor changed the date" from "the date moved underneath an open
   * form" (a renewal in the meantime) — see updateHolding. Absent on a create.
   */
  openedDueDate: optionalIsoDate.optional(),
}

/**
 * The whole row, not just the JSONB. Discriminating on category is what lets a
 * single actions module serve all four sections while still enforcing each
 * category's own required detail fields.
 */
export const holdingInput = z.discriminatedUnion('category', [
  z.object({ ...holdingBase, category: z.literal('life_insurance'), details: lifeInsuranceDetails }),
  z.object({ ...holdingBase, category: z.literal('general_insurance'), details: generalInsuranceDetails }),
  z.object({ ...holdingBase, category: z.literal('mutual_fund'), details: mutualFundDetails }),
  z.object({ ...holdingBase, category: z.literal('fixed_income'), details: fixedIncomeDetails }),
])

export type HoldingInput = z.infer<typeof holdingInput>
