import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/types.generated'

export type MemberRelation = 'self' | 'spouse' | 'son' | 'daughter' | 'father' | 'mother' | 'other'
export type HoldingCategory = 'life_insurance' | 'general_insurance' | 'mutual_fund' | 'fixed_income'
export type ManagedBy = 'self' | 'external'
export type DueFrequency = 'annual' | 'half_yearly' | 'quarterly' | 'monthly' | 'one_time'

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

export async function listFamilies(
  client: SupabaseClient<Database>,
  { search, maxRows = DEFAULT_MAX_ROWS }: { search?: string; maxRows?: number } = {},
): Promise<FamilyListResult> {
  let query = client
    .from('families')
    .select(
      'id, name, head_name, head_mobile, family_members(count), holdings(next_due_date, reminders_enabled)',
      { count: 'exact' },
    )
    .order('name', { ascending: true })
    .range(0, maxRows - 1)

  const term = sanitiseSearch(search ?? '')
  if (term) {
    query = query.or(`name.ilike.%${term}%,head_name.ilike.%${term}%,head_mobile.ilike.%${term}%`)
  }

  const { data, error, count } = await query
  if (error) throw new Error(`family listing failed: ${error.message}`)

  type Row = Record<string, unknown>

  const families = (data ?? []).map((row: Row) => {
    const members = (row.family_members ?? []) as { count: number }[]
    const holdings = (row.holdings ?? []) as { next_due_date: string | null; reminders_enabled: boolean }[]

    // Only reminding holdings can produce a due date Hiral will be chased about.
    const dueDates = holdings
      .filter((h) => h.reminders_enabled && h.next_due_date)
      .map((h) => h.next_due_date as string)
      .sort()

    return {
      id: row.id as string,
      name: row.name as string,
      headName: (row.head_name as string) ?? null,
      headMobile: (row.head_mobile as string) ?? null,
      memberCount: members[0]?.count ?? 0,
      holdingCount: holdings.length,
      nextDueDate: dueDates[0] ?? null,
    }
  })

  return { families, truncated: typeof count === 'number' && count > families.length }
}

export async function getFamily(
  client: SupabaseClient<Database>,
  familyId: string,
): Promise<Family | null> {
  const { data, error } = await client
    .from('families')
    .select('id, name, head_name, head_mobile, notes, goal_horizon_years, assumed_cagr')
    .eq('id', familyId)
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

export async function listMembers(
  client: SupabaseClient<Database>,
  familyId: string,
): Promise<Member[]> {
  const { data, error } = await client
    .from('family_members')
    .select('id, family_id, name, relation, mobile, whatsapp_consent, whatsapp_consent_at')
    .eq('family_id', familyId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`member listing failed: ${error.message}`)

  return (data ?? []).map((row) => ({
    id: row.id,
    familyId: row.family_id,
    name: row.name,
    relation: row.relation as MemberRelation,
    mobile: row.mobile,
    whatsappConsent: row.whatsapp_consent,
    whatsappConsentAt: row.whatsapp_consent_at,
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
