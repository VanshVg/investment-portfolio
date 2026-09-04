import type { SupabaseClient } from '@supabase/supabase-js'

export interface RenewalFilters {
  /** Inclusive ISO yyyy-mm-dd bounds. */
  from: string
  to: string
  managedBy?: 'self' | 'external'
  memberId?: string
  /** Scope to one household — also the basis of the per-family ledger view. */
  familyId?: string
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
  familyId: string
  familyName: string
  memberId: string | null
  memberName: string | null
}

/**
 * The renewal listing: every due date in a window, with the filters Hiral
 * works from. One indexed query rather than a union across categories — the
 * reason holdings is a single table.
 */
export async function listRenewals(
  client: SupabaseClient,
  filters: RenewalFilters,
): Promise<RenewalRow[]> {
  let query = client
    .from('due_instances')
    .select(
      `id, due_date, amount_due, payment_status,
       holdings!inner (
         id, label, category, managed_by, member_id, family_id,
         families!inner ( id, name ),
         family_members ( id, name )
       )`,
    )
    .gte('due_date', filters.from)
    .lte('due_date', filters.to)
    .order('due_date', { ascending: true })

  if (filters.managedBy) query = query.eq('holdings.managed_by', filters.managedBy)
  if (filters.memberId) query = query.eq('holdings.member_id', filters.memberId)
  if (filters.familyId) query = query.eq('holdings.family_id', filters.familyId)

  const { data, error } = await query
  if (error) throw new Error(`renewal listing failed: ${error.message}`)

  // The nested-join shape is wider than the generated row types express, so the
  // rows are narrowed here rather than fought with at the query builder.
  type JoinedRow = Record<string, unknown>

  return (data ?? []).map((row: JoinedRow) => {
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
      familyId: family.id,
      familyName: family.name,
      memberId: member?.id ?? null,
      memberName: member?.name ?? null,
    } as RenewalRow
  })
}
