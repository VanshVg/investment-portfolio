import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase/server'
import { listFamilies } from '@/lib/queries/families'
import { TEXT_LINK } from '@/components/ui/styles'
import { FamilyList } from './_components/FamilyList'
import { FamilySearch } from './_components/FamilySearch'
import { createFamily, deleteFamily } from './actions'

export default async function FamiliesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const search = q?.trim() || undefined
  const supabase = await createServerSupabase()
  const { families, truncated } = await listFamilies(supabase, { search })

  const toolbar = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <FamilySearch search={search} />
      {search && (
        <p className="text-[12.5px] text-ink-soft">
          {families.length} {families.length === 1 ? 'match' : 'matches'} for “{search}” ·{' '}
          <Link href="/families" className={TEXT_LINK}>
            Clear search
          </Link>
        </p>
      )}
      {/* Soft-deleted records (decision D2) live here, one click from the list
          they were deleted from. */}
      <Link href="/deleted" className={`ml-auto ${TEXT_LINK}`}>
        Deleted items
      </Link>
    </div>
  )

  return (
    <div>
      <FamilyList
        families={families}
        search={search}
        toolbar={toolbar}
        createFamily={createFamily}
        deleteFamily={deleteFamily}
      />

      {truncated && (
        <p className="mt-3 rounded border border-gold bg-gold-bg px-3 py-2 text-[12.5px] text-gold">
          Showing the first {families.length} families. Narrow your search to see the rest.
        </p>
      )}
    </div>
  )
}
