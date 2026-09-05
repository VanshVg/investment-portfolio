import type { ManagedBy } from '@/lib/queries/families'

/** The prototype's signature badge: teal for our business, gold for a cross-sell opening. */
export function ManagedByPill({ value }: { value: ManagedBy }) {
  const mine = value === 'self'
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
        mine ? 'bg-teal-bg text-teal' : 'bg-gold-bg text-gold'
      }`}
    >
      {mine ? 'With us' : 'External'}
    </span>
  )
}
