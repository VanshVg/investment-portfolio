import { createServerSupabase } from '@/lib/supabase/server'
import { listOverdue, listRenewals } from '@/lib/queries/renewals'
import { pageHref, paginate, parsePage } from '@/lib/queries/paging'
import { todayInIndia } from '@/lib/domain/dates'
import { PageHeader } from '@/components/ui/PageHeader'
import { Pagination } from '@/components/ui/Pagination'
import { SECTION_LEAD, SECTION_TITLE } from '@/components/ui/styles'
import { listFamilies, listMembers } from '@/lib/queries/families'
import { RenewalFilters } from './_components/RenewalFilters'
import { parseRenewalParams } from './_components/renewal-params'
import { RenewalTable } from './_components/RenewalTable'
import { markRenewed, setPaymentStatus } from './actions'

const PERIOD_PAGE_SIZE = 50
const OVERDUE_PAGE_SIZE = 25

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
    listRenewals(supabase, { ...filters, pageSize: PERIOD_PAGE_SIZE }),
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

  // Overdue is filtered after the query (periods renewed past drop out), so
  // it is paged here, from the rows already fetched.
  const overduePage = paginate(overdue.rows, parsePage(rawParams.overduePage), OVERDUE_PAGE_SIZE)
  // Page links keep every filter and the other section's page: the raw
  // params are cloned, not the parsed filter object.
  const href = (key: string, anchor: string) => (page: number) =>
    pageHref('/renewals', rawParams, key, page, anchor)

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
        <section id="overdue" aria-labelledby="renewals-overdue" className="mt-8 scroll-mt-4">
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
            rows={overduePage.rows}
            today={today}
            setPaymentStatus={setPaymentStatus}
            markRenewed={markRenewed}
          />
          <Pagination {...overduePage} href={href('overduePage', 'overdue')} label="Overdue" />
          {overdue.truncated && (
            <p className="mt-2 text-[12px] text-ink-soft">
              Only the oldest {overdue.rows.length} overdue are listed. Narrow the filters to see
              the rest.
            </p>
          )}
        </section>
      )}

      <section
        id="due-in-period"
        aria-labelledby="renewals-period-heading"
        className="mt-8 scroll-mt-4"
      >
        <h2 id="renewals-period-heading" className={`mb-3 ${SECTION_TITLE}`}>
          Due in this period
        </h2>
        <RenewalTable
          rows={result.rows}
          today={today}
          setPaymentStatus={setPaymentStatus}
          markRenewed={markRenewed}
        />
        <Pagination {...result} href={href('page', 'due-in-period')} label="Due in this period" />
      </section>
    </div>
  )
}
