import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/types.generated'
import type { HoldingCategory } from '@/lib/validation/holdings'

export interface DeletedFamily {
  id: string
  name: string
  deletedAt: string
}

export interface DeletedMember {
  id: string
  name: string
  familyId: string
  familyName: string
  deletedAt: string
}

export interface DeletedHolding {
  id: string
  label: string
  category: HoldingCategory
  familyId: string
  familyName: string
  deletedAt: string
}

export interface DeletedItems {
  families: DeletedFamily[]
  members: DeletedMember[]
  holdings: DeletedHolding[]
}

/**
 * Everything soft-deleted (decision D2), newest first, for the Deleted items
 * page. A member or holding inside a deleted household is not listed on its
 * own: it was not deleted, its household was, and restoring the household
 * brings it back.
 */
export async function listDeleted(client: SupabaseClient<Database>): Promise<DeletedItems> {
  const [families, members, holdings] = await Promise.all([
    client
      .from('families')
      .select('id, name, deleted_at')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false }),
    client
      .from('family_members')
      .select('id, name, deleted_at, families!inner ( id, name )')
      .not('deleted_at', 'is', null)
      .is('families.deleted_at', null)
      .order('deleted_at', { ascending: false }),
    client
      .from('holdings')
      .select('id, label, category, deleted_at, families!inner ( id, name )')
      .not('deleted_at', 'is', null)
      .is('families.deleted_at', null)
      .order('deleted_at', { ascending: false }),
  ])
  for (const result of [families, members, holdings]) {
    if (result.error) throw new Error(`listing deleted items failed: ${result.error.message}`)
  }

  type Family = { id: string; name: string }
  return {
    families: (families.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      deletedAt: row.deleted_at!,
    })),
    members: (members.data ?? []).map((row) => {
      const family = row.families as unknown as Family
      return {
        id: row.id,
        name: row.name,
        familyId: family.id,
        familyName: family.name,
        deletedAt: row.deleted_at!,
      }
    }),
    holdings: (holdings.data ?? []).map((row) => {
      const family = row.families as unknown as Family
      return {
        id: row.id,
        label: row.label,
        category: row.category as HoldingCategory,
        familyId: family.id,
        familyName: family.name,
        deletedAt: row.deleted_at!,
      }
    }),
  }
}
