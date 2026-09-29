'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabase/server'
import { fromEmptyWrite, fromPostgrestError, type ActionResult } from '@/lib/actions/result'

type SoftDeletable = 'families' | 'family_members' | 'holdings'

/**
 * Clears deleted_at, bringing a soft-deleted record back exactly as it was
 * (decision D2). Filtered on deleted_at being set, so restoring something
 * already live reports failure instead of silently succeeding, and
 * `.select` tells a real restore from RLS quietly keeping the row.
 */
async function restore(table: SoftDeletable, id: string): Promise<ActionResult> {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from(table)
    .update({ deleted_at: null })
    .eq('id', id)
    .not('deleted_at', 'is', null)
    .select('id')
  if (error) return fromPostgrestError(error)
  if (!data || data.length === 0) return fromEmptyWrite()

  revalidatePath('/deleted')
  revalidatePath('/families')
  revalidatePath('/renewals')
  // Whichever household it belongs to: the route pattern refreshes them all,
  // which saves a read just to learn the family id.
  revalidatePath('/families/[familyId]', 'page')
  return { ok: true, id }
}

export async function restoreFamily(id: string): Promise<ActionResult> {
  return restore('families', id)
}

export async function restoreMember(id: string): Promise<ActionResult> {
  return restore('family_members', id)
}

export async function restoreHolding(id: string): Promise<ActionResult> {
  return restore('holdings', id)
}
