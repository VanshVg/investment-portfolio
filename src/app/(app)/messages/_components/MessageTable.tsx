import Link from 'next/link'
import { formatDateTimeIST } from '@/lib/domain/dates'
import type { MessageRow } from '@/lib/queries/messages'
import { FULL_ROW, TABLE, TABLE_HEAD_ROW, TABLE_WRAP, TD, TH } from '@/components/ui/styles'

const PILL = 'inline-block rounded-full px-2 py-0.5 text-[11px] font-medium'

const STATUS: Record<string, { label: string; tone: string }> = {
  sent: { label: 'Sent', tone: 'bg-paper text-ink' },
  delivered: { label: 'Delivered', tone: 'bg-teal-bg text-teal' },
  read: { label: 'Read', tone: 'bg-teal-bg text-teal' },
  skipped: { label: 'Skipped', tone: 'bg-paper text-ink-soft' },
  failed: { label: 'Failed', tone: 'bg-rust-bg text-rust' },
  pending: { label: 'Test preview', tone: 'bg-gold-bg text-gold' },
}

/** Reminder messages, one row each: when, for which policy, to whom, and what happened. */
export function MessageTable({ rows, emptyMessage }: { rows: MessageRow[]; emptyMessage: string }) {
  return (
    <div className={`mt-3 ${TABLE_WRAP}`}>
      <table className={TABLE}>
        <thead>
          <tr className={TABLE_HEAD_ROW}>
            <th className={TH}>When</th>
            <th className={TH}>Household</th>
            <th className={TH}>Policy</th>
            <th className={TH}>To</th>
            <th className={TH}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="p-0">
                <p className={`${FULL_ROW} px-3 py-8 text-center text-ink-soft`}>{emptyMessage}</p>
              </td>
            </tr>
          )}
          {rows.map((row) => {
            const status = STATUS[row.test ? 'pending' : row.status] ?? STATUS.sent
            return (
              <tr key={row.id} className="border-b border-line last:border-0">
                <td className={`${TD} whitespace-nowrap font-mono text-[12px]`}>
                  {formatDateTimeIST(row.at)}
                </td>
                <td className={TD}>
                  <Link href={`/families/${row.familyId}`} className="text-navy hover:underline">
                    {row.familyName}
                  </Link>
                </td>
                <td className={TD}>{row.holdingLabel}</td>
                <td className={`${TD} whitespace-nowrap`}>
                  <span>{row.recipient === 'advisor' ? 'You' : 'Client'}</span>
                  <span className="block font-mono text-[11.5px] text-ink-soft">{row.mobile}</span>
                </td>
                <td className={TD}>
                  <span className={`${PILL} ${status.tone}`}>{status.label}</span>
                  {row.detail && (
                    <span className="mt-0.5 block text-[11.5px] text-ink-soft">{row.detail}</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
