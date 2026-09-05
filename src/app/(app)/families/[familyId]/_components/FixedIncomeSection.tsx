'use client'

import { EditableSection } from '@/components/ledger/EditableSection'
import { FieldError, fieldErrorProps } from '@/components/ledger/FieldError'
import { ManagedByPill } from '@/components/ledger/ManagedByPill'
import { MemberSelect } from '@/components/ledger/MemberSelect'
import { MoneyInput } from '@/components/ledger/MoneyInput'
import { DateField } from '@/components/ledger/DateField'
import { formatINR } from '@/lib/domain/money'
import { formatDMY } from '@/lib/domain/dates'
import type { DueFrequency, Holding, ManagedBy, Member } from '@/lib/queries/families'
import type { ActionResult } from '@/lib/actions/result'
import {
  detail,
  detailError,
  emptyHoldingDraft,
  setDetail,
  toHoldingDraft,
  type HoldingDraft,
} from './holding-draft'

const CELL = 'w-full rounded border border-line-strong bg-white px-1.5 py-1 text-[12.5px]'
const DETAIL_LABEL = 'text-[11px] text-ink-soft'

export function FixedIncomeSection({
  familyId,
  members,
  holdings,
  createHolding,
  updateHolding,
  deleteHolding,
}: {
  familyId: string
  members: Member[]
  holdings: Holding[]
  createHolding: (familyId: string, input: unknown) => Promise<ActionResult>
  updateHolding: (id: string, familyId: string, input: unknown) => Promise<ActionResult>
  deleteHolding: (id: string, familyId: string) => Promise<ActionResult>
}) {
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? 'Whole family'

  return (
    <EditableSection<Holding, HoldingDraft>
      index={4}
      title="Fixed income, bonds & demat"
      description="Maturity dates drive reminders here exactly as renewal dates do for insurance."
      columns={[
        { key: 'member', label: 'Member', width: '15%' },
        { key: 'label', label: 'Description', width: '21%' },
        { key: 'asset', label: 'Asset type', width: '16%' },
        { key: 'institution', label: 'Institution', width: '18%' },
        { key: 'amount', label: 'Invested', width: '13%' },
        { key: 'maturity', label: 'Maturity', width: '12%' },
        { key: 'managed', label: 'Managed by', width: '10%' },
      ]}
      rows={holdings}
      rowKey={(row) => row.id}
      rowLabel={(row) => row.label}
      renderRead={(row) => {
        const details = (row.details ?? {}) as Record<string, unknown>
        return (
          <>
            <td className="px-2 py-1.5">{nameOf(row.memberId)}</td>
            <td className="px-2 py-1.5 font-medium">{row.label}</td>
            <td className="px-2 py-1.5">{String(details.asset_type ?? '—')}</td>
            <td className="px-2 py-1.5">{row.institution ?? '—'}</td>
            <td className="px-2 py-1.5 text-right font-mono">{formatINR(row.principalAmount)}</td>
            <td className="px-2 py-1.5 font-mono">
              {row.nextDueDate ? formatDMY(row.nextDueDate) : '—'}
            </td>
            <td className="px-2 py-1.5">
              <ManagedByPill value={row.managedBy} />
            </td>
          </>
        )
      }}
      renderEdit={(draft, set, errors) => (
        <>
          <td className="px-2 py-1.5">
            <MemberSelect
              id="fi-member"
              label="Member"
              members={members}
              value={draft.memberId}
              onChange={(memberId) => set({ memberId })}
              error={errors.memberId}
            />
          </td>
          <td className="px-2 py-1.5">
            <label htmlFor="fi-label" className="sr-only">
              Description
            </label>
            <input
              id="fi-label"
              value={draft.label}
              onChange={(event) => set({ label: event.target.value })}
              className={CELL}
              {...fieldErrorProps('fi-label', errors.label)}
            />
            <FieldError id="fi-label" message={errors.label} />
          </td>
          <td className="px-2 py-1.5">
            <label htmlFor="fi-asset" className="sr-only">
              Asset type
            </label>
            <input
              id="fi-asset"
              value={detail(draft, 'asset_type')}
              onChange={(event) => set(setDetail(draft, 'asset_type', event.target.value))}
              placeholder="FD / NCD / Bond"
              className={CELL}
              {...fieldErrorProps('fi-asset', detailError(errors, 'asset_type'))}
            />
            <FieldError id="fi-asset" message={detailError(errors, 'asset_type')} />
          </td>
          <td className="px-2 py-1.5">
            <label htmlFor="fi-institution" className="sr-only">
              Institution
            </label>
            <input
              id="fi-institution"
              value={draft.institution}
              onChange={(event) => set({ institution: event.target.value })}
              className={CELL}
            />
          </td>
          <td className="px-2 py-1.5">
            <MoneyInput
              id="fi-amount"
              label="Invested amount"
              value={draft.principalAmount}
              onChange={(principalAmount) => set({ principalAmount })}
              error={errors.principalAmount}
            />
          </td>
          <td className="px-2 py-1.5">
            {/* Maturity lives in next_due_date, never in details.maturity_date:
                two stores for one fact would drift, and only the column feeds
                the reminder engine. */}
            <DateField
              id="fi-maturity"
              label="Maturity date"
              value={draft.nextDueDate}
              onChange={(nextDueDate) => set({ nextDueDate })}
              error={errors.nextDueDate}
            />
          </td>
          <td className="px-2 py-1.5">
            <label htmlFor="fi-managed" className="sr-only">
              Managed by
            </label>
            <select
              id="fi-managed"
              value={draft.managedBy}
              onChange={(event) => set({ managedBy: event.target.value as ManagedBy })}
              className={CELL}
            >
              <option value="self">With us</option>
              <option value="external">External</option>
            </select>
          </td>
        </>
      )}
      renderDetails={(draft, set, errors) => (
        <>
          <div>
            <label htmlFor="fi-rate" className={DETAIL_LABEL}>
              Interest rate (%)
            </label>
            <input
              id="fi-rate"
              type="number"
              min={0}
              step="0.01"
              value={detail(draft, 'interest_rate')}
              onChange={(event) =>
                set(
                  setDetail(
                    draft,
                    'interest_rate',
                    event.target.value === '' ? undefined : Number(event.target.value),
                  ),
                )
              }
              className={`${CELL} font-mono`}
              {...fieldErrorProps('fi-rate', detailError(errors, 'interest_rate'))}
            />
            <FieldError id="fi-rate" message={detailError(errors, 'interest_rate')} />
          </div>
          <div>
            <label htmlFor="fi-payout" className={DETAIL_LABEL}>
              Payout frequency
            </label>
            <input
              id="fi-payout"
              value={detail(draft, 'payout_frequency')}
              onChange={(event) => set(setDetail(draft, 'payout_frequency', event.target.value))}
              className={CELL}
              {...fieldErrorProps('fi-payout', detailError(errors, 'payout_frequency'))}
            />
            <FieldError id="fi-payout" message={detailError(errors, 'payout_frequency')} />
          </div>
          <div>
            <label htmlFor="fi-frequency" className={DETAIL_LABEL}>
              Frequency
            </label>
            <select
              id="fi-frequency"
              value={draft.dueFrequency}
              onChange={(event) => set({ dueFrequency: event.target.value as DueFrequency })}
              className={CELL}
            >
              <option value="one_time">one_time</option>
              <option value="annual">annual</option>
              <option value="half_yearly">half_yearly</option>
              <option value="quarterly">quarterly</option>
              <option value="monthly">monthly</option>
            </select>
          </div>
          <div>
            <label htmlFor="fi-reminders" className={`${DETAIL_LABEL} flex items-center gap-1.5`}>
              <input
                id="fi-reminders"
                type="checkbox"
                checked={draft.remindersEnabled}
                onChange={(event) => set({ remindersEnabled: event.target.checked })}
              />
              Send reminders
            </label>
          </div>
          <div className="col-span-2">
            <label htmlFor="fi-remarks" className={DETAIL_LABEL}>
              Remarks
            </label>
            <input
              id="fi-remarks"
              value={detail(draft, 'remarks')}
              onChange={(event) => set(setDetail(draft, 'remarks', event.target.value))}
              className={CELL}
            />
          </div>
        </>
      )}
      toDraft={toHoldingDraft}
      emptyDraft={() => {
        const base = emptyHoldingDraft()
        // An FD matures once. Recurring instruments override this per row.
        return { ...base, dueFrequency: 'one_time' }
      }}
      onSave={(draft, id) => {
        const input = { ...draft, category: 'fixed_income' as const }
        return id === null ? createHolding(familyId, input) : updateHolding(id, familyId, input)
      }}
      onDelete={(id) => deleteHolding(id, familyId)}
      deleteConfirm={(row) => ({
        title: `Delete ${row.label}?`,
        body: 'This removes the holding and every reminder logged against it. It cannot be undone.',
      })}
      addLabel="Add holding"
      emptyMessage="No fixed income holdings recorded."
    />
  )
}
