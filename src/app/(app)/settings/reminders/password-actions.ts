'use server'

import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase/server'
import { fromZodError, type ActionResult } from '@/lib/actions/result'
import { passwordChangeInput } from '@/lib/validation/account'

/**
 * Whether `password` is the account's current one. Checked on a throwaway
 * client that keeps nothing: signing in on the request's own client would
 * replace the session cookie mid-action. The session the check opens is
 * closed again straight away, so each attempt leaves nothing behind.
 */
async function isCurrentPassword(email: string, password: string): Promise<boolean> {
  const probe = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const { error } = await probe.auth.signInWithPassword({ email, password })
  if (error) return false
  await probe.auth.signOut({ scope: 'local' })
  return true
}

/**
 * Changes the signed-in advisor's password. The account comes from the
 * session, never from `input`, and the current password must be given first,
 * so an unattended signed-in browser is not enough to take the account over.
 */
export async function changePassword(input: unknown): Promise<ActionResult> {
  const parsed = passwordChangeInput.safeParse(input)
  if (!parsed.success) return fromZodError(parsed.error)
  const { currentPassword, newPassword } = parsed.data

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) {
    return { ok: false, formError: 'Your session has expired. Sign in again.' }
  }

  if (!(await isCurrentPassword(user.email, currentPassword))) {
    return { ok: false, fieldErrors: { currentPassword: 'Current password is incorrect.' } }
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) {
    // Supabase's own rules (minimum length, reuse) are mirrored in the form,
    // so reaching here with one of them means the two have drifted apart.
    if (error.code === 'same_password') {
      return {
        ok: false,
        fieldErrors: { newPassword: 'Choose a password different from your current one.' },
      }
    }
    if (error.code === 'weak_password') {
      return { ok: false, fieldErrors: { newPassword: error.message } }
    }
    return { ok: false, formError: 'Could not change the password. Try again.' }
  }

  return { ok: true, id: user.id }
}
