'use client'

import { useOptimistic, useState, useTransition } from 'react'
import { formatDMY } from '@/lib/domain/dates'
import { formatINR } from '@/lib/domain/money'
import { ManagedByPill } from '@/components/ledger/ManagedByPill'
import {
  buttonClass,
  FULL_ROW,
  TABLE,
  TABLE_HEAD_ROW,
  TABLE_WRAP,
  TD,
  TH,
} from '@/components/ui/styles'
import type { ActionResult } from '@/lib/actions/result'
import { daysOverdue, isOverdue, type RenewalRow } from '@/lib/queries/renewals'
import { describeRenewalRow } from './renewal-row-description'
import { canMarkRenewed } from './renewal-row-actions'

const CATEGORY_LABELS: Record<RenewalRow['category'], string> = {
  life_insurance: 'Life insurance',
  general_insurance: 'General insurance',
  mutual_fund: 'Mutual fund',
  fixed_income: 'Fixed income',
}

type PaymentStatus = RenewalRow['paymentStatus']

const STATUS_LABEL: Record<PaymentStatus, string> = {
  unknown: 'Unknown',
  paid: 'Paid',
  unpaid: 'Unpaid',
}

const STATUS_STYLE: Record<PaymentStatus, string> = {
  unknown: 'border-line-strong bg-white text-ink-soft',
  paid: 'border-teal bg-teal-bg text-teal',
  unpaid: 'border-rust bg-rust-bg text-rust',
}

/** Distinct fired windows, widest first, exactly as `listRenewals` orders them. */
function firedWindowsText(windows: number[]): string {
  if (windows.length === 0) return '—'
  return windows.map((days) => `${days}d`).join(', ')
}

/**
 * The primary payment-recording control, not a fallback for a missing API —
 * no insurer exposes payment status to an independent advisor, so this tick
 * is how it gets recorded, every time. One select per row rather than a
 * modal: the ledger's inline-editing pattern already favours few clicks over
 * ceremony, and there is nothing here worth a second screen.
 *
 * The accessible name is built from `describeRenewalRow` rather than just
 * "Payment status" — a recurring holding produces one row per occurrence, so
 * the label alone would still collide across a client's own rows, and this
 * page's default view spans every family, so label-plus-date alone would
 * still collide across two different families' rows. A bare "Payment
 * status" would collide across every row in the table. Substring-matching
 * test tooling (Playwright, in the coming e2e suite) needs this control
 * addressable one row at a time.
 *
 * The displayed value is `useOptimistic` over the `row.paymentStatus` prop,
 * not a `useState` copy of it. `row.paymentStatus` can change for a reason
 * that has nothing to do with this control -- `markRenewed`, on the same
 * row -- and `revalidatePath` refreshes it after *every* successful write,
 * including this control's own. A `useState` copy needs a `key` change to
 * pick up an externally-driven update, but that same key also fires on the
 * control's own ordinary change and remounts the select right after the
 * advisor clicks it, dropping keyboard focus. `useOptimistic` has no such
 * blind spot: it shows the prop by default, shows the pending choice only
 * while this control's own transition is in flight, and falls back to the
 * (possibly since-changed) prop on its own once that transition ends --
 * whether it succeeded elsewhere, failed here, or both. No remount, no key.
 */
