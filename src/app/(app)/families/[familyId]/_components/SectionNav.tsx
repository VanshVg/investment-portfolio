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
 *
 * It sits inside the content column rather than bleeding past it: a bar
 * wider than every card beneath it reads as a stray line, not a toolbar.
 * The labels match the section headings they jump to, word for word.
 */
export function SectionNav({ counts }: { counts: SectionCounts }) {
  return (
    <nav
      aria-label="Sections"
      className="sticky top-0 z-10 mt-6 flex flex-wrap gap-1 border-b border-line bg-paper/95 py-2 backdrop-blur"
    >
      {ITEMS.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className="inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[12.5px] text-ink-soft hover:bg-paper-raised hover:text-navy"
        >
          {item.label}
          <span className="rounded-full bg-line/60 px-1.5 font-mono text-[10.5px] text-ink">
            {counts[item.key]}
          </span>
        </a>
      ))}
    </nav>
  )
}
