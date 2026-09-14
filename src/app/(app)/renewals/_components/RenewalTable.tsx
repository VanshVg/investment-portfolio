import { formatDMY } from '@/lib/domain/dates'
import { formatINR } from '@/lib/domain/money'
import { ManagedByPill } from '@/components/ledger/ManagedByPill'
import type { RenewalRow } from '@/lib/queries/renewals'

const CATEGORY_LABELS: Record<RenewalRow['category'], string> = {
  life_insurance: 'Life insurance',
  general_insurance: 'General insurance',
  mutual_fund: 'Mutual fund',
  fixed_income: 'Fixed income',
}

/** Distinct fired windows, widest first, exactly as `listRenewals` orders them. */
function firedWindowsText(windows: number[]): string {
  if (windows.length === 0) return '—'
  return windows.map((days) => `${days}d`).join(', ')
}

/**
 * The daily working list: every due date in the filtered window, one row per
 * instance. No row action lives here yet — the payment tick and mark-renewed
 * button are added in later tasks, once the actions they call exist.
 */
export function RenewalTable({ rows }: { rows: RenewalRow[] }) {
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
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="px-2 py-4 text-center text-ink-soft">
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
