import { z } from 'zod'
import { optionalIndianMobile } from './contact'

/** Bounds mirror the families_goal_horizon_positive and families_cagr_sane checks. */
export const familyInput = z.object({
  name: z.string().trim().min(1, 'Family name is required.'),
  headName: z.string().trim().transform((v) => v || null),
  headMobile: optionalIndianMobile,
  notes: z.string().trim().transform((v) => v || null),
  goalHorizonYears: z.coerce
    .number()
    .int('Whole years only.')
    .min(1, 'Horizon must be at least 1 year.')
    .max(40, 'Horizon must be 40 years or less.'),
  assumedCagr: z.coerce
    .number()
    .min(0, 'CAGR cannot be negative.')
    .max(30, 'CAGR must be 30% or less.'),
})

export type FamilyInput = z.infer<typeof familyInput>
