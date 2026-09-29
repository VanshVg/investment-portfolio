'use client'

import { EditableSection, SNUG } from '@/components/ledger/EditableSection'
import { Field, NumberField, TextField } from '@/components/ledger/Field'
import { ManagedByPill } from '@/components/ledger/ManagedByPill'
import { MemberSelect, memberName } from '@/components/ledger/MemberSelect'
import { MoneyInput } from '@/components/ledger/MoneyInput'
import { DateField } from '@/components/ledger/DateField'
import { inputClass } from '@/components/ui/styles'
import { formatINR } from '@/lib/domain/money'
import { formatDMY } from '@/lib/domain/dates'
import type { DueFrequency, Holding, Member } from '@/lib/queries/families'
import type { ActionResult } from '@/lib/actions/result'
import {
  detail,
  detailError,
  emptyHoldingDraft,
  setDetail,
  toHoldingDraft,
  type HoldingDraft,
} from './holding-draft'
import { CELL, ManagedBySelect, RemindersToggle } from './holding-fields'

/** The stored enum values, shown as words rather than identifiers. */
const FREQUENCIES: { value: DueFrequency; label: string }[] = [
  { value: 'one_time', label: 'One-time (matures once)' },
  { value: 'annual', label: 'Annual' },
  { value: 'half_yearly', label: 'Half-yearly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'monthly', label: 'Monthly' },
]

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
  const nameOf = (id: string | null) => memberName(members, id)

  return (
    <EditableSection<Holding, HoldingDraft>
      title="Fixed income"
      description="Deposits, bonds and demat holdings. Maturity dates drive reminders here exactly as renewal dates do for insurance."
      columns={[
        { key: 'member', label: 'Member', width: SNUG },
        // Asset type rides under the description rather than in a column of
        // its own: the two are often near-identical ("Bank fixed deposit"),
        // and side by side they squeezed the description onto two lines.
        { key: 'label', label: 'Description' },
        { key: 'institution', label: 'Institution', width: SNUG },
        { key: 'amount', label: 'Invested', width: SNUG, align: 'right' },
        { key: 'maturity', label: 'Maturity', width: SNUG },
        { key: 'managed', label: 'Managed by', width: SNUG },
      ]}
      rows={holdings}
      rowKey={(row) => row.id}
      rowLabel={(row) => row.label}
      renderRead={(row) => {
        const details = (row.details ?? {}) as Record<string, unknown>
        const assetType = String(details.asset_type ?? '').trim()
        return (
          <>
            <td className={`whitespace-nowrap ${CELL}`}>{nameOf(row.memberId)}</td>
            <td className={CELL}>
              <span className="font-medium">{row.label}</span>
              {/* Shown only when it adds something the description does not. */}
              {assetType && assetType.toLowerCase() !== row.label.toLowerCase() && (
                <span className="mt-0.5 block text-[11.5px] text-ink-soft">{assetType}</span>
              )}
            </td>
            <td className={`whitespace-nowrap ${CELL}`}>{row.institution ?? '—'}</td>
            <td className={`whitespace-nowrap ${CELL} text-right font-mono`}>{formatINR(row.principalAmount)}</td>
            <td className={`whitespace-nowrap ${CELL} font-mono`}>
              {row.nextDueDate ? formatDMY(row.nextDueDate) : '—'}
            </td>
            <td className={`whitespace-nowrap ${CELL}`}>
              <ManagedByPill value={row.managedBy} />
            </td>
          </>
        )
      }}
      renderEdit={(draft, set, errors) => (
        <>
          <MemberSelect
            id="fi-member"
            label="Member"
            members={members}
            value={draft.memberId}
            onChange={(memberId) => set({ memberId })}
            error={errors.memberId}
          />
          <TextField
            id="fi-label"
            required
            label="Description"
            value={draft.label}
            onChange={(label) => set({ label })}
            error={errors.label}
            className="md:col-span-2"
          />
          <ManagedBySelect id="fi-managed" value={draft.managedBy} onChange={(managedBy) => set({ managedBy })} />
          <TextField
            id="fi-asset"
            required
            label="Asset type"
            value={detail(draft, 'asset_type')}
            onChange={(value) => set(setDetail(draft, 'asset_type', value))}
            error={detailError(errors, 'asset_type')}
            placeholder="FD / NCD / Bond"
          />
          <TextField
            id="fi-institution"
            label="Institution"
            value={draft.institution}
            onChange={(institution) => set({ institution })}
          />
          <MoneyInput
            id="fi-amount"
            label="Invested amount"
            value={draft.principalAmount}
            onChange={(principalAmount) => set({ principalAmount })}
            error={errors.principalAmount}
          />
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
        </>
      )}
      renderDetails={(draft, set, errors) => (
        <>
          <NumberField
            id="fi-rate"
            label="Interest rate (%)"
            min={0}
            step="0.01"
            value={detail(draft, 'interest_rate')}
            onChange={(value) => set(setDetail(draft, 'interest_rate', value))}
            error={detailError(errors, 'interest_rate')}
          />
          <TextField
            id="fi-payout"
            label="Payout frequency"
            value={detail(draft, 'payout_frequency')}
            onChange={(value) => set(setDetail(draft, 'payout_frequency', value))}
            error={detailError(errors, 'payout_frequency')}
            placeholder="Cumulative, quarterly…"
          />
          <Field id="fi-frequency" label="Frequency">
            <select
              id="fi-frequency"
              value={draft.dueFrequency}
              onChange={(event) => set({ dueFrequency: event.target.value as DueFrequency })}
              className={inputClass()}
            >
              {FREQUENCIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <RemindersToggle
            id="fi-reminders"
            checked={draft.remindersEnabled}
            onChange={(remindersEnabled) => set({ remindersEnabled })}
          />
          <TextField
            id="fi-remarks"
            label="Remarks"
            value={detail(draft, 'remarks')}
            onChange={(value) => set(setDetail(draft, 'remarks', value))}
            error={detailError(errors, 'remarks')}
            className="sm:col-span-2"
          />
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
        body: 'This hides the holding and stops its reminders. You can restore it from Deleted items.',
      })}
      addLabel="Add holding"
      emptyMessage="No fixed income holdings recorded."
    />
  )
}
