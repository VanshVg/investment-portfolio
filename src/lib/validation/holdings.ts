import { z } from 'zod'

/** Storage format is always ISO yyyy-mm-dd; DD-MM-YYYY exists only in the UI. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected yyyy-mm-dd')

export const lifeInsuranceDetails = z
  .object({
    policy_number: z.string().min(1).optional(),
    plan_type: z.string().min(1).optional(),
    term_years: z.number().int().positive().optional(),
    maturity_date: isoDate.optional(),
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
    fund_house: z.string().min(1).optional(),
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

/** Validates the JSONB payload for a holding. Throws ZodError when invalid. */
export function parseHoldingDetails<C extends HoldingCategory>(
  category: C,
  details: unknown,
): HoldingDetails[C] {
  return holdingDetailSchemas[category].parse(details) as HoldingDetails[C]
}
