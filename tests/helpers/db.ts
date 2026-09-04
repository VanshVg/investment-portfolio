import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const URL = () => process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = () => process.env.SUPABASE_SERVICE_ROLE_KEY!

/** Unauthenticated client. Every RLS policy should reject it. */
export function anonClient(): SupabaseClient {
  return createClient(URL(), ANON())
}

/** Service-role client. Bypasses RLS — use only to arrange test fixtures. */
export function adminClient(): SupabaseClient {
  return createClient(URL(), SERVICE(), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Client carrying a real user session, subject to RLS. */
export async function signedInClient(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(URL(), ANON(), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`)
  return client
}

/**
 * Creates a confirmed user with the given role, or reuses one that already
 * exists with that email. Tables such as `families` reference `profiles`
 * with `on delete restrict` — an advisor who still owns client household
 * data must not be silently deletable — so once a test user owns rows
 * elsewhere, deleting and recreating it here would fail. Reusing avoids
 * that entirely; do not "simplify" this back to delete-and-recreate.
 */
export async function ensureUser(email: string, password: string, role = 'admin') {
  const admin = adminClient()
  const { data } = await admin.auth.admin.listUsers()
  const existing = data?.users.find((u) => u.email === email)

  if (existing) {
    const { data: updated, error } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Test User', role },
    })
    if (error) throw new Error(`could not update ${email}: ${error.message}`)

    // The profile row was created by the on-insert trigger the first time
    // this user was made; updating auth.users does not touch it. Sync the
    // role explicitly. The service-role client bypasses both RLS and the
    // column-level revoke on profiles.role, so this is expected to succeed.
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .update({ role })
      .eq('id', existing.id)
      .select('role')
      .single()
    if (profileError) throw new Error(`could not sync role for ${email}: ${profileError.message}`)
    if (profile?.role !== role) {
      throw new Error(`role sync for ${email} did not take effect: got ${profile?.role}`)
    }

    return updated.user
  }

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'Test User', role },
  })
  if (error) throw new Error(`could not create ${email}: ${error.message}`)
  return created.user
}
