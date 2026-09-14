import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase/server'
import { listRenewals } from '@/lib/queries/renewals'
import { listFamilies, listMembers } from '@/lib/queries/families'
import { RenewalFilters } from './_components/RenewalFilters'
import { parseRenewalParams } from './_components/renewal-params'
import { RenewalTable } from './_components/RenewalTable'

/** Builds a page link that preserves every other search param — a filter that
 * resets when the advisor pages through results is worse than no paging at
 * all, so this clones the raw params rather than the parsed filter object. */
function pageHref(rawParams: Record<string, string | undefined>, page: number): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(rawParams)) {
    if (value) params.set(key, value)
  }
  params.set('page', String(page))
  return `/renewals?${params.toString()}`
}

export default async function RenewalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const rawParams = await searchParams
  const supabase = await createServerSupabase()
  const filters = parseRenewalParams(rawParams)

  const [result, { families }, members] = await Promise.all([
    listRenewals(supabase, filters),
    listFamilies(supabase),
    filters.familyId ? listMembers(supabase, filters.familyId) : Promise.resolve([]),
  ])

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize))
  const rangeStart = result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1
  const rangeEnd = Math.min(result.page * result.pageSize, result.total)

  return (
    <div className="pt-7">
      <h1 className="mb-1 font-serif text-[22px] font-semibold text-navy">Renewals</h1>
      <p className="mb-4 text-[12.5px] text-ink-soft">
        Everything due across every household you track — external entries are cross-sell
        openings, not servicing work.
      </p>

      <RenewalFilters filters={filters} families={families} members={members} />

      {result.truncated && (
        <p className="mt-3 rounded border border-gold bg-gold-bg px-2.5 py-2 text-[12.5px] text-gold">
          More renewals matched this window than could be shown on one page. Narrow the filters to
          see the rest.
        </p>
      )}

      <div className="mt-3">
        <RenewalTable rows={result.rows} />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-soft">
        <p>
          {result.total === 0 ? ' ' : `Showing ${rangeStart}–${rangeEnd} of ${result.total}`}
        </p>
        <div className="flex gap-3">
          {result.page > 1 && (
            <Link href={pageHref(rawParams, result.page - 1)} className="underline hover:text-navy">
              ← Previous
            </Link>
          )}
          {result.page < totalPages && (
            <Link href={pageHref(rawParams, result.page + 1)} className="underline hover:text-navy">
              Next →
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
