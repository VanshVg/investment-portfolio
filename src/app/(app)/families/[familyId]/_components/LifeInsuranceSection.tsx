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

export function LifeInsuranceSection({
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
      index={1}
      title="Life insurance"
      description="Mark each policy as managed by you or held externally — external entries are consolidation opportunities."
      columns={[
        { key: 'member', label: 'Member', width: '16%' },
        { key: 'plan', label: 'Plan name', width: '24%' },
        { key: 'sum', label: 'Sum assured', width: '15%' },
        { key: 'premium', label: 'Annual premium', width: '15%' },
        { key: 'due', label: 'Due date', width: '15%' },
        { key: 'managed', label: 'Managed by', width: '15%' },
      ]}
      rows={holdings}
      rowKey={(row) => row.id}
      rowLabel={(row) => row.label}
      renderRead={(row) => (
        <>
          <td className="px-2 py-1.5">{nameOf(row.memberId)}</td>
          <td className="px-2 py-1.5 font-medium">{row.label}</td>
          <td className="px-2 py-1.5 text-right font-mono">{formatINR(row.principalAmount)}</td>
          <td className="px-2 py-1.5 text-right font-mono">{formatINR(row.periodicAmount)}</td>
          <td className="px-2 py-1.5 font-mono">
            {row.nextDueDate ? formatDMY(row.nextDueDate) : '—'}
          </td>
          <td className="px-2 py-1.5">
            <ManagedByPill value={row.managedBy} />
          </td>
        </>
      )}
      renderEdit={(draft, set, errors) => (
        <>
          <td className="px-2 py-1.5">
            <MemberSelect
              id="life-member"
              label="Member"
              members={members}
              value={draft.memberId}
              onChange={(memberId) => set({ memberId })}
              error={errors.memberId}
            />
          </td>
          <td className="px-2 py-1.5">
            <label htmlFor="life-label" className="sr-only">
              Plan name
            </label>
            <input
              id="life-label"
              value={draft.label}
              onChange={(event) => set({ label: event.target.value })}
              className={CELL}
              {...fieldErrorProps('life-label', errors.label)}
            />
            <FieldError id="life-label" message={errors.label} />
          </td>
          <td className="px-2 py-1.5">
            <MoneyInput
              id="life-sum"
              label="Sum assured"
              value={draft.principalAmount}
              onChange={(principalAmount) => set({ principalAmount })}
              error={errors.principalAmount}
            />
          </td>
          <td className="px-2 py-1.5">
            <MoneyInput
              id="life-premium"
              label="Annual premium"
              value={draft.periodicAmount}
              onChange={(periodicAmount) => set({ periodicAmount })}
              error={errors.periodicAmount}
            />
          </td>
          <td className="px-2 py-1.5">
            <DateField
              id="life-due"
              label="Due date"
              value={draft.nextDueDate}
              onChange={(nextDueDate) => set({ nextDueDate })}
              error={errors.nextDueDate}
            />
          </td>
          <td className="px-2 py-1.5">
            <label htmlFor="life-managed" className="sr-only">
              Managed by
            </label>
            <select
              id="life-managed"
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
            <label htmlFor="life-policy-number" className={DETAIL_LABEL}>
              Policy number
            </label>
            <input
              id="life-policy-number"
              value={detail(draft, 'policy_number')}
              onChange={(event) => set(setDetail(draft, 'policy_number', event.target.value))}
              className={CELL}
              {...fieldErrorProps('life-policy-number', detailError(errors, 'policy_number'))}
            />
            <FieldError id="life-policy-number" message={detailError(errors, 'policy_number')} />
          </div>
          <div>
            <label htmlFor="life-plan-type" className={DETAIL_LABEL}>
              Plan type
            </label>
            <input
              id="life-plan-type"
              value={detail(draft, 'plan_type')}
              onChange={(event) => set(setDetail(draft, 'plan_type', event.target.value))}
              className={CELL}
              {...fieldErrorProps('life-plan-type', detailError(errors, 'plan_type'))}
            />
            <FieldError id="life-plan-type" message={detailError(errors, 'plan_type')} />
          </div>
          <div>
            <label htmlFor="life-term" className={DETAIL_LABEL}>
              Term (years)
            </label>
            <input
              id="life-term"
              type="number"
              min={1}
              value={detail(draft, 'term_years')}
              onChange={(event) =>
                set(
                  setDetail(
                    draft,
                    'term_years',
                    event.target.value === '' ? undefined : Number(event.target.value),
                  ),
                )
              }
              className={`${CELL} font-mono`}
              {...fieldErrorProps('life-term', detailError(errors, 'term_years'))}
            />
            <FieldError id="life-term" message={detailError(errors, 'term_years')} />
          </div>
          <div>
            <label htmlFor="life-institution" className={DETAIL_LABEL}>
              Insurer
            </label>
            <input
              id="life-institution"
              value={draft.institution}
              onChange={(event) => set({ institution: event.target.value })}
              className={CELL}
            />
          </div>
        </>
      )}
      toDraft={toHoldingDraft}
      emptyDraft={emptyHoldingDraft}
      onSave={(draft, id) => {
        const input = { ...draft, category: 'life_insurance' as const }
        return id === null ? createHolding(familyId, input) : updateHolding(id, familyId, input)
      }}
      onDelete={(id) => deleteHolding(id, familyId)}
      deleteConfirm={(row) => ({
        title: `Delete ${row.label}?`,
        body: 'This removes the policy and every reminder logged against it. It cannot be undone.',
      })}
      addLabel="Add policy"
      emptyMessage="No life insurance recorded."
    />
  )
}
