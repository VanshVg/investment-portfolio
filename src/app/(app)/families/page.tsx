import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase/server'
import { listFamiliesPage } from '@/lib/queries/families'
import { pageHref, parsePage } from '@/lib/queries/paging'
import { Pagination } from '@/components/ui/Pagination'
import { TEXT_LINK } from '@/components/ui/styles'
import { FamilyList } from './_components/FamilyList'
import { FamilySearch } from './_components/FamilySearch'
import { createFamily, deleteFamily } from './actions'

const PAGE_SIZE = 50

export default async function FamiliesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>
}) {
  const params = await searchParams
  const search = params.q?.trim() || undefined
  const supabase = await createServerSupabase()
  // A new search always starts on page 1: the search box writes only `q`.
  const result = await listFamiliesPage(supabase, {
    search,
    page: parsePage(params.page),
    pageSize: PAGE_SIZE,
  })

  const toolbar = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <FamilySearch search={search} />
      {search && (
        <p className="text-[12.5px] text-ink-soft">
          {result.total} {result.total === 1 ? 'match' : 'matches'} for “{search}” ·{' '}
          <Link href="/families" className={TEXT_LINK}>
            Clear search
          </Link>
        </p>
      )}
    </div>
  )

  return (
    <div>
      <FamilyList
        families={result.rows}
        search={search}
        toolbar={toolbar}
        createFamily={createFamily}
        deleteFamily={deleteFamily}
      />

      <Pagination
        {...result}
        href={(page) => pageHref('/families', params, 'page', page)}
        label="Families"
      />
    </div>
  )
}
