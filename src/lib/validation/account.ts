import { z } from 'zod'

/**
 * Matches the minimum set in Supabase (Authentication → Email provider), so
 * the form explains a short password instead of the server rejecting it.
 */
export const MIN_PASSWORD_LENGTH = 12

/** bcrypt, which Supabase hashes passwords with, reads only the first 72 bytes. */
const MAX_PASSWORD_LENGTH = 72

/**
 * Passwords are used exactly as typed, so none of these fields is trimmed:
 * a leading or trailing space is part of the password.
 */
export const passwordChangeInput = z
  .object({
    currentPassword: z
      .string({ error: 'Enter your current password.' })
      .min(1, 'Enter your current password.'),
    newPassword: z
      .string({ error: 'Enter a new password.' })
      .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
      .max(MAX_PASSWORD_LENGTH, `Use no more than ${MAX_PASSWORD_LENGTH} characters.`),
    confirmPassword: z.string({ error: 'Enter the new password again.' }),
  })
  .refine((value) => value.confirmPassword === value.newPassword, {
    path: ['confirmPassword'],
    message: 'The two new passwords do not match.',
  })
  .refine((value) => value.newPassword !== value.currentPassword, {
    path: ['newPassword'],
    message: 'Choose a password different from your current one.',
  })

export type PasswordChangeInput = z.infer<typeof passwordChangeInput>
