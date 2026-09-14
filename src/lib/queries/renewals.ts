import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/types.generated'
import type { DueFrequency } from '@/lib/domain/due-dates'

export interface RenewalFilters {
  /** Inclusive ISO yyyy-mm-dd bounds. */
  from: string
  to: string
  managedBy?: 'self' | 'external'
  memberId?: string
  /** Scope to one household — also the basis of the per-family ledger view. */
  familyId?: string
  /** 1-based. Defaults to 1. */
  page?: number
  /** Defaults to 100. */
  pageSize?: number
}

export interface RenewalRow {
  dueInstanceId: string
  dueDate: string
  amountDue: number | null
  paymentStatus: 'paid' | 'unpaid' | 'unknown'
  holdingId: string
  label: string
  category: string
  managedBy: 'self' | 'external'
  /**
   * A `one_time` holding has no next period, so the row-action layer must not
   * offer "mark as renewed" on it — carried here rather than forcing a second
   * query against the same holding just to make that decision.
   */
  dueFrequency: DueFrequency
  familyId: string
  familyName: string
  memberId: string | null
  memberName: string | null
  /**
   * True when this instance's due date no longer sits on the holding's
   * current schedule (kept because it carries payment evidence, a note, or a
   * logged reminder — see reconcileDueInstances) rather than one the schedule
   * still generates.
   */
  offSchedule: boolean
  /** Distinct reminder windows already queued or sent for this instance. */
  firedWindows: number[]
}

export interface RenewalListResult {
  rows: RenewalRow[]
  /** Matching rows across every page, not just this one. */
  total: number
  page: number
  pageSize: number
  /**
   * True when more due instances matched the window than were returned.
   * PostgREST caps a response at `max_rows` (1000, both locally and on the
   * hosted default) and returns HTTP 206 with `error: null` when it
   * truncates — a status this client never inspects. Retained as a backstop
   * now that the query pages properly: a page size equal to PostgREST's own
   * cap would still truncate silently, and this is the page where that first
   * bites.
   */
  truncated: boolean
}

/** PostgREST's own cap, made explicit here instead of left implicit. */
const DEFAULT_MAX_ROWS = 1000

/**
 * The renewal listing: every due date in a window, with the filters Hiral
 * works from. One indexed query rather than a union across categories — the
 * reason holdings is a single table.
 */
export async function listRenewals(
  client: SupabaseClient<Database>,
  filters: RenewalFilters,
  { maxRows = DEFAULT_MAX_ROWS }: { maxRows?: number } = {},
): Promise<RenewalListResult> {
  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(Math.max(1, filters.pageSize ?? 100), maxRows)
  const offset = (page - 1) * pageSize

  // Ties on a due date are the normal case, not an edge case: a household
  // with four policies renewing in the same week produces them constantly.
  // Ordering by date alone leaves the tiebreak to the planner, and an
  // unstable order across pages means a row can appear twice or not at all.
  let query = client
    .from('due_instances')
    .select(
      `id, due_date, amount_due, payment_status, off_schedule,
       reminder_log ( days_before ),
       holdings!inner (
         id, label, category, managed_by, due_frequency, member_id, family_id,
         families!inner ( id, name ),
         family_members ( id, name )
       )`,
      { count: 'exact' },
    )
    .gte('due_date', filters.from)
    .lte('due_date', filters.to)
    .order('due_date', { ascending: true })
    .order('id', { ascending: true })
    .range(offset, offset + pageSize - 1)

  if (filters.managedBy) query = query.eq('holdings.managed_by', filters.managedBy)
  if (filters.memberId) query = query.eq('holdings.member_id', filters.memberId)
  if (filters.familyId) query = query.eq('holdings.family_id', filters.familyId)

  const { data, error, count } = await query
  if (error) throw new Error(`renewal listing failed: ${error.message}`)

  // The nested-join shape is wider than the generated row types express, so the
  // rows are narrowed here rather than fought with at the query builder.
  type JoinedRow = Record<string, unknown>

  const rows = (data ?? []).map((row: JoinedRow) => {
    const holding = row.holdings as JoinedRow
    const family = holding.families as JoinedRow
    const member = holding.family_members as JoinedRow | null

    return {
      dueInstanceId: row.id,
      dueDate: row.due_date,
      amountDue: row.amount_due === null ? null : Number(row.amount_due),
      paymentStatus: row.payment_status,
      holdingId: holding.id,
      label: holding.label,
      category: holding.category,
      managedBy: holding.managed_by,
      dueFrequency: holding.due_frequency,
      familyId: family.id,
      familyName: family.name,
      memberId: member?.id ?? null,
      memberName: member?.name ?? null,
      offSchedule: row.off_schedule === true,
      firedWindows: [
        ...new Set(
          (row.reminder_log as { days_before: number }[] | null)?.map((r) => r.days_before) ?? [],
        ),
      ].sort((a, b) => b - a),
    } as RenewalRow
  })

  return {
    rows,
    total: count ?? rows.length,
    page,
    pageSize,
    truncated: rows.length >= maxRows,
  }
}
