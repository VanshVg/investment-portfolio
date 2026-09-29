import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/types.generated'

/**
 * Every holding the daily job should keep a schedule for: not soft-deleted,
 * and not in a soft-deleted household (decision D2). A deleted holding keeps
 * the due instances it had, so a restore brings its schedule back, but no new
 * ones are generated for it while it is deleted.
 */
export async function listLiveHoldingIds(client: SupabaseClient<Database>): Promise<string[]> {
  const { data, error } = await client
    .from('holdings')
    .select('id, families!inner ( id )')
    .is('deleted_at', null)
    .is('families.deleted_at', null)
  if (error) throw new Error(`listing live holdings failed: ${error.message}`)
  return (data ?? []).map((row) => row.id)
}
