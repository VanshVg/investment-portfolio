'use client'

import { EditableSection, SNUG } from '@/components/ledger/EditableSection'
import { NumberField, TextField } from '@/components/ledger/Field'
import { ManagedByPill } from '@/components/ledger/ManagedByPill'
import { MemberSelect } from '@/components/ledger/MemberSelect'
import { MoneyInput } from '@/components/ledger/MoneyInput'
import { DateField } from '@/components/ledger/DateField'
import { formatINR } from '@/lib/domain/money'
import { formatDMY } from '@/lib/domain/dates'
import type { Holding, Member } from '@/lib/queries/families'
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
      title="Life insurance"
      description="Mark each policy as managed by you or held externally — external entries are consolidation opportunities."
      columns={[
        { key: 'member', label: 'Member', width: SNUG },
        { key: 'plan', label: 'Plan name' },
        { key: 'sum', label: 'Sum assured', width: SNUG, align: 'right' },
        { key: 'premium', label: 'Annual premium', width: SNUG, align: 'right' },
        { key: 'due', label: 'Due date', width: SNUG },
        { key: 'managed', label: 'Managed by', width: SNUG },
      ]}
      rows={holdings}
      rowKey={(row) => row.id}
      rowLabel={(row) => row.label}
      renderRead={(row) => (
        <>
          <td className={`whitespace-nowrap ${CELL}`}>{nameOf(row.memberId)}</td>
          <td className={`${CELL} font-medium`}>{row.label}</td>
          <td className={`whitespace-nowrap ${CELL} text-right font-mono`}>{formatINR(row.principalAmount)}</td>
          <td className={`whitespace-nowrap ${CELL} text-right font-mono`}>{formatINR(row.periodicAmount)}</td>
          <td className={`whitespace-nowrap ${CELL} font-mono`}>
            {row.nextDueDate ? formatDMY(row.nextDueDate) : '—'}
          </td>
          <td className={`whitespace-nowrap ${CELL}`}>
            <ManagedByPill value={row.managedBy} />
          </td>
        </>
      )}
      renderEdit={(draft, set, errors) => (
        <>
          <MemberSelect
            id="life-member"
            label="Member"
            members={members}
            value={draft.memberId}
            onChange={(memberId) => set({ memberId })}
            error={errors.memberId}
          />
          <TextField
            id="life-label"
            label="Plan name"
            value={draft.label}
            onChange={(label) => set({ label })}
            error={errors.label}
            className="md:col-span-2"
          />
          <ManagedBySelect id="life-managed" value={draft.managedBy} onChange={(managedBy) => set({ managedBy })} />
          <MoneyInput
            id="life-sum"
            label="Sum assured"
            value={draft.principalAmount}
            onChange={(principalAmount) => set({ principalAmount })}
            error={errors.principalAmount}
          />
          <MoneyInput
            id="life-premium"
            label="Annual premium"
            value={draft.periodicAmount}
            onChange={(periodicAmount) => set({ periodicAmount })}
            error={errors.periodicAmount}
          />
          <DateField
            id="life-due"
            label="Due date"
            value={draft.nextDueDate}
            onChange={(nextDueDate) => set({ nextDueDate })}
            error={errors.nextDueDate}
          />
        </>
      )}
      renderDetails={(draft, set, errors) => (
        <>
          <TextField
            id="life-policy-number"
            label="Policy number"
            value={detail(draft, 'policy_number')}
            onChange={(value) => set(setDetail(draft, 'policy_number', value))}
            error={detailError(errors, 'policy_number')}
            mono
          />
          <TextField
            id="life-plan-type"
            label="Plan type"
            value={detail(draft, 'plan_type')}
            onChange={(value) => set(setDetail(draft, 'plan_type', value))}
            error={detailError(errors, 'plan_type')}
            placeholder="Term, endowment, ULIP…"
          />
          <NumberField
            id="life-term"
            label="Term (years)"
            min={1}
            value={detail(draft, 'term_years')}
            onChange={(value) => set(setDetail(draft, 'term_years', value))}
            error={detailError(errors, 'term_years')}
          />
          <TextField
            id="life-institution"
            label="Insurer"
            value={draft.institution}
            onChange={(institution) => set({ institution })}
          />
          <RemindersToggle
            id="life-reminders"
            checked={draft.remindersEnabled}
            onChange={(remindersEnabled) => set({ remindersEnabled })}
          />
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
