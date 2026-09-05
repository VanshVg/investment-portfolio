export interface SectionCounts {
  members: number
  life: number
  general: number
  mutual: number
  fixed: number
}

const ITEMS: { href: string; label: string; key: keyof SectionCounts }[] = [
  { href: '#members', label: 'Members', key: 'members' },
  { href: '#life', label: 'Life insurance', key: 'life' },
  { href: '#general', label: 'General insurance', key: 'general' },
  { href: '#mutual', label: 'Mutual funds', key: 'mutual' },
  { href: '#fixed', label: 'Fixed income', key: 'fixed' },
]

/**
 * The workspace is one scrolling page rather than tabs, so that no household
 * data is ever a click away. This is what keeps the length navigable.
 */
export function SectionNav({ counts }: { counts: SectionCounts }) {
  return (
    <nav
      aria-label="Sections"
      className="sticky top-0 z-10 -mx-5 mb-2 flex flex-wrap gap-x-4 gap-y-1 border-b border-line bg-paper/95 px-5 py-2 backdrop-blur"
    >
      {ITEMS.map((item) => (
        <a key={item.href} href={item.href} className="text-[12px] text-ink-soft hover:text-navy">
          {item.label}
          <span className="ml-1 font-mono text-[11px] text-gold">{counts[item.key]}</span>
        </a>
      ))}
    </nav>
  )
}
