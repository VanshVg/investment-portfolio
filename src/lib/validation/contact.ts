import { z } from 'zod'

/**
 * WhatsApp Business APIs address recipients in E.164, so numbers are normalised
 * on entry rather than at send time — an inconsistent store discovered during
 * the messaging build would be far more expensive to correct.
 *
 * Accepts 10-digit, 0-prefixed, 91-prefixed and +91-prefixed forms with any
 * spacing or dashes. Returns null for anything that is not a valid Indian
 * mobile number.
 */
export function normaliseIndianMobile(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')

  const local =
    digits.length === 10
      ? digits
      : digits.length === 11 && digits.startsWith('0')
        ? digits.slice(1)
        : digits.length === 12 && digits.startsWith('91')
          ? digits.slice(2)
          : null

  if (local === null) return null
  // Indian mobile numbers begin 6-9. Landlines and typos do not.
  if (!/^[6-9]\d{9}$/.test(local)) return null

  return `+91${local}`
}

/** Blank means "not provided" and is valid; anything present must be a real number. */
export const optionalIndianMobile = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => value === '' || normaliseIndianMobile(value) !== null, {
    message: 'Enter a 10-digit Indian mobile number.',
  })
  .transform((value) => (value === '' ? null : normaliseIndianMobile(value)))
