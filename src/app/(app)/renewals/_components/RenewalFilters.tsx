'use client'

import { useRouter } from 'next/navigation'
import { addDays, endOfMonth, startOfMonth } from 'date-fns'
import { formatDMY, parseDMY, toISODate } from '@/lib/domain/dates'
import type { RenewalFilters as RenewalFilterValues } from '@/lib/queries/renewals'

export interface FilterOption {
  id: string
  name: string
}

type Patch = Partial<
  Pick<RenewalFilterValues, 'from' | 'to' | 'managedBy' | 'familyId' | 'memberId'>
>

const PRESETS: { label: string; days: number }[] = [
  { label: 'Next 30 days', days: 30 },
  { label: 'Next 60 days', days: 60 },
  { label: 'Next 90 days', days: 90 },
]

/**
 * Every control here reads its current value from `filters` (a prop, sourced
 * from the URL by the server component) and, on change, pushes a whole new
 * URL built from that same prop plus the one field that changed. There is no
 * local state duplicating what the URL already says — the URL is the only
 * place a filter value lives.
 */
export function RenewalFilters({
  filters,
  families,
  members,
}: {
  filters: RenewalFilterValues
  families: FilterOption[]
  members: FilterOption[]
}) {
  const router = useRouter()

  function go(patch: Patch) {
    const merged: Record<string, string | undefined> = {
      from: filters.from,
      to: filters.to,
      managedBy: filters.managedBy,
      familyId: filters.familyId,
      memberId: filters.memberId,
      ...patch,
    }
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(merged)) {
      if (value) params.set(key, value)
    }
    // A changed filter always lands on page 1 — the old page number belonged
    // to a result set that no longer exists once the filter has moved.
    router.push(`/renewals?${params.toString()}`)
  }

  function applyPreset(days: number) {
    const today = new Date()
    go({ from: toISODate(today), to: toISODate(addDays(today, days)) })
  }

  function applyThisMonth() {
    const today = new Date()
    go({ from: toISODate(startOfMonth(today)), to: toISODate(endOfMonth(today)) })
  }

  function applyCustomRange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const from = parseDMY(String(data.get('from') ?? ''))
    const to = parseDMY(String(data.get('to') ?? ''))
    if (!from || !to) return
    go({ from: toISODate(from), to: toISODate(to) })
  }

  const rangeKey = `${filters.from}_${filters.to}`

  return (
    <div className="flex flex-wrap items-end gap-4 rounded border border-line bg-paper-raised p-3">
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => applyPreset(preset.days)}
            className="rounded border border-line-strong px-2 py-1 text-[11.5px] hover:bg-paper"
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          onClick={applyThisMonth}
          className="rounded border border-line-strong px-2 py-1 text-[11.5px] hover:bg-paper"
        >
          This month
        </button>
      </div>

      {/* Keyed to the current range so the uncontrolled inputs remount (and
          therefore re-adopt their defaultValue) whenever a preset or a page
          navigation changes the filters out from under this component. */}
      <form key={rangeKey} onSubmit={applyCustomRange} className="flex items-end gap-1.5">
        <div>
          <label htmlFor="renewals-from" className="block text-[11px] text-ink-soft">
            From
          </label>
          <input
            id="renewals-from"
            name="from"
            defaultValue={formatDMY(filters.from)}
            placeholder="DD-MM-YYYY"
            className="w-[100px] rounded border border-line-strong bg-white px-1.5 py-1 font-mono text-[12.5px]"
          />
        </div>
        <div>
          <label htmlFor="renewals-to" className="block text-[11px] text-ink-soft">
            To
          </label>
          <input
            id="renewals-to"
            name="to"
            defaultValue={formatDMY(filters.to)}
            placeholder="DD-MM-YYYY"
            className="w-[100px] rounded border border-line-strong bg-white px-1.5 py-1 font-mono text-[12.5px]"
          />
        </div>
        <button
          type="submit"
          className="rounded border border-line-strong px-2 py-1 text-[11.5px] hover:bg-paper"
        >
          Apply
        </button>
      </form>

      <div>
        <label htmlFor="renewals-managed-by" className="block text-[11px] text-ink-soft">
          Managed by
        </label>
        <select
          id="renewals-managed-by"
          value={filters.managedBy ?? ''}
          onChange={(event) => go({ managedBy: (event.target.value || undefined) as 'self' | 'external' | undefined })}
          className="rounded border border-line-strong bg-white px-1.5 py-1 text-[12.5px]"
        >
          <option value="">All</option>
          <option value="self">With us</option>
          <option value="external">External</option>
        </select>
      </div>

      <div>
        <label htmlFor="renewals-family" className="block text-[11px] text-ink-soft">
          Family
        </label>
        <select
          id="renewals-family"
          value={filters.familyId ?? ''}
          onChange={(event) => go({ familyId: event.target.value || undefined, memberId: undefined })}
          className="rounded border border-line-strong bg-white px-1.5 py-1 text-[12.5px]"
        >
          <option value="">All families</option>
          {families.map((family) => (
            <option key={family.id} value={family.id}>
              {family.name}
            </option>
          ))}
        </select>
      </div>

      {filters.familyId && (
        <div>
          <label htmlFor="renewals-member" className="block text-[11px] text-ink-soft">
            Member
          </label>
          <select
            id="renewals-member"
            value={filters.memberId ?? ''}
            onChange={(event) => go({ memberId: event.target.value || undefined })}
            className="rounded border border-line-strong bg-white px-1.5 py-1 text-[12.5px]"
          >
            <option value="">All members</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
