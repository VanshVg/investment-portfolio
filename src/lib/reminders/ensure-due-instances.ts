import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/types.generated'
import { dueDatesBetween } from '@/lib/domain/due-schedule'

export interface EnsureResult {
  created: number
  refreshed: number
}

const NOTHING: EnsureResult = { created: 0, refreshed: 0 }

/**
 * Makes the due instances for one holding match its schedule, up to `through`.
 *
 * Idempotent: the unique constraint on (holding_id, due_date) absorbs the
 * insert, and the update touches only rows that are safe to change. Safe to run
 * from the save path and the daily job, in any order, any number of times.
 */
export async function ensureDueInstances(
  client: SupabaseClient<Database>,
  holdingId: string,
  through: string,
): Promise<EnsureResult> {
  const { data: holding, error } = await client
    .from('holdings')
    .select('id, anchor_due_date, next_due_date, due_frequency, periodic_amount')
    .eq('id', holdingId)
    .maybeSingle()
  if (error) throw new Error(`ensureDueInstances: reading holding failed: ${error.message}`)
  if (!holding) return NOTHING

  // The anchor defines the grid; next_due_date defines where this system's
  // responsibility starts. A holding missing either has no schedule to generate.
  if (!holding.anchor_due_date || !holding.next_due_date) return NOTHING

  const dates = dueDatesBetween(
    holding.anchor_due_date,
    holding.due_frequency,
    holding.next_due_date,
    through,
  )
  if (dates.length === 0) return NOTHING

  // Step 1 — insert what is missing. ignoreDuplicates means existing rows are
  // left exactly as they are, which is why step 2 exists at all.
  const { data: inserted, error: insertError } = await client
    .from('due_instances')
    .upsert(
      dates.map((due_date) => ({
        holding_id: holdingId,
        due_date,
        amount_due: holding.periodic_amount,
      })),
      { onConflict: 'holding_id,due_date', ignoreDuplicates: true },
    )
    .select('id')
  if (insertError) {
    throw new Error(`ensureDueInstances: inserting instances failed: ${insertError.message}`)
  }

  // Step 2 — bring existing rows back in line. Restricted to future, pristine
  // rows: a past instance records what was actually owed, and one the advisor
  // has ticked or annotated is evidence. Neither may be rewritten.
  const today = new Date().toISOString().slice(0, 10)
  const { data: refreshed, error: updateError } = await client
    .from('due_instances')
    .update({ off_schedule: false, amount_due: holding.periodic_amount })
    .eq('holding_id', holdingId)
    .in('due_date', dates)
    .gt('due_date', today)
    .eq('payment_status', 'unknown')
    .is('note', null)
    .select('id')
  if (updateError) {
    throw new Error(`ensureDueInstances: refreshing instances failed: ${updateError.message}`)
  }

  return { created: inserted?.length ?? 0, refreshed: refreshed?.length ?? 0 }
}
