import { z } from 'zod'

export type ActionResult =
  | { ok: true; id: string }
  | { ok: false; formError?: string; fieldErrors?: Record<string, string> }

/**
 * Check constraints the advisor can actually trigger from the UI. Mapping them
 * by constraint name keeps the message next to the rule it explains, and keeps
 * Postgres text out of the interface.
 */
const CONSTRAINT_MESSAGES: Record<string, { field: string; message: string }> = {
  family_members_consent_needs_mobile: {
    field: 'whatsappConsent',
    message: 'Add a mobile number before recording WhatsApp consent.',
  },
  families_goal_horizon_positive: {
    field: 'goalHorizonYears',
    message: 'Horizon must be between 1 and 40 years.',
  },
  families_cagr_sane: {
    field: 'assumedCagr',
    message: 'Assumed CAGR must be between 0 and 30%.',
  },
}

const CODE_MESSAGES: Record<string, string> = {
  '23503': 'A linked record is missing or was already deleted. Refresh and try again.',
  '23505': 'That record already exists.',
  '42501': 'You do not have permission to make that change.',
}

export function fromZodError(error: z.ZodError): ActionResult {
  // z.flattenError's declared type depends on the schema's inferred output type,
  // which is unknown here since callers pass errors from many different schemas.
  // At runtime it always returns this shape regardless of T (verified against 4.5.4).
  const flat = z.flattenError(error) as { formErrors: string[]; fieldErrors: Record<string, string[]> }

  const fieldErrors: Record<string, string> = {}
  for (const [field, messages] of Object.entries(flat.fieldErrors)) {
    if (messages && messages.length > 0) fieldErrors[field] = messages[0] as string
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors }
  return { ok: false, formError: flat.formErrors[0] ?? 'Please check the values and try again.' }
}

export function fromPostgrestError(error: {
  code?: string | null
  message?: string | null
}): ActionResult {
  const message = error.message ?? ''

  const constraint = Object.keys(CONSTRAINT_MESSAGES).find((name) => message.includes(name))
  if (constraint) {
    const mapped = CONSTRAINT_MESSAGES[constraint]
    return { ok: false, fieldErrors: { [mapped.field]: mapped.message } }
  }

  return { ok: false, formError: CODE_MESSAGES[error.code ?? ''] ?? 'Could not save. Please try again.' }
}