function PaymentStatusControl({
  row,
  setPaymentStatus,
}: {
  row: RenewalRow
  setPaymentStatus: (dueInstanceId: string, status: PaymentStatus) => Promise<ActionResult>
}) {
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(row.paymentStatus)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onChange(event: React.ChangeEvent<HTMLSelectElement>) {
    // Guards against a second change landing while the first is still in
    // flight -- deliberately not the native `disabled` attribute for this:
    // disabling a focused form control blurs it immediately (the browser's
    // own behaviour, not React's), and re-enabling it afterwards does not
    // restore focus. That would silently undo the fix this control exists
    // for on every single change, not just the mark-renewed case.
    if (pending) return

    const next = event.target.value as PaymentStatus
    setError(null)

    startTransition(async () => {
      setOptimisticStatus(next)
      const result = await setPaymentStatus(row.dueInstanceId, next)
      if (!result.ok) {
        // `setOptimisticStatus` always dispatches at a fixed, high priority;
        // the plain `setError` below lands on whatever ordinary priority
        // applies after an `await`, which is a different, lower lane with no
        // ordering guarantee against the transition's own revert. Calling
        // `setOptimisticStatus` again here, with the known-good value, routes
        // the correction through that same high-priority path so it can
        // never be the slower of the two commits.
        setOptimisticStatus(row.paymentStatus)
        setError(result.formError ?? 'Could not save.')
      }
    })
  }

  return (
    <div>
      <select
        aria-label={`Payment status for ${describeRenewalRow(row)}`}
        aria-busy={pending}
        value={optimisticStatus}
        onChange={onChange}
        className={`h-7 whitespace-nowrap rounded border px-2 text-[11.5px] font-medium ${STATUS_STYLE[optimisticStatus]} ${pending ? 'opacity-60' : ''}`}
      >
        {(Object.keys(STATUS_LABEL) as PaymentStatus[]).map((value) => (
          <option key={value} value={value}>
            {STATUS_LABEL[value]}
          </option>
        ))}
      </select>
      {error && <RowError message={error} />}
    </div>
  )
}

/**
 * Both row controls live in columns sized to their content, where a long
 * message would otherwise either stretch the column for every row or wrap one
 * word per line. A fixed width keeps it readable, and it only exists while
 * there is an error to show.
 */
function RowError({ message }: { message: string }) {
  return (
    <p role="alert" className="mt-1 w-[200px] whitespace-normal text-left text-[11px] leading-snug text-rust">
      {message}
    </p>
  )
}

/**
 * One click for what is really one event: the advisor learns a premium was
 * paid and the policy rolled over at the same moment (see `markRenewed`).
 * The button appears only where `canMarkRenewed` allows it: on the holding's
 * current due date, and never on a `one_time` holding, which has no next
 * period.
 *
 * The control itself stays mounted on every row, rendering only its error
 * when the button is not offered. A renewal whose tick fails still moves the
 * due date, and the refresh that follows makes this row no longer current;
 * unmounting here would discard the message telling the advisor to finish
 * the tick from the Paid column.
 *
 * Named with `describeRenewalRow`, the same helper `PaymentStatusControl`
 * uses, so the two controls on a row stay consistent with each other. Each
 * keeps its own verb prefix ("Payment status for" / "Mark renewed for") so
 * the two controls on one row remain distinguishable from each other, not
 * just from every other row's.
 */
