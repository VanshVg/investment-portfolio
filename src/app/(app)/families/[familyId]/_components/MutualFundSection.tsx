'use client'

import { EditableSection, SNUG } from '@/components/ledger/EditableSection'
import { NumberField, TextField } from '@/components/ledger/Field'
import { ManagedByPill } from '@/components/ledger/ManagedByPill'
import { MemberSelect } from '@/components/ledger/MemberSelect'
import { MoneyInput } from '@/components/ledger/MoneyInput'
import { DateField } from '@/components/ledger/DateField'
import { formatINR } from '@/lib/domain/money'
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

export function MutualFundSection({
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
      title="Mutual funds"
      description="Current value against the goal each investment is meant to reach."
      columns={[
        { key: 'member', label: 'Member', width: SNUG },
        { key: 'fund', label: 'Fund' },
        { key: 'sip', label: 'Monthly SIP', width: SNUG, align: 'right' },
        { key: 'value', label: 'Current value', width: SNUG, align: 'right' },
        { key: 'goal', label: 'Target goal', width: SNUG, align: 'right' },
        { key: 'managed', label: 'Managed by', width: SNUG },
      ]}
      rows={holdings}
      rowKey={(row) => row.id}
      rowLabel={(row) => row.label}
      renderRead={(row) => {
        const details = (row.details ?? {}) as Record<string, unknown>
        const goal = typeof details.target_goal === 'number' ? details.target_goal : null
        return (
          <>
            <td className={`whitespace-nowrap ${CELL}`}>{nameOf(row.memberId)}</td>
            <td className={`${CELL} font-medium`}>{row.label}</td>
            <td className={`whitespace-nowrap ${CELL} text-right font-mono`}>{formatINR(row.periodicAmount)}</td>
            <td className={`whitespace-nowrap ${CELL} text-right font-mono`}>{formatINR(row.principalAmount)}</td>
            <td className={`whitespace-nowrap ${CELL} text-right font-mono`}>{formatINR(goal)}</td>
            <td className={`whitespace-nowrap ${CELL}`}>
              <ManagedByPill value={row.managedBy} />
            </td>
          </>
        )
      }}
      renderEdit={(draft, set, errors) => {
        const goal = detail(draft, 'target_goal')
        return (
          <>
            <MemberSelect
              id="mf-member"
              label="Member"
              members={members}
              value={draft.memberId}
              onChange={(memberId) => set({ memberId })}
              error={errors.memberId}
            />
            <TextField
              id="mf-label"
            required
              label="Fund name"
              value={draft.label}
              onChange={(label) => set({ label })}
              error={errors.label}
              className="md:col-span-2"
            />
            <ManagedBySelect id="mf-managed" value={draft.managedBy} onChange={(managedBy) => set({ managedBy })} />
            <MoneyInput
              id="mf-sip"
              label="Monthly SIP"
              value={draft.periodicAmount}
              onChange={(periodicAmount) => set({ periodicAmount })}
              error={errors.periodicAmount}
            />
            <MoneyInput
              id="mf-value"
              label="Current value"
              value={draft.principalAmount}
              onChange={(principalAmount) => set({ principalAmount })}
              error={errors.principalAmount}
            />
            {/* A money figure like the two beside it, so it gets the same ₹
                field; stored in details, where an empty goal is absent. */}
            <MoneyInput
              id="mf-goal"
            required
              label="Target goal"
              value={goal === '' ? null : Number(goal)}
              onChange={(value) => set(setDetail(draft, 'target_goal', value ?? undefined))}
              error={detailError(errors, 'target_goal')}
            />
            <DateField
              id="mf-due"
              label="Next SIP / review date"
              value={draft.nextDueDate}
              onChange={(nextDueDate) => set({ nextDueDate })}
              error={errors.nextDueDate}
            />
          </>
        )
      }}
      renderDetails={(draft, set, errors) => (
        <>
          <TextField
            id="mf-folio"
            label="Folio number"
            value={detail(draft, 'folio_number')}
            onChange={(value) => set(setDetail(draft, 'folio_number', value))}
            error={detailError(errors, 'folio_number')}
            mono
          />
          {/* Fund house lives in the top-level institution column, same as
              the insurer/institution field on the other three sections —
              not in details, which would make it the odd one out. */}
          <TextField
            id="mf-house"
            label="Fund house"
            value={draft.institution}
            onChange={(institution) => set({ institution })}
          />
          <NumberField
            id="mf-horizon"
            label="Goal horizon (years)"
            min={1}
            value={detail(draft, 'goal_horizon_years')}
            onChange={(value) => set(setDetail(draft, 'goal_horizon_years', value))}
            error={detailError(errors, 'goal_horizon_years')}
          />
          <RemindersToggle
            id="mf-reminders"
            checked={draft.remindersEnabled}
            onChange={(remindersEnabled) => set({ remindersEnabled })}
          />
        </>
      )}
      toDraft={toHoldingDraft}
      emptyDraft={() => {
        const base = emptyHoldingDraft()
        // A SIP is an auto-debit mandate, not something the advisor chases, so
        // reminders start off. The toggle above turns them on per holding.
        return { ...base, dueFrequency: 'monthly', remindersEnabled: false }
      }}
      onSave={(draft, id) => {
        const input = { ...draft, category: 'mutual_fund' as const }
        return id === null ? createHolding(familyId, input) : updateHolding(id, familyId, input)
      }}
      onDelete={(id) => deleteHolding(id, familyId)}
      deleteConfirm={(row) => ({
        title: `Delete ${row.label}?`,
        body: 'This removes the holding and every reminder logged against it. It cannot be undone.',
      })}
      addLabel="Add holding"
      emptyMessage="No mutual fund holdings recorded."
    />
  )
}
