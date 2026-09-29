import { createClient } from '@supabase/supabase-js'

/**
 * Deleting a household in the app is a soft delete (decision D2), so a
 * browser test that deletes its fixture household through the UI — which is
 * the journey being tested — leaves it behind, hidden, on every run. This
 * removes them for real afterwards, with the service role, and touches
 * nothing but households whose names carry the E2E prefix these specs use.
 */
export async function purgeE2EHouseholds(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return
  const admin = createClient(url, key, { auth: { persistSession: false } })
  const { error } = await admin.from('families').delete().like('name', 'E2E%')
  if (error) throw new Error(`E2E cleanup failed: ${error.message}`)
}
