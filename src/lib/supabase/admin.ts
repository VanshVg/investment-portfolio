import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/types.generated'

/**
 * Service-role client. Bypasses row-level security.
 * Permitted only in seed scripts and the reminder cron handler.
 * The `server-only` import makes importing this from a client component a build error.
 */
export function createAdminSupabase() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}
