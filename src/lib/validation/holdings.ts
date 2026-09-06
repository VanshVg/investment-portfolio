import { z } from 'zod'

/** Storage format is always ISO yyyy-mm-dd; DD-MM-YYYY exists only in the UI. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected yyyy-mm-dd')

// maturity_date was removed: nothing in the UI, seed script, or importer ever
// wrote it (life cover doesn't mature the way an FD does — its renewal date
// already lives in next_due_date), and .strict() makes a field cheap to drop
// now and expensive to add back once real rows exist. If a real need for a
// separate maturity date on life policies shows up, re-add it here with a
// writer and an allowlist entry (see tests/unit/components/error-slots.test.tsx)
// rather than leaving it silently unused again.
export const lifeInsuranceDetails = z
  .object({
    policy_number: z.string().min(1).optional(),
    plan_type: z.string().min(1).optional(),
    term_years: z.number().int().positive().optional(),
  })
  .strict()

export const generalInsuranceDetails = z
  .object({
    sub_category: z.enum(['health', 'vehicle', 'other']),
    insured_asset: z.string().min(1),
    policy_type: z.string().min(1),
    policy_number: z.string().min(1).optional(),
  })
  .strict()

export const mutualFundDetails = z
  .object({
    target_goal: z.number().nonnegative(),
    goal_horizon_years: z.number().int().positive().optional(),
    folio_number: z.string().min(1).optional(),
  })
  .strict()

export const fixedIncomeDetails = z
  .object({
    asset_type: z.string().min(1),
    maturity_date: isoDate.optional(),
    interest_rate: z.number().nonnegative().optional(),
    payout_frequency: z.string().min(1).optional(),
    remarks: z.string().optional(),
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
  .refine((value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value), {
    message: 'Enter a valid date.',
  })

const optionalAmount = z
  .union([z.number(), z.string(), z.null()])
  .transform((value) => {
    if (value === null) return null
    if (typeof value === 'number') return value
    const trimmed = value.trim()
    return trimmed === '' ? null : Number(trimmed)
  })
  .refine((value) => value === null || (Number.isFinite(value) && value >= 0), {
    message: 'Enter an amount of zero or more.',
  })

const holdingBase = {
  memberId: z.string().uuid().nullable(),
  managedBy: z.enum(['self', 'external']),
  label: z.string().trim().min(1, 'A name for this record is required.'),
  institution: z.string().trim().transform((v) => v || null),
  principalAmount: optionalAmount,
  periodicAmount: optionalAmount,
  nextDueDate: optionalIsoDate,
  dueFrequency: z.enum(['annual', 'half_yearly', 'quarterly', 'monthly', 'one_time']),
  remindersEnabled: z.boolean(),
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
