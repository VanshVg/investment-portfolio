'use client'

import { EditableSection } from '@/components/ledger/EditableSection'
import { FieldError, fieldErrorProps } from '@/components/ledger/FieldError'
import { ManagedByPill } from '@/components/ledger/ManagedByPill'
import { MemberSelect } from '@/components/ledger/MemberSelect'
import { MoneyInput } from '@/components/ledger/MoneyInput'
import { DateField } from '@/components/ledger/DateField'
import { formatINR } from '@/lib/domain/money'
import { formatDMY } from '@/lib/domain/dates'
import type { Holding, ManagedBy, Member } from '@/lib/queries/families'
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

export function GeneralInsuranceSection({
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
  return (
    <EditableSection<Holding, HoldingDraft>
      index={2}
      title="General insurance — health & vehicle"
      description="Health floaters cover the whole household; vehicle policies usually sit with one member."
      columns={[
        { key: 'category', label: 'Category', width: '11%' },
        { key: 'label', label: 'Policy', width: '22%' },
        { key: 'asset', label: 'Insured asset', width: '19%' },
        { key: 'coverage', label: 'Coverage', width: '14%' },
        { key: 'premium', label: 'Premium', width: '12%' },
        { key: 'due', label: 'Due date', width: '12%' },
        { key: 'managed', label: 'Managed by', width: '10%' },
      ]}
      rows={holdings}
      rowKey={(row) => row.id}
      rowLabel={(row) => row.label}
      renderRead={(row) => {
        const details = (row.details ?? {}) as Record<string, unknown>
        return (
          <>
            <td className="px-2 py-1.5 capitalize">{String(details.sub_category ?? '—')}</td>
            <td className="px-2 py-1.5 font-medium">{row.label}</td>
            <td className="px-2 py-1.5">{String(details.insured_asset ?? '—')}</td>
            <td className="px-2 py-1.5 text-right font-mono">{formatINR(row.principalAmount)}</td>
            <td className="px-2 py-1.5 text-right font-mono">{formatINR(row.periodicAmount)}</td>
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
            <label htmlFor="gi-sub" className="sr-only">
              Category
            </label>
            <select
              id="gi-sub"
              value={detail(draft, 'sub_category') || 'health'}
              onChange={(event) => set(setDetail(draft, 'sub_category', event.target.value))}
              className={CELL}
              {...fieldErrorProps('gi-sub', detailError(errors, 'sub_category'))}
            >
              <option value="health">health</option>
              <option value="vehicle">vehicle</option>
              <option value="other">other</option>
            </select>
            <FieldError id="gi-sub" message={detailError(errors, 'sub_category')} />
          </td>
          <td className="px-2 py-1.5">
            <label htmlFor="gi-label" className="sr-only">
              Policy name
            </label>
            <input
              id="gi-label"
              value={draft.label}
              onChange={(event) => set({ label: event.target.value })}
              className={CELL}
              {...fieldErrorProps('gi-label', errors.label)}
            />
            <FieldError id="gi-label" message={errors.label} />
          </td>
          <td className="px-2 py-1.5">
            <label htmlFor="gi-asset" className="sr-only">
              Insured asset
            </label>
            <input
              id="gi-asset"
              value={detail(draft, 'insured_asset')}
              onChange={(event) => set(setDetail(draft, 'insured_asset', event.target.value))}
              className={CELL}
              {...fieldErrorProps('gi-asset', detailError(errors, 'insured_asset'))}
            />
            <FieldError id="gi-asset" message={detailError(errors, 'insured_asset')} />
          </td>
          <td className="px-2 py-1.5">
            <MoneyInput
              id="gi-coverage"
              label="Coverage"
              value={draft.principalAmount}
              onChange={(principalAmount) => set({ principalAmount })}
              error={errors.principalAmount}
            />
          </td>
          <td className="px-2 py-1.5">
            <MoneyInput
              id="gi-premium"
              label="Premium"
              value={draft.periodicAmount}
              onChange={(periodicAmount) => set({ periodicAmount })}
              error={errors.periodicAmount}
            />
          </td>
          <td className="px-2 py-1.5">
            <DateField
              id="gi-due"
              label="Due date"
              value={draft.nextDueDate}
              onChange={(nextDueDate) => set({ nextDueDate })}
              error={errors.nextDueDate}
            />
          </td>
          <td className="px-2 py-1.5">
            <label htmlFor="gi-managed" className="sr-only">
              Managed by
            </label>
            <select
              id="gi-managed"
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
            <label htmlFor="gi-policy-type" className={DETAIL_LABEL}>
              Policy type
            </label>
            <input
              id="gi-policy-type"
              value={detail(draft, 'policy_type')}
              onChange={(event) => set(setDetail(draft, 'policy_type', event.target.value))}
              className={CELL}
              {...fieldErrorProps('gi-policy-type', detailError(errors, 'policy_type'))}
            />
            <FieldError id="gi-policy-type" message={detailError(errors, 'policy_type')} />
          </div>
          <div>
            <label htmlFor="gi-policy-number" className={DETAIL_LABEL}>
              Policy number
            </label>
            <input
              id="gi-policy-number"
              value={detail(draft, 'policy_number')}
              onChange={(event) => set(setDetail(draft, 'policy_number', event.target.value))}
              className={CELL}
              {...fieldErrorProps('gi-policy-number', detailError(errors, 'policy_number'))}
            />
            <FieldError id="gi-policy-number" message={detailError(errors, 'policy_number')} />
          </div>
          <div>
            <label htmlFor="gi-institution" className={DETAIL_LABEL}>
              Insurer
            </label>
            <input
              id="gi-institution"
              value={draft.institution}
              onChange={(event) => set({ institution: event.target.value })}
              className={CELL}
            />
          </div>
          <div>
            <label htmlFor="gi-member" className={DETAIL_LABEL}>
              Member (optional)
            </label>
            <MemberSelect
              id="gi-member"
              label="Member"
              members={members}
              value={draft.memberId}
              onChange={(memberId) => set({ memberId })}
              error={errors.memberId}
            />
          </div>
          <div>
            <label htmlFor="gi-reminders" className={`${DETAIL_LABEL} flex items-center gap-1.5`}>
              <input
                id="gi-reminders"
                type="checkbox"
                checked={draft.remindersEnabled}
                onChange={(event) => set({ remindersEnabled: event.target.checked })}
              />
              Send reminders
            </label>
          </div>
        </>
      )}
      toDraft={toHoldingDraft}
      emptyDraft={() => {
        const base = emptyHoldingDraft()
        // sub_category is required by the schema, so a new row starts valid
        // rather than failing on a field the advisor never saw as empty.
        return { ...base, details: { sub_category: 'health' } }
      }}
      onSave={(draft, id) => {
        const input = { ...draft, category: 'general_insurance' as const }
        return id === null ? createHolding(familyId, input) : updateHolding(id, familyId, input)
      }}
      onDelete={(id) => deleteHolding(id, familyId)}
      deleteConfirm={(row) => ({
        title: `Delete ${row.label}?`,
        body: 'This removes the policy and every reminder logged against it. It cannot be undone.',
      })}
      addLabel="Add policy"
      emptyMessage="No general insurance recorded."
    />
  )
}
