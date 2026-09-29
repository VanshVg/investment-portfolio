import { z } from 'zod'
import { optionalIndianMobile } from './contact'
import { MAX_LENGTH, optionalText, requiredText } from './fields'

/** Bounds mirror the families_goal_horizon_positive and families_cagr_sane checks. */
export const familyInput = z.object({
  name: requiredText('Family name', MAX_LENGTH.name),
  headName: optionalText(MAX_LENGTH.name),
  headMobile: optionalIndianMobile,
  notes: optionalText(MAX_LENGTH.note),
  goalHorizonYears: z.coerce
    .number({ error: 'Enter the horizon in years.' })
    .int('Whole years only.')
    .min(1, 'Horizon must be at least 1 year.')
    .max(40, 'Horizon must be 40 years or less.'),
  assumedCagr: z.coerce
    .number({ error: 'Enter the CAGR as a number.' })
    .min(0, 'CAGR cannot be negative.')
    .max(30, 'CAGR must be 30% or less.'),
})

export type FamilyInput = z.infer<typeof familyInput>
