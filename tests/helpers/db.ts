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

/** Creates a confirmed user with the given role, replacing any existing one. */
export async function ensureUser(email: string, password: string, role = 'admin') {
  const admin = adminClient()
  const { data } = await admin.auth.admin.listUsers()
  const existing = data?.users.find((u) => u.email === email)
  if (existing) await admin.auth.admin.deleteUser(existing.id)

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'Test User', role },
  })
  if (error) throw new Error(`could not create ${email}: ${error.message}`)
  return created.user
}
