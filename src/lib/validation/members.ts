import { z } from 'zod'
import { optionalIndianMobile } from './contact'

export const memberRelations = [
  'self',
  'spouse',
  'son',
  'daughter',
  'father',
  'mother',
  'other',
] as const

/**
 * The consent rule mirrors the family_members_consent_needs_mobile check
 * constraint. The database remains the authority; this exists so the advisor
 * sees a field-level message instead of a raw Postgres 23514.
 */
export const memberInput = z
  .object({
    name: z.string().trim().min(1, 'Name is required.'),
    relation: z.enum(memberRelations),
    mobile: optionalIndianMobile,
    whatsappConsent: z.boolean(),
  })
  .refine((value) => !value.whatsappConsent || value.mobile !== null, {
    message: 'Add a mobile number before recording WhatsApp consent.',
    path: ['whatsappConsent'],
  })

export type MemberInput = z.infer<typeof memberInput>
