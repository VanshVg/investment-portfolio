import Link from 'next/link'
import { lastPage } from '@/lib/queries/paging'
import { buttonClass } from './styles'

/**
 * The one pager every list uses: where these rows sit in the whole, and a way
 * to the pages either side. Plain links, so the page number lives in the
 * address — a refresh, the back button or a shared link keeps the place.
 *
 * On a phone the summary sits above two full-width halves, each an easy
 * thumb target; from `sm` up they share one line. A list that fits on one
 * page gets no pager at all.
 */
export function Pagination({
  page,
  pageSize,
  total,
  href,
  label,
}: {
  page: number
  pageSize: number
  total: number
  href: (page: number) => string
  /** Names the list, e.g. "Families": announced as "Families pages". */
  label: string
}) {
  const pages = lastPage(total, pageSize)
  if (pages <= 1) return null

  const first = (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)
  const step = `${buttonClass('secondary', 'md')} flex-1 sm:flex-none`
  const unavailable = `${step} pointer-events-none opacity-45`

  return (
    <nav
      aria-label={`${label} pages`}
      className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-[12.5px] text-ink-soft">
        Showing{' '}
        <span className="font-medium tabular-nums text-ink">
          {first}–{last}
        </span>{' '}
        of <span className="font-medium tabular-nums text-ink">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} rel="prev" aria-label="Previous page" className={step}>
            ← Previous
          </Link>
        ) : (
          <span aria-disabled="true" className={unavailable}>
            ← Previous
          </span>
        )}
        <span className="shrink-0 px-1 text-[12.5px] tabular-nums text-ink-soft">
          Page {page} of {pages}
        </span>
        {page < pages ? (
          <Link href={href(page + 1)} rel="next" aria-label="Next page" className={step}>
            Next →
          </Link>
        ) : (
          <span aria-disabled="true" className={unavailable}>
            Next →
          </span>
        )}
      </div>
    </nav>
  )
}
