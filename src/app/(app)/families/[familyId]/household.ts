import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/types.generated'
import { fromPostgrestError, type ActionResult } from '@/lib/actions/result'

/**
 * Null when records can be added to this household; otherwise the result to
 * return. A household deleted in another tab would otherwise accept a new
 * member or holding that nobody could ever see (decision D2).
 */
export async function householdIsLive(
  supabase: SupabaseClient<Database>,
  familyId: string,
): Promise<ActionResult | null> {
  const { data, error } = await supabase
    .from('families')
    .select('id')
    .eq('id', familyId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) return fromPostgrestError(error)
  if (!data) {
    return {
      ok: false,
      formError: 'This household has been deleted. Restore it from Deleted items to add to it.',
    }
  }
  return null
}
