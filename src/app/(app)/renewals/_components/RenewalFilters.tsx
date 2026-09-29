'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { addDays, endOfMonth, startOfMonth } from 'date-fns'
import {
  describeDMYProblem,
  formatDMY,
  fromISODate,
  parseDMY,
  toISODate,
  todayInIndia,
} from '@/lib/domain/dates'
import type { RenewalFilters as RenewalFilterValues } from '@/lib/queries/renewals'
import {
  buttonClass,
  CARD,
  FIELD_LABEL,
  inputClass,
} from '@/components/ui/styles'
import { DateInput } from '@/components/ui/DateInput'
import { defaultRange } from './renewal-params'

export interface FilterOption {
  id: string
  name: string
}

type Patch = Partial<
  Pick<
    RenewalFilterValues,
    'from' | 'to' | 'managedBy' | 'familyId' | 'memberId'
  >
>

// One height and one label style for every control in the bar, so the
// buttons, date inputs and selects line up along a single baseline.
const LABEL = `mb-1 block ${FIELD_LABEL}`
const input = (width: string) => inputClass('sm', width)
const BUTTON_IDLE = buttonClass('secondary', 'sm')
const BUTTON_ACTIVE = buttonClass('primary', 'sm')

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

  // Counted from the Indian date, matching the server's default range, so a
  // preset and the page's own opening window never disagree about today.
  function applyPreset(days: number) {
    go(presetRange(days))
  }

  function thisMonthRange() {
    const today = fromISODate(todayInIndia())!
    return {
      from: toISODate(startOfMonth(today)),
      to: toISODate(endOfMonth(today)),
    }
  }

  function applyThisMonth() {
    go(thisMonthRange())
  }

  // A preset is shown as selected only when the URL's range is exactly the
  // one it would produce, so a custom range lights none of them.
  function isCurrent(range: { from: string; to: string }) {
    return filters.from === range.from && filters.to === range.to
  }

  function presetRange(days: number) {
    const today = fromISODate(todayInIndia())!
    return { from: toISODate(today), to: toISODate(addDays(today, days)) }
  }

  function applyCustomRange(from: string, to: string) {
    go({ from, to })
  }

  const rangeKey = `${filters.from}_${filters.to}`
  const thisMonthCurrent = isCurrent(thisMonthRange())

  // Offered only when there is something to clear. A bare /renewals is
  // exactly the page's default view — parseRenewalParams fills in the same
  // defaultRange — so clearing is navigating there, not rebuilding defaults
  // here that could drift from the server's.
  const onDefaults =
    isCurrent(defaultRange()) &&
    !filters.managedBy &&
    !filters.familyId &&
    !filters.memberId

  return (
    <div className={CARD}>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 p-3">
        <div role="group" aria-labelledby="renewals-period">
          <span id="renewals-period" className={LABEL}>
            Period
          </span>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((preset) => {
              const current = isCurrent(presetRange(preset.days))
              return (
                <button
                  key={preset.label}
                  type="button"
                  aria-pressed={current}
                  onClick={() => applyPreset(preset.days)}
                  className={`${current ? BUTTON_ACTIVE : BUTTON_IDLE}`}
                >
                  {preset.label}
                </button>
              )
            })}
            <button
              type="button"
              aria-pressed={thisMonthCurrent}
              onClick={applyThisMonth}
              className={`${thisMonthCurrent ? BUTTON_ACTIVE : BUTTON_IDLE}`}
            >
              This month
            </button>
          </div>
        </div>

        {/* Keyed to the current range so its fields reset to the URL's
            values whenever a preset or a page navigation changes the filters
            out from under it. */}
        <CustomRange
          key={rangeKey}
          from={filters.from}
          to={filters.to}
          onApply={applyCustomRange}
        />
      </div>

      <div className="flex flex-wrap items-end gap-x-4 gap-y-3 border-t border-line p-3">
        <div>
          <label htmlFor="renewals-managed-by" className={LABEL}>
            Managed by
          </label>
          <select
            id="renewals-managed-by"
            value={filters.managedBy ?? ''}
            onChange={(event) =>
              go({
                managedBy: (event.target.value || undefined) as
                  'self' | 'external' | undefined,
              })
            }
            className={input('w-[140px]')}
          >
            <option value="">All</option>
            <option value="self">With us</option>
            <option value="external">External</option>
          </select>
        </div>

        <div>
          <label htmlFor="renewals-family" className={LABEL}>
            Family
          </label>
          <select
            id="renewals-family"
            value={filters.familyId ?? ''}
            onChange={(event) =>
              go({
                familyId: event.target.value || undefined,
                memberId: undefined,
              })
            }
            className={input('w-[220px]')}
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
            <label htmlFor="renewals-member" className={LABEL}>
              Member
            </label>
            <select
              id="renewals-member"
              value={filters.memberId ?? ''}
              onChange={(event) =>
                go({ memberId: event.target.value || undefined })
              }
              className={input('w-[200px]')}
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

        {!onDefaults && (
          <button
            type="button"
            onClick={() => router.push('/renewals')}
            className={`ml-auto ${buttonClass('quiet', 'sm')}`}
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * The typed or picked From/To pair. Holds its own text so a day chosen from
 * the calendar lands in the box; nothing is applied until Apply (or Enter),
 * because a range needs both ends before it means anything.
 */
function CustomRange({
  from,
  to,
  onApply,
}: {
  from: string
  to: string
  onApply: (from: string, to: string) => void
}) {
  const [fromText, setFromText] = useState(formatDMY(from))
  const [toText, setToText] = useState(formatDMY(to))
  const [problem, setProblem] = useState<string | null>(null)

  // A range that cannot be applied used to do nothing at all on Apply, which
  // reads as a broken button. It now says why, and still does not navigate.
  function rangeProblem(): string | null {
    if (!fromText.trim() || !toText.trim()) return 'Enter both dates.'
    const fromIssue = describeDMYProblem(fromText)
    if (fromIssue) return `From: ${fromIssue}`
    const toIssue = describeDMYProblem(toText)
    if (toIssue) return `To: ${toIssue}`
    if (parseDMY(fromText)! > parseDMY(toText)!)
      return 'From must be on or before To.'
    return null
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const found = rangeProblem()
    setProblem(found)
    if (found) return
    onApply(toISODate(parseDMY(fromText)!), toISODate(parseDMY(toText)!))
  }

  function edit(setter: (text: string) => void) {
    return (text: string) => {
      setter(text)
      setProblem(null)
    }
  }

  return (
    <>
      <form onSubmit={submit} className="flex items-end gap-2">
        <div>
          <label htmlFor="renewals-from" className={LABEL}>
            From
          </label>
          <DateInput
            id="renewals-from"
            name="from"
            size="sm"
            width="w-[136px]"
            text={fromText}
            onTextChange={edit(setFromText)}
            onPick={() => setProblem(null)}
            inputProps={{
              'aria-invalid': problem?.startsWith('From') || undefined,
            }}
          />
        </div>
        <div>
          <label htmlFor="renewals-to" className={LABEL}>
            To
          </label>
          <DateInput
            id="renewals-to"
            name="to"
            size="sm"
            width="w-[136px]"
            text={toText}
            onTextChange={edit(setToText)}
            onPick={() => setProblem(null)}
            inputProps={{
              'aria-invalid': problem?.startsWith('To') || undefined,
            }}
          />
        </div>
        <button type="submit" className={BUTTON_IDLE}>
          Apply
        </button>
      </form>
      {/* A sibling of the form, not a child: the filter row wraps, so a
        full-basis item gets a line of its own under the fields instead of
        overlapping the divider below them. */}
      {problem && (
        <p role="alert" className="-mt-1 basis-full text-[11.5px] text-rust">
          {problem}
        </p>
      )}
    </>
  )
}
