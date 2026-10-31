import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/types.generated'
import type { HoldingCategory } from '@/lib/validation/holdings'
import type { DueFrequency } from '@/lib/domain/due-dates'
import { fetchPage, type Page } from './paging'

// Re-exported rather than redeclared: HoldingCategory is derived from the Zod
// detail schemas (keyof typeof holdingDetailSchemas) and DueFrequency from the
// due-date arithmetic that actually uses it, so each has exactly one home and
// cannot drift from the code that defines what the union really means.
export type { HoldingCategory, DueFrequency }

export type MemberRelation = 'self' | 'spouse' | 'son' | 'daughter' | 'father' | 'mother' | 'other'
export type ManagedBy = 'self' | 'external'

export interface FamilySummary {
  id: string
  name: string
  headName: string | null
  headMobile: string | null
  memberCount: number
  holdingCount: number
  nextDueDate: string | null
}

export interface FamilyListResult {
  families: FamilySummary[]
  /**
   * True when more rows matched than were returned. PostgREST caps a response
   * at `max_rows` (1000, both locally and on the hosted default) and returns
   * HTTP 206 with `error: null` when it truncates — a status this client
   * never inspects — so silence here would otherwise look identical to "that
   * is every family." Not full pagination: there is no cursor to page with,
   * only a fact the caller must not swallow.
   */
  truncated: boolean
}

/** PostgREST's own cap, made explicit here instead of left implicit. */
const DEFAULT_MAX_ROWS = 1000

export interface Family {
  id: string
  name: string
  headName: string | null
  headMobile: string | null
  notes: string | null
  goalHorizonYears: number
  assumedCagr: number
}

export interface Member {
  id: string
  familyId: string
  name: string
  relation: MemberRelation
  mobile: string | null
  whatsappConsent: boolean
  whatsappConsentAt: string | null
  /** Soft-deleted (decision D2). Only ever true when asked for with includeRemoved. */
  removed: boolean
}

export interface Holding {
  id: string
  familyId: string
  memberId: string | null
  category: HoldingCategory
  managedBy: ManagedBy
  label: string
  institution: string | null
  principalAmount: number | null
  periodicAmount: number | null
  anchorDueDate: string | null
  nextDueDate: string | null
  dueFrequency: DueFrequency
  remindersEnabled: boolean
  /** Raw JSONB. Parsed by the owning category section, so one bad row does not fail the page. */
  details: unknown
}

/**
 * PostgREST parses `or=(...)` as grammar, so a search term containing a comma
 * or a parenthesis would change the filter rather than be matched literally.
 * Those characters carry no search meaning here, so they are dropped.
 *
 * `%` and `_` are ilike wildcards (any run of characters / any one character),
 * and PostgREST additionally treats `*` as an alias for `%` — left in, any of
 * the three turns a search box into an unintended "match everything" or
 * "match near enough" query. None of them is meaningful as a literal in a
 * family/head-of-family/mobile search, so they are dropped alongside the
 * filter-grammar characters above.
 */
function sanitiseSearch(term: string): string {
  return term.replace(/[,()\\%_*]/g, ' ').trim()
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))

const FAMILY_SUMMARY_SELECT =
  'id, name, head_name, head_mobile, family_members(deleted_at), holdings(next_due_date, reminders_enabled, deleted_at)'

/** Soft-deleted households are hidden everywhere (decision D2); a search narrows the rest. */
function familySummaries(client: SupabaseClient<Database>, search: string | undefined) {
  let query = client
    .from('families')
    .select(FAMILY_SUMMARY_SELECT, { count: 'exact' })
    .is('deleted_at', null)
    // The id breaks ties between households of the same name, so paging is
    // stable: a row can neither repeat nor go missing between pages.
    .order('name', { ascending: true })
    .order('id', { ascending: true })

  const term = sanitiseSearch(search ?? '')
  if (term) {
    query = query.or(`name.ilike.%${term}%,head_name.ilike.%${term}%,head_mobile.ilike.%${term}%`)
  }
  return query
}

function toFamilySummary(row: Record<string, unknown>): FamilySummary {
  // Counted here rather than with an embedded count(), so a removed member
  // or deleted holding does not inflate the figures on the list.
  const members = ((row.family_members ?? []) as { deleted_at: string | null }[]).filter(
    (m) => m.deleted_at === null,
  )
  const holdings = (
    (row.holdings ?? []) as {
      next_due_date: string | null
      reminders_enabled: boolean
      deleted_at: string | null
    }[]
  ).filter((h) => h.deleted_at === null)

  // Only reminding holdings can produce a due date the advisor will be chased about.
  const dueDates = holdings
    .filter((h) => h.reminders_enabled && h.next_due_date)
    .map((h) => h.next_due_date as string)
    .sort()

  return {
    id: row.id as string,
    name: row.name as string,
    headName: (row.head_name as string) ?? null,
    headMobile: (row.head_mobile as string) ?? null,
    memberCount: members.length,
    holdingCount: holdings.length,
    nextDueDate: dueDates[0] ?? null,
  }
}