function MarkRenewedControl({
  row,
  markRenewed,
}: {
  row: RenewalRow
  markRenewed: (dueInstanceId: string) => Promise<ActionResult>
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onClick() {
    setError(null)
    startTransition(async () => {
      const result = await markRenewed(row.dueInstanceId)
      if (!result.ok) setError(result.formError ?? 'Could not save.')
    })
  }

  return (
    <div>
      {canMarkRenewed(row) && (
        <button
          type="button"
          aria-label={`Mark renewed for ${describeRenewalRow(row)}`}
          onClick={onClick}
          disabled={pending}
          className={buttonClass('secondary', 'xs')}
        >
          Mark renewed
        </button>
      )}
      {error && <RowError message={error} />}
    </div>
  )
}

function OverdueBadge({ days }: { days: number }) {
  return (
    <span className="mt-1 block w-fit rounded-full bg-rust-bg px-1.5 py-0.5 text-[10px] font-medium text-rust">
      {days === 1 ? '1 day overdue' : `${days} days overdue`}
    </span>
  )
}

/**
 * Sizes a column to exactly its content — the same rule, and the same reason,
 * as `SNUG` in the ledger tables (see `EditableSection.tsx`): bounded content
 * such as a date, a figure or a control gets its own width and refuses to
 * wrap, and the leftover goes to the two free-text columns.
 */
const SNUG = 'w-[1%] whitespace-nowrap'


/**
 * The daily working list: every due date in the filtered window, one row per
 * instance.
 *
 * Nine separate columns do not fit the page's width, and the browser wrapped
 * them wherever it ran short — names split across lines, the category tag
 * broke in two, the renew button folded onto a second line. Instead, each row
 * reads as two lines by design: the family over its member, and the holding
 * over its category and who manages it. That leaves the bounded columns room
 * to sit on one line.
 */
export function RenewalTable({
  rows,
  setPaymentStatus,
  markRenewed,
  today,
}: {
  rows: RenewalRow[]
  setPaymentStatus: (dueInstanceId: string, status: PaymentStatus) => Promise<ActionResult>
  markRenewed: (dueInstanceId: string) => Promise<ActionResult>
  /**
   * The Indian calendar day, passed down from the server rather than read
   * here: a client component taking its own "today" would render one date on
   * the server and possibly another in the browser around midnight IST. With
   * none given, no row is marked overdue.
   */
  today?: string
}) {
  return (
    <div className={TABLE_WRAP}>
      <table className={TABLE}>
        <thead>
          <tr className={TABLE_HEAD_ROW}>
            <th className={`${TH} ${SNUG}`}>Due date</th>
            {/* Floors, not widths: below them the table scrolls inside its
                own container instead of crushing a family or policy name
                onto three lines. */}
            <th className={`${TH} min-w-[130px]`}>Client</th>
            <th className={`${TH} min-w-[170px]`}>Holding</th>
            <th className={`${TH} ${SNUG} text-right`}>Amount due</th>
            <th className={`${TH} ${SNUG}`}>Reminders</th>
            <th className={`${TH} ${SNUG}`}>Payment</th>
            <th className={`${TH} ${SNUG}`}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="p-0">
                <p className={`${FULL_ROW} px-3 py-8 text-center text-ink-soft`}>
                  No renewals in this window.
                </p>
              </td>
            </tr>
          )}

          {rows.map((row) => (
            <tr
              key={row.dueInstanceId}
              className={`border-b border-line align-middle last:border-0 ${
                row.managedBy === 'external'
                  ? 'border-l-2 border-l-gold bg-gold-bg/40'
                  : 'hover:bg-paper/50'
              }`}
            >
              <td className={`${TD} ${SNUG}`}>
                <span className="font-mono">{formatDMY(row.dueDate)}</span>
                {row.offSchedule && (
                  <span className="mt-1 block w-fit rounded-full bg-gold-bg px-1.5 py-0.5 text-[10px] font-medium text-gold">
                    Off schedule
                  </span>
                )}
                {today && isOverdue(row, today) && <OverdueBadge days={daysOverdue(row.dueDate, today)} />}
              </td>
              <td className={TD}>
                <span className="block font-medium text-ink">{row.familyName}</span>
                <span className="mt-0.5 block text-[11.5px] text-ink-soft">
                  {row.memberName ?? 'Whole family'}
                </span>
              </td>
              <td className={TD}>
                <span className="block font-medium text-ink">{row.label}</span>
                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="whitespace-nowrap text-[11.5px] text-ink-soft">
                    {CATEGORY_LABELS[row.category]}
                  </span>
                  <ManagedByPill value={row.managedBy} />
                </span>
              </td>
              <td className={`${TD} ${SNUG} text-right font-mono`}>{formatINR(row.amountDue)}</td>
              <td className={`${TD} ${SNUG} font-mono text-[11.5px] text-ink-soft`}>
                {firedWindowsText(row.firedWindows)}
              </td>
              <td className={`${TD} ${SNUG}`}>
                <PaymentStatusControl row={row} setPaymentStatus={setPaymentStatus} />
              </td>
              <td className={`${TD} ${SNUG} text-right`}>
                <MarkRenewedControl row={row} markRenewed={markRenewed} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
