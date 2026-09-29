import Link from 'next/link'
import { PAGE_LEAD, PAGE_TITLE, TEXT_LINK } from './styles'

/**
 * The top of every page: an optional way back, the title, one line saying
 * what the page is for, and the page's main action on the right. Every page
 * uses this, so titles sit at the same size and the same distance from the
 * nav wherever the advisor is.
 */
export function PageHeader({
  title,
  description,
  back,
  actions,
  children,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  back?: { href: string; label: string }
  actions?: React.ReactNode
  /** Anything that belongs under the title, such as a summary line. */
  children?: React.ReactNode
}) {
  return (
    <header className="pb-5 pt-7">
      {back && (
        <Link href={back.href} className={`mb-2 inline-block ${TEXT_LINK}`}>
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className={PAGE_TITLE}>{title}</h1>
          {description && <p className={PAGE_LEAD}>{description}</p>}
          {children}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}
