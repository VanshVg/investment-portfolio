import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/types.generated'
import { todayInIndia } from '@/lib/domain/dates'
import { dueDatesBetween } from '@/lib/domain/due-schedule'
import { ensureDueInstances } from './ensure-due-instances'

export interface ReconcileResult {
  deleted: number
  preserved: number
  created: number
  refreshed: number
}

const NOTHING: ReconcileResult = { deleted: 0, preserved: 0, created: 0, refreshed: 0 }

/**
 * Brings a holding's due instances back in line after its schedule changed
 * (anchor, next due date, or frequency edited by the advisor).
 *
 * A generated date is a projection and may be replaced. A payment status, a
 * note, or a logged reminder is evidence: the instance is kept and flagged
 * off-schedule instead. Past instances (due_date < today) are never touched
 * at all, under any circumstance — they are the advisor's record of what
 * happened, and no edit to a future schedule may rewrite them. Today itself
 * counts as not-past, matching ensureDueInstances.
 */
export async function reconcileDueInstances(
  client: SupabaseClient<Database>,
  holdingId: string,
  through: string,
): Promise<ReconcileResult> {
  const { data: holding, error } = await client
    .from('holdings')
    .select('id, anchor_due_date, next_due_date, due_frequency')
    .eq('id', holdingId)
    .maybeSingle()
  if (error) throw new Error(`reconcileDueInstances: reading holding failed: ${error.message}`)
  if (!holding) return NOTHING

  const today = todayInIndia()

  // Same rule as ensureDueInstances, deliberately: no fallback from one date
  // column to the other. A holding without both dates has no schedule, so
  // nothing is "wanted" and every future instance is off-schedule by
  // definition — which the preservation rules below then handle correctly
  // (delete the pristine ones, keep and flag the rest).
  const wanted =
    holding.anchor_due_date && holding.next_due_date
      ? dueDatesBetween(
          holding.anchor_due_date,
          holding.due_frequency,
          holding.next_due_date,
          through,
        )
      : []

  // Every instance that is not past, with the one fact that decides its
  // fate: whether a reminder has ever been logged against it. Asked as a
  // single query so an instance can never be judged pristine on stale
  // information. `.gte` (not `.gt`) on today: an instance due today is not
  // past and is eligible for reconciliation, matching ensureDueInstances.
  const { data: existing, error: readError } = await client
    .from('due_instances')
    .select('id, due_date, payment_status, note, reminder_log (id)')
    .eq('holding_id', holdingId)
    .gte('due_date', today)
  if (readError) {
    throw new Error(`reconcileDueInstances: reading instances failed: ${readError.message}`)
  }

  const offSchedule = (existing ?? []).filter((row) => !wanted.includes(row.due_date))
  const pristine = offSchedule.filter(
    (row) =>
      row.payment_status === 'unknown' &&
      row.note === null &&
      (row.reminder_log as unknown[]).length === 0,
  )
  const preserved = offSchedule.filter((row) => !pristine.includes(row))

  let deleted = 0
  if (pristine.length > 0) {
    const pristineIds = pristine.map((row) => row.id)
    const { data: removed, error: deleteError } = await client
      .from('due_instances')
      .delete()
      .in('id', pristineIds)
      .select('id')
    if (deleteError) {
      throw new Error(`reconcileDueInstances: deleting instances failed: ${deleteError.message}`)
    }
    // These exact ids were just read under this same client, so any count
    // short of all of them is worth stopping for — but it does not, on its
    // own, say why. Two distinct causes produce the identical symptom: RLS's
    // USING clause silently kept a row instead of deleting it, or a second
    // reconciliation of this same holding (the nightly job overlapping an
    // advisor's save) already deleted the same rows a moment earlier. Either
    // way, continuing would report a delete count that did not happen, so
    // this throws rather than guesses which of the two occurred.
    if (!removed || removed.length !== pristineIds.length) {
      throw new Error(
        `reconcileDueInstances: delete for holding ${holdingId} returned ` +
          `${removed?.length ?? 0} of ${pristineIds.length} requested rows — either a write ` +
          'was blocked or a concurrent reconciliation of this holding already removed them; ' +
          'refusing to report a count that did not happen',
      )
    }
    deleted = removed.length
  }

  if (preserved.length > 0) {
    const preservedIds = preserved.map((row) => row.id)
    const { data: flagged, error: flagError } = await client
      .from('due_instances')
      .update({ off_schedule: true })
      .in('id', preservedIds)
      .select('id')
    if (flagError) {
      throw new Error(`reconcileDueInstances: flagging instances failed: ${flagError.message}`)
    }
    // Same reasoning as the delete above: a short count here means either a
    // blocked write or a concurrent reconciliation of this holding got to
    // these rows first (it may have flagged them, or deleted them if they
    // were pristine under its own read) — not necessarily RLS.
    if (!flagged || flagged.length !== preservedIds.length) {
      throw new Error(
        `reconcileDueInstances: off_schedule update for holding ${holdingId} returned ` +
          `${flagged?.length ?? 0} of ${preservedIds.length} requested rows — either a write ` +
          'was blocked or a concurrent reconciliation of this holding already changed them; ' +
          'refusing to report a count that did not happen',
      )
    }
  }

  const { created, refreshed } = await ensureDueInstances(client, holdingId, through)
  return { deleted, preserved: preserved.length, created, refreshed }
}
