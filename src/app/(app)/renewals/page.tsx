import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase/server'
import { listOverdue, listRenewals } from '@/lib/queries/renewals'
import { todayInIndia } from '@/lib/domain/dates'
import { PageHeader } from '@/components/ui/PageHeader'
import { SECTION_LEAD, SECTION_TITLE, TEXT_LINK } from '@/components/ui/styles'
import { listFamilies, listMembers } from '@/lib/queries/families'
import { RenewalFilters } from './_components/RenewalFilters'
import { parseRenewalParams } from './_components/renewal-params'
import { RenewalTable } from './_components/RenewalTable'
import { markRenewed, setPaymentStatus } from './actions'

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
  const today = todayInIndia()

  const [result, overdue, { families }, members] = await Promise.all([
    listRenewals(supabase, filters),
    // Everything late from before the period on screen. Bounded by the
    // earlier of today and the period's start, so a past date the advisor
    // has already pulled into the period is shown once, in the table below.
    listOverdue(supabase, {
      before: filters.from < today ? filters.from : today,
      today,
      managedBy: filters.managedBy,
      familyId: filters.familyId,
      memberId: filters.memberId,
    }),
    listFamilies(supabase),
    filters.familyId ? listMembers(supabase, filters.familyId) : Promise.resolve([]),
  ])

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize))
  const rangeStart = result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1
  const rangeEnd = Math.min(result.page * result.pageSize, result.total)

  return (
    <div>
      <PageHeader
        title="Renewals"
        description="Everything due across every household you track — external entries are cross-sell openings, not servicing work."
      />

      <RenewalFilters filters={filters} families={families} members={members} />

      {result.truncated && (
        <p className="mt-3 rounded border border-gold bg-gold-bg px-2.5 py-2 text-[12.5px] text-gold">
          More renewals matched this window than could be shown on one page. Narrow the filters to
          see the rest.
        </p>
      )}

      {overdue.rows.length > 0 && (
        <section aria-labelledby="renewals-overdue" className="mt-8">
          <h2 id="renewals-overdue" className={`flex items-center gap-2 ${SECTION_TITLE} !text-rust`}>
            Overdue
            <span className="rounded-full bg-rust-bg px-2 py-0.5 font-sans text-[11px] font-medium">
              {overdue.rows.length}
            </span>
          </h2>
          <p className={`mb-3 ${SECTION_LEAD}`}>
            Past their due date and not marked paid. Listed whatever period is selected.
          </p>
          <RenewalTable
            rows={overdue.rows}
            today={today}
            setPaymentStatus={setPaymentStatus}
            markRenewed={markRenewed}
          />
          {overdue.truncated && (
            <p className="mt-2 text-[12px] text-ink-soft">
              Showing the oldest {overdue.rows.length}. Narrow the filters to see the rest.
            </p>
          )}
        </section>
      )}

      <section aria-labelledby="renewals-period-heading" className="mt-8">
        <h2 id="renewals-period-heading" className={`mb-3 ${SECTION_TITLE}`}>
          Due in this period
        </h2>
        <RenewalTable
          rows={result.rows}
          today={today}
          setPaymentStatus={setPaymentStatus}
          markRenewed={markRenewed}
        />
      </section>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-soft">
        <p>
          {result.total === 0 ? ' ' : `Showing ${rangeStart}–${rangeEnd} of ${result.total}`}
        </p>
        <div className="flex gap-3">
          {result.page > 1 && (
            <Link href={pageHref(rawParams, result.page - 1)} className={TEXT_LINK}>
              ← Previous
            </Link>
          )}
          {result.page < totalPages && (
            <Link href={pageHref(rawParams, result.page + 1)} className={TEXT_LINK}>
              Next →
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
