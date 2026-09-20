'use client'

import { useOptimistic, useState, useTransition } from 'react'
import { formatDMY } from '@/lib/domain/dates'
import { formatINR } from '@/lib/domain/money'
import { ManagedByPill } from '@/components/ledger/ManagedByPill'
import type { ActionResult } from '@/lib/actions/result'
import type { RenewalRow } from '@/lib/queries/renewals'
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
        className={`rounded px-1.5 py-1 text-[11.5px] font-medium ${STATUS_STYLE[optimisticStatus]} ${pending ? 'opacity-60' : ''}`}
      >
        {(Object.keys(STATUS_LABEL) as PaymentStatus[]).map((value) => (
          <option key={value} value={value}>
            {STATUS_LABEL[value]}
          </option>
        ))}
      </select>
      {error && (
        <p role="alert" className="mt-0.5 text-[11px] text-rust">
          {error}
        </p>
      )}
    </div>
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
          className="rounded border border-line-strong px-1.5 py-1 text-[11.5px] font-medium hover:bg-paper disabled:opacity-60"
        >
          Mark renewed
        </button>
      )}
      {error && (
        <p role="alert" className="mt-0.5 text-[11px] text-rust">
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * The daily working list: every due date in the filtered window, one row per
 * instance.
 */
export function RenewalTable({
  rows,
  setPaymentStatus,
  markRenewed,
}: {
  rows: RenewalRow[]
  setPaymentStatus: (dueInstanceId: string, status: PaymentStatus) => Promise<ActionResult>
  markRenewed: (dueInstanceId: string) => Promise<ActionResult>
}) {
  return (
    <div className="overflow-x-auto rounded border border-line bg-paper-raised">
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.04em] text-ink-soft">
            <th className="px-2 py-1.5 font-medium">Due date</th>
            <th className="px-2 py-1.5 font-medium">Family</th>
            <th className="px-2 py-1.5 font-medium">Member</th>
            <th className="px-2 py-1.5 font-medium">Holding</th>
            <th className="px-2 py-1.5 font-medium">Managed by</th>
            <th className="px-2 py-1.5 text-right font-medium">Amount due</th>
            <th className="px-2 py-1.5 font-medium">Reminders sent</th>
            <th className="px-2 py-1.5 font-medium">Paid</th>
            <th className="px-2 py-1.5 font-medium">Renew</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={9} className="px-2 py-4 text-center text-ink-soft">
                No renewals in this window.
              </td>
            </tr>
          )}

          {rows.map((row) => (
            <tr
              key={row.dueInstanceId}
              className={`border-b border-line last:border-0 ${
                row.managedBy === 'external' ? 'border-l-2 border-l-gold bg-gold-bg/40' : ''
              }`}
            >
              <td className="whitespace-nowrap px-2 py-1.5 font-mono">
                {formatDMY(row.dueDate)}
                {row.offSchedule && (
                  <span className="ml-1.5 inline-block rounded-full bg-gold-bg px-1.5 py-0.5 text-[10px] font-medium text-gold">
                    Off schedule
                  </span>
                )}
              </td>
              <td className="px-2 py-1.5">{row.familyName}</td>
              <td className="px-2 py-1.5">{row.memberName ?? 'Whole family'}</td>
              <td className="px-2 py-1.5">
                <span className="font-medium">{row.label}</span>
                <span className="ml-1.5 inline-block rounded border border-line-strong px-1 py-0.5 text-[10px] uppercase tracking-[0.03em] text-ink-soft">
                  {CATEGORY_LABELS[row.category]}
                </span>
              </td>
              <td className="px-2 py-1.5">
                <ManagedByPill value={row.managedBy} />
              </td>
              <td className="px-2 py-1.5 text-right font-mono">{formatINR(row.amountDue)}</td>
              <td className="px-2 py-1.5 font-mono text-[11.5px] text-ink-soft">
                {firedWindowsText(row.firedWindows)}
              </td>
              <td className="px-2 py-1.5">
                <PaymentStatusControl row={row} setPaymentStatus={setPaymentStatus} />
              </td>
              <td className="px-2 py-1.5">
                <MarkRenewedControl row={row} markRenewed={markRenewed} />

              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
