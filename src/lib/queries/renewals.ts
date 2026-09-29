import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/types.generated'
import { differenceInCalendarDays } from 'date-fns'
import type { DueFrequency } from '@/lib/domain/due-dates'
import { fromISODate } from '@/lib/domain/dates'

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
  /**
   * The holding's current due date, which may differ from this instance's own
   * `dueDate`. Only the instance on that date can be marked renewed.
   */
  holdingNextDueDate: string | null
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
   * True when a page came back exactly as large as `maxRows` — a signal that
   * the requested page size collided with PostgREST's own response cap
   * (1000, both locally and on the hosted default), which returns HTTP 206
   * with `error: null` when it truncates, a status this client never
   * inspects. With the renewals page's own page size fixed well under that
   * cap, this cannot fire from that call site today; it is a backstop for
   * any future caller that raises `pageSize` up toward `maxRows`.
   */
  truncated: boolean
}

/** PostgREST's own cap, made explicit here instead of left implicit. */
const DEFAULT_MAX_ROWS = 1000

/**
 * Whether a due date has gone by without the advisor recording it as paid.
 *
 * The one definition, used by both the overdue query and the table's badge.
 * Due today is not yet late. An off-schedule instance is kept only as
 * evidence after the schedule moved, so nothing is owed on it. And a period
 * the holding has already been renewed past is closed whatever its tick
 * reads — the same rule the reminder sweep applies before messaging anyone
 * about it (see `runReminderSweep`), so the page never calls something
 * overdue that the engine has already treated as settled.
 */
export function isOverdue(
  row: Pick<RenewalRow, 'dueDate' | 'paymentStatus' | 'offSchedule' | 'holdingNextDueDate'>,
  today: string,
): boolean {
  if (row.dueDate >= today) return false
  if (row.paymentStatus === 'paid') return false
  if (row.offSchedule) return false
  if (row.holdingNextDueDate && row.dueDate < row.holdingNextDueDate) return false
  return true
}

/** Whole calendar days from a due date to today. Both are ISO yyyy-mm-dd. */
export function daysOverdue(dueDate: string, today: string): number {
  return differenceInCalendarDays(fromISODate(today)!, fromISODate(dueDate)!)
}

/**
 * Shared by both listings, so an overdue row and an in-period row can never
 * disagree about shape — the same table renders either.
 */
const RENEWAL_ROW_SELECT = `id, due_date, amount_due, payment_status, off_schedule,
   reminder_log ( days_before ),
   holdings!inner (
     id, label, category, managed_by, due_frequency, next_due_date, member_id, family_id,
     families!inner ( id, name ),
     family_members ( id, name )
   )`

// The nested-join shape is wider than the generated row types express, so the
// rows are narrowed here rather than fought with at the query builder.
type JoinedRow = Record<string, unknown>

function toRenewalRow(row: JoinedRow): RenewalRow {
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
    holdingNextDueDate: (holding.next_due_date as string | null) ?? null,
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
}

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
    .select(RENEWAL_ROW_SELECT, { count: 'exact' })
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

  const rows = (data ?? []).map((row) => toRenewalRow(row as JoinedRow))

  return {
    rows,
    total: count ?? rows.length,
    page,
    pageSize,
    truncated: rows.length >= maxRows,
  }
}

export interface OverdueFilters {
  /**
   * Exclusive upper bound. The caller passes the earlier of today and the
   * start of the period on screen, so a past date the advisor has already
   * pulled into view is not listed a second time above it.
   */
  before: string
  /** The Indian calendar day, for `isOverdue`. */
  today: string
  managedBy?: 'self' | 'external'
  memberId?: string
  familyId?: string
}

/** Overdue rows are a to-do list that should stay short; this is a backstop. */
const DEFAULT_MAX_OVERDUE = 200

/**
 * Every due date that has gone by unpaid, oldest first, whatever period the
 * advisor is looking at.
 *
 * The listing page opens on today onwards, so without this a premium missed
 * last week vanished from the one page built to catch it. The scope filters
 * (managed by, family, member) still apply; the date range deliberately does
 * not.
 *
 * The database narrows to past, unpaid, on-schedule rows. `isOverdue` then
 * drops periods already renewed past, which needs a comparison between two
 * columns that PostgREST cannot express — and running the one shared
 * definition over every row keeps this list and the table's badge from
 * drifting apart.
 */
export async function listOverdue(
  client: SupabaseClient<Database>,
  filters: OverdueFilters,
  { maxRows = DEFAULT_MAX_OVERDUE }: { maxRows?: number } = {},
): Promise<{ rows: RenewalRow[]; truncated: boolean }> {
  let query = client
    .from('due_instances')
    .select(RENEWAL_ROW_SELECT)
    .lt('due_date', filters.before)
    .neq('payment_status', 'paid')
    .eq('off_schedule', false)
    .order('due_date', { ascending: true })
    .order('id', { ascending: true })
    .limit(maxRows)

  if (filters.managedBy) query = query.eq('holdings.managed_by', filters.managedBy)
  if (filters.memberId) query = query.eq('holdings.member_id', filters.memberId)
  if (filters.familyId) query = query.eq('holdings.family_id', filters.familyId)

  const { data, error } = await query
  if (error) throw new Error(`overdue listing failed: ${error.message}`)

  const fetched = (data ?? []).map((row) => toRenewalRow(row as JoinedRow))
  return {
    rows: fetched.filter((row) => isOverdue(row, filters.today)),
    // Judged on what the database returned, before the in-memory filter, so
    // a capped query still reports itself even if that filter then drops rows.
    truncated: fetched.length >= maxRows,
  }
}
