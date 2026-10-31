'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// The application's primary navigation. Built as a list so adding a section
// is a one-line addition here, not a rework of the header markup. Families
// comes first: it is the home page (`/` redirects to it).
const NAV_ITEMS: { href: string; label: string }[] = [
  { href: '/families', label: 'Families' },
  { href: '/renewals', label: 'Renewals' },
  { href: '/messages', label: 'Messages' },
  { href: '/settings/reminders', label: 'Settings' },
]

/**
 * A section owns its own path and everything beneath it, so a single family's
 * workspace still shows Families as the current section. Matched on a whole
 * path segment, so `/renewals-archive` would not claim to be `/renewals`.
 */
function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * A client component only because it reads the current path; the links
 * themselves are plain navigation.
 */
export function PrimaryNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Primary" className="border-b border-line bg-paper-raised">
      {/* Padded inside the 980px box, exactly like <main>, so the links start
          on the same edge as the page content. */}
      <div className="mx-auto flex max-w-[980px] gap-5 px-5">
        {NAV_ITEMS.map((item) => {
          const current = isCurrent(pathname, item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={current ? 'page' : undefined}
              className={`-mb-px border-b-2 py-2.5 text-[12.5px] ${
                current
                  ? 'border-navy font-medium text-navy'
                  : 'border-transparent text-ink-soft hover:text-navy'
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
