import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/types.generated'
import { todayInIndia } from '@/lib/domain/dates'
import { dueDatesBetween } from '@/lib/domain/due-schedule'

export interface EnsureResult {
  created: number
  refreshed: number
  /**
   * Rows whose `off_schedule` flag was cleared because their date came back
   * onto the schedule. Reported separately from `refreshed` since the two
   * updates are scoped by different rules (see below) and conflating their
   * counts would hide which kind of change actually happened on a given run.
   */
  offScheduleCleared: number
}

const NOTHING: EnsureResult = { created: 0, refreshed: 0, offScheduleCleared: 0 }

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

  const today = todayInIndia()

  // Two windows over the same grid, deliberately different. Generation starts
  // at next_due_date, so it never invents a date the holding has already
  // moved past. Being on schedule means being on the grid from today: a date
  // renewed early sits before next_due_date and is still a real due date of
  // this holding. reconcileDueInstances classifies the same way.
  const dates = dueDatesBetween(
    holding.anchor_due_date,
    holding.due_frequency,
    holding.next_due_date,
    through,
  )
  const onSchedule = dueDatesBetween(
    holding.anchor_due_date,
    holding.due_frequency,
    today,
    through,
  )

  let created = 0
  let refreshed = 0
  let offScheduleCleared = 0

  if (dates.length > 0) {
    // Step 1 — insert what is missing. ignoreDuplicates means existing rows
    // are left exactly as they are, which is why the updates below exist.
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
    created = inserted?.length ?? 0
  }

  if (onSchedule.length > 0) {
    // Step 2 — clear off_schedule on rows whose date is back on the schedule.
    // Unqualified by pristine-ness: the flag only records whether the date is
    // currently part of the schedule, and a date the advisor has ticked or
    // annotated can still return to it (that is the whole point of preserving
    // it instead of deleting it). Never before today, because past instances
    // are not modified; onSchedule starts at today, and the explicit bound
    // keeps that true if the window ever changes. Scoped to currently-true
    // rows so a steady-state run matches nothing and doesn't churn a row
    // version through the updated_at trigger.
    const { data: cleared, error: clearError } = await client
      .from('due_instances')
      .update({ off_schedule: false })
      .eq('holding_id', holdingId)
      .in('due_date', onSchedule)
      .gte('due_date', today)
      .eq('off_schedule', true)
      .select('id')
    if (clearError) {
      throw new Error(`ensureDueInstances: clearing off_schedule failed: ${clearError.message}`)
    }
    offScheduleCleared = cleared?.length ?? 0
  }

  // A null periodic_amount means the holding has no recurring premium (a
  // fixed deposit, say), not that every instance owes nothing. Refreshing to
  // null would erase an amount set by hand, by the seed or by an importer, so
  // the refresh only ever writes a real amount.
  const periodicAmount = holding.periodic_amount
  if (dates.length > 0 && periodicAmount !== null) {
    // Step 3 — refresh amount_due on rows that are in the generated schedule,
    // not in the past (today counts as not-past), and pristine (no payment
    // status recorded, no note): a past instance records what was actually
    // owed, and one the advisor has ticked or annotated is evidence. Neither
    // may be rewritten. Also scoped to rows whose amount actually differs from
    // the holding's current periodic_amount, so a steady-state run matches
    // nothing and `refreshed` means "changed," not "matched." amount_due is
    // nullable and `neq` does not match nulls, so a null amount is matched
    // explicitly.
    const { data: refreshedRows, error: refreshError } = await client
      .from('due_instances')
      .update({ amount_due: periodicAmount })
      .eq('holding_id', holdingId)
      .in('due_date', dates)
      .gte('due_date', today)
      .eq('payment_status', 'unknown')
      .is('note', null)
      .or(`amount_due.is.null,amount_due.neq.${periodicAmount}`)
      .select('id')
    if (refreshError) {
      throw new Error(`ensureDueInstances: refreshing instances failed: ${refreshError.message}`)
    }
    refreshed = refreshedRows?.length ?? 0
  }

  return { created, refreshed, offScheduleCleared }
}
