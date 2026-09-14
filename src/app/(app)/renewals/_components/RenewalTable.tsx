'use client'

import { useState, useTransition } from 'react'
import { formatDMY } from '@/lib/domain/dates'
import { formatINR } from '@/lib/domain/money'
import { ManagedByPill } from '@/components/ledger/ManagedByPill'
import type { ActionResult } from '@/lib/actions/result'
import type { RenewalRow } from '@/lib/queries/renewals'

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
 * The accessible name carries the holding's label and due date rather than
 * just "Payment status" — a recurring holding produces one row per
 * occurrence, so the label alone would still collide across a client's own
 * rows, and a bare "Payment status" would collide across every row in the
 * table. Substring-matching test tooling (Playwright, in the coming e2e
 * suite) needs this control addressable one row at a time.
 */
function PaymentStatusControl({
  row,
  setPaymentStatus,
}: {
  row: RenewalRow
  setPaymentStatus: (dueInstanceId: string, status: PaymentStatus) => Promise<ActionResult>
}) {
  const [status, setStatus] = useState<PaymentStatus>(row.paymentStatus)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value as PaymentStatus
    const previous = status
    setStatus(next)
    setError(null)

    startTransition(async () => {
      const result = await setPaymentStatus(row.dueInstanceId, next)
      if (!result.ok) {
        // Never leave the control showing a value that didn't actually save.
        setStatus(previous)
        setError(result.formError ?? 'Could not save.')
      }
    })
  }

  return (
    <div>
      <select
        aria-label={`Payment status for ${row.label}, due ${formatDMY(row.dueDate)}`}
        value={status}
        disabled={pending}
        onChange={onChange}
        className={`rounded px-1.5 py-1 text-[11.5px] font-medium ${STATUS_STYLE[status]}`}
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
 * The daily working list: every due date in the filtered window, one row per
 * instance. The mark-renewed button is added in a later task, once the
 * action it calls exists.
 */
export function RenewalTable({
  rows,
  setPaymentStatus,
}: {
  rows: RenewalRow[]
  setPaymentStatus: (dueInstanceId: string, status: PaymentStatus) => Promise<ActionResult>
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
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={8} className="px-2 py-4 text-center text-ink-soft">
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