/**
 * Every household, for pickers such as the renewals page's family filter.
 * The families page itself pages through them with `listFamiliesPage`.
 */
export async function listFamilies(
  client: SupabaseClient<Database>,
  { search, maxRows = DEFAULT_MAX_ROWS }: { search?: string; maxRows?: number } = {},
): Promise<FamilyListResult> {
  const { data, error, count } = await familySummaries(client, search).range(0, maxRows - 1)
  if (error) throw new Error(`family listing failed: ${error.message}`)
  const families = (data ?? []).map((row) => toFamilySummary(row as Record<string, unknown>))
  return { families, truncated: typeof count === 'number' && count > families.length }
}

/** One page of the families list, optionally narrowed by a search. */
export async function listFamiliesPage(
  client: SupabaseClient<Database>,
  { search, page, pageSize }: { search?: string; page: number; pageSize: number },
): Promise<Page<FamilySummary>> {
  const result = await fetchPage(
    (from, to) => familySummaries(client, search).range(from, to),
    page,
    pageSize,
  )
  return {
    ...result,
    rows: result.rows.map((row) => toFamilySummary(row as Record<string, unknown>)),
  }
}

export async function getFamily(
  client: SupabaseClient<Database>,
  familyId: string,
): Promise<Family | null> {
  const { data, error } = await client
    .from('families')
    .select('id, name, head_name, head_mobile, notes, goal_horizon_years, assumed_cagr')
    .eq('id', familyId)
    // A deleted household opens as not found, exactly like one that never was.
    .is('deleted_at', null)
    .maybeSingle()

  // A malformed id cannot name a household, so it reads as absent rather than
  // as a failure — otherwise a typo in the URL surfaces the generic error page,
  // whose retry would fail identically forever. 22P02 is invalid_text_representation.
  if (error?.code === '22P02') return null
  if (error) throw new Error(`family read failed: ${error.message}`)
  if (!data) return null

  return {
    id: data.id,
    name: data.name,
    headName: data.head_name,
    headMobile: data.head_mobile,
    notes: data.notes,
    goalHorizonYears: data.goal_horizon_years,
    // numeric(5,2) arrives as a string from PostgREST.
    assumedCagr: Number(data.assumed_cagr),
  }
}

/**
 * The household's members. Removed members are left out by default; pass
 * `includeRemoved` where a name is still needed for the holdings that stay
 * attributed to a removed member (decision D2).
 */
export async function listMembers(
  client: SupabaseClient<Database>,
  familyId: string,
  { includeRemoved = false }: { includeRemoved?: boolean } = {},
): Promise<Member[]> {
  let query = client
    .from('family_members')
    .select('id, family_id, name, relation, mobile, whatsapp_consent, whatsapp_consent_at, deleted_at')
    .eq('family_id', familyId)
    .order('created_at', { ascending: true })
  if (!includeRemoved) query = query.is('deleted_at', null)

  const { data, error } = await query
  if (error) throw new Error(`member listing failed: ${error.message}`)

  return (data ?? []).map((row) => ({
    id: row.id,
    familyId: row.family_id,
    name: row.name,
    relation: row.relation as MemberRelation,
    mobile: row.mobile,
    whatsappConsent: row.whatsapp_consent,
    whatsappConsentAt: row.whatsapp_consent_at,
    removed: row.deleted_at !== null,
  }))
}

export async function listHoldings(
  client: SupabaseClient<Database>,
  familyId: string,
): Promise<Holding[]> {
  const { data, error } = await client
    .from('holdings')
    .select(
      `id, family_id, member_id, category, managed_by, label, institution,
       principal_amount, periodic_amount, anchor_due_date, next_due_date,
       due_frequency, reminders_enabled, details`,
    )
    .eq('family_id', familyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`holding listing failed: ${error.message}`)

  return (data ?? []).map((row) => ({
    id: row.id,
    familyId: row.family_id,
    memberId: row.member_id,
    category: row.category as HoldingCategory,
    managedBy: row.managed_by as ManagedBy,
    label: row.label,
    institution: row.institution,
    principalAmount: num(row.principal_amount),
    periodicAmount: num(row.periodic_amount),
    anchorDueDate: row.anchor_due_date,
    nextDueDate: row.next_due_date,
    dueFrequency: row.due_frequency as DueFrequency,
    remindersEnabled: row.reminders_enabled,
    details: row.details,
  }))
}
