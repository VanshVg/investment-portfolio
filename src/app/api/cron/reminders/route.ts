import 'server-only'
import { timingSafeEqual } from 'node:crypto'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { reconcileDueInstances } from '@/lib/reminders/reconcile'
import { horizonFrom } from '@/lib/reminders/horizon'
import { runReminderSweep, type SweepResult } from '@/lib/reminders/sweep'
import { listLiveHoldingIds } from '@/lib/reminders/live-holdings'
import { todayInIndia } from '@/lib/domain/dates'

// The sweep walks every holding; it must not be served from a cache.
export const dynamic = 'force-dynamic'

/** Constant-time compare, so a wrong secret cannot be found one byte at a time. */
function secretMatches(provided: string | null): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected || !provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function GET(request: Request): Promise<Response> {
  const header = request.headers.get('authorization')
  const provided = header?.startsWith('Bearer ')
    ? header.slice('Bearer '.length)
    : null

  // Checked before anything else. This handler holds a client that bypasses
  // row-level security, so an unauthenticated caller must not reach any work.
  if (!secretMatches(provided)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createAdminSupabase()
  const today = todayInIndia()
  const through = horizonFrom(today)

  let holdingIds: string[]
  try {
    holdingIds = await listLiveHoldingIds(supabase)
  } catch {
    return Response.json({ error: 'holdings unavailable' }, { status: 500 })
  }

  let generated = 0
  let removed = 0
  for (const holdingId of holdingIds) {
    try {
      // Reconciliation, not bare generation. ensureDueInstances only adds and
      // refreshes; it never removes an instance whose date has left the
      // schedule. If the nightly job ran only that, a save whose reconciliation
      // failed would leave stale dates on the renewals page until someone
      // happened to edit that holding again — possibly never. Reconciliation
      // calls generation itself, so this costs two extra reads per holding:
      // the holding's own schedule columns, then its existing instances.
      const { created, deleted } = await reconcileDueInstances(
        supabase,
        holdingId,
        through,
      )
      generated += created
      removed += deleted
    } catch (cause) {
      console.error(
        `due-instance generation failed for holding ${holdingId}`,
        cause,
      )
    }
  }

  let sweep: SweepResult
  try {
    sweep = await runReminderSweep(supabase, today)
  } catch (cause) {
    console.error('reminder sweep failed', cause)
    // Counts only, even on failure: the caller is a scheduler, and this
    // handler holds a client that ignores RLS, so nothing it returns may
    // carry client data, error responses included.
    return Response.json({ generated, removed, sweep: null }, { status: 500 })
  }

  // Counts only. This response must never carry client data: the caller is a
  // scheduler, and the client that produced these numbers ignores RLS.
  return Response.json({ generated, removed, sweep })
}
