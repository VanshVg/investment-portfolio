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
  // Keyed by the full dotted path (e.g. `details.term_years`), not just the
  // top-level segment, so a validation failure inside a nested object (the
  // `details` JSONB) attributes to the field that actually caused it instead
  // of collapsing every nested issue onto one `details` bucket.
  const fieldErrors: Record<string, string> = {}
  let formError: string | undefined

  for (const issue of error.issues) {
    const path = issue.path.join('.')
    // A path-less issue (whole-object refinement) or one that targets the
    // `details` object itself has nowhere to render as a field error — no
    // input renders under a bare `details` key — so it must surface as a
    // form error instead of silently vanishing into an unrendered bucket.
    if (path === '' || path === 'details') {
      formError ??= issue.message
      continue
    }
    if (!(path in fieldErrors)) fieldErrors[path] = issue.message
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors }
  return { ok: false, formError: formError ?? 'Please check the values and try again.' }
}

/**
 * Postgres applies RLS's USING clause to UPDATE/DELETE as a row filter, not
 * an error: a write RLS blocks comes back as `{ error: null, data: [] }`,
 * which is indistinguishable at the driver level from the row having been
 * deleted by someone else a moment earlier. Both look identical to the
 * advisor, so one message covers both instead of guessing which occurred.
 * Callers detect this by adding `.select('id')` to the write and checking
 * for an empty result — the error stays null either way.
 */
export function fromEmptyWrite(): ActionResult {
  return {
    ok: false,
    formError: 'That record could not be saved. It may have changed or been removed — refresh and try again.',
  }
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
