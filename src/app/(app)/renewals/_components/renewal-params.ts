import { addDays } from 'date-fns'
import { fromISODate, toISODate } from '@/lib/domain/dates'
import type { RenewalFilters as RenewalFilterValues } from '@/lib/queries/renewals'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function isIsoDate(value: string | undefined): value is string {
  return typeof value === 'string' && ISO_DATE.test(value) && fromISODate(value) !== null
}

/** The page opens on the next 30 days, so there is always something actionable on it. */
export function defaultRange(today: Date = new Date()): { from: string; to: string } {
  return { from: toISODate(today), to: toISODate(addDays(today, 30)) }
}

/**
 * The one place that turns raw search params into `RenewalFilters` — the page
 * (a server component) and the filter bar both need it, so it lives in a
 * plain module rather than inside `RenewalFilters.tsx`. That file is
 * `'use client'`, and every export of a client module becomes a client
 * reference once imported elsewhere — a server component can render a
 * client reference as a component, but cannot call it as a plain function.
 * Keeping this here is what lets `page.tsx` call it directly.
 */
export function parseRenewalParams(
  params: Record<string, string | undefined>,
): RenewalFilterValues {
  const fallback = defaultRange()
  const page = Number.parseInt(params.page ?? '', 10)

  return {
    from: isIsoDate(params.from) ? params.from : fallback.from,
    to: isIsoDate(params.to) ? params.to : fallback.to,
    managedBy:
      params.managedBy === 'self' || params.managedBy === 'external' ? params.managedBy : undefined,
    familyId: params.familyId || undefined,
    memberId: params.memberId || undefined,
    page: Number.isInteger(page) && page > 0 ? page : 1,
  }
}
