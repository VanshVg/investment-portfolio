'use client'

import { EditableSection } from '@/components/ledger/EditableSection'
import { FieldError, fieldErrorProps } from '@/components/ledger/FieldError'
import { ManagedByPill } from '@/components/ledger/ManagedByPill'
import { MemberSelect } from '@/components/ledger/MemberSelect'
import { MoneyInput } from '@/components/ledger/MoneyInput'
import { DateField } from '@/components/ledger/DateField'
import { formatINR } from '@/lib/domain/money'
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
      index={3}
      title="Mutual funds & goals"
      description="Current value against the target this investment is meant to reach."
      columns={[
        { key: 'member', label: 'Member', width: '16%' },
        { key: 'fund', label: 'Fund', width: '24%' },
        { key: 'sip', label: 'Monthly SIP', width: '15%' },
        { key: 'value', label: 'Current value', width: '15%' },
        { key: 'goal', label: 'Target goal', width: '15%' },
        { key: 'managed', label: 'Managed by', width: '15%' },
      ]}
      rows={holdings}
      rowKey={(row) => row.id}
      rowLabel={(row) => row.label}
      renderRead={(row) => {
        const details = (row.details ?? {}) as Record<string, unknown>
        const goal = typeof details.target_goal === 'number' ? details.target_goal : null
        return (
          <>
            <td className="px-2 py-1.5">{nameOf(row.memberId)}</td>
            <td className="px-2 py-1.5 font-medium">{row.label}</td>
            <td className="px-2 py-1.5 text-right font-mono">{formatINR(row.periodicAmount)}</td>
            <td className="px-2 py-1.5 text-right font-mono">{formatINR(row.principalAmount)}</td>
            <td className="px-2 py-1.5 text-right font-mono">{formatINR(goal)}</td>
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
              id="mf-member"
              label="Member"
              members={members}
              value={draft.memberId}
              onChange={(memberId) => set({ memberId })}
              error={errors.memberId}
            />
          </td>
          <td className="px-2 py-1.5">
            <label htmlFor="mf-label" className="sr-only">
              Fund name
            </label>
            <input
              id="mf-label"
              value={draft.label}
              onChange={(event) => set({ label: event.target.value })}
              className={CELL}
              {...fieldErrorProps('mf-label', errors.label)}
            />
            <FieldError id="mf-label" message={errors.label} />
          </td>
          <td className="px-2 py-1.5">
            <MoneyInput
              id="mf-sip"
              label="Monthly SIP"
              value={draft.periodicAmount}
              onChange={(periodicAmount) => set({ periodicAmount })}
              error={errors.periodicAmount}
            />
          </td>
          <td className="px-2 py-1.5">
            <MoneyInput
              id="mf-value"
              label="Current value"
              value={draft.principalAmount}
              onChange={(principalAmount) => set({ principalAmount })}
              error={errors.principalAmount}
            />
          </td>
          <td className="px-2 py-1.5">
            <label htmlFor="mf-goal" className="sr-only">
              Target goal
            </label>
            <input
              id="mf-goal"
              type="number"
              min={0}
              value={detail(draft, 'target_goal')}
              onChange={(event) =>
                set(
                  setDetail(
                    draft,
                    'target_goal',
                    event.target.value === '' ? undefined : Number(event.target.value),
                  ),
                )
              }
              className={`${CELL} text-right font-mono`}
              {...fieldErrorProps('mf-goal', detailError(errors, 'target_goal'))}
            />
            <FieldError id="mf-goal" message={detailError(errors, 'target_goal')} />
          </td>
          <td className="px-2 py-1.5">
            <label htmlFor="mf-managed" className="sr-only">
              Managed by
            </label>
            <select
              id="mf-managed"
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
            <label htmlFor="mf-folio" className={DETAIL_LABEL}>
              Folio number
            </label>
            <input
              id="mf-folio"
              value={detail(draft, 'folio_number')}
              onChange={(event) => set(setDetail(draft, 'folio_number', event.target.value))}
              className={CELL}
              {...fieldErrorProps('mf-folio', detailError(errors, 'folio_number'))}
            />
            <FieldError id="mf-folio" message={detailError(errors, 'folio_number')} />
          </div>
          <div>
            <label htmlFor="mf-house" className={DETAIL_LABEL}>
              Fund house
            </label>
            <input
              id="mf-house"
              value={detail(draft, 'fund_house')}
              onChange={(event) => set(setDetail(draft, 'fund_house', event.target.value))}
              className={CELL}
              {...fieldErrorProps('mf-house', detailError(errors, 'fund_house'))}
            />
            <FieldError id="mf-house" message={detailError(errors, 'fund_house')} />
          </div>
          <div>
            <label htmlFor="mf-horizon" className={DETAIL_LABEL}>
              Goal horizon (years)
            </label>
            <input
              id="mf-horizon"
              type="number"
              min={1}
              value={detail(draft, 'goal_horizon_years')}
              onChange={(event) =>
                set(
                  setDetail(
                    draft,
                    'goal_horizon_years',
                    event.target.value === '' ? undefined : Number(event.target.value),
                  ),
                )
              }
              className={`${CELL} font-mono`}
              {...fieldErrorProps('mf-horizon', detailError(errors, 'goal_horizon_years'))}
            />
            <FieldError id="mf-horizon" message={detailError(errors, 'goal_horizon_years')} />
          </div>
          <div>
            <label htmlFor="mf-due" className={DETAIL_LABEL}>
              Next SIP / review date
            </label>
            <DateField
              id="mf-due"
              label="Next SIP / review date"
              value={draft.nextDueDate}
              onChange={(nextDueDate) => set({ nextDueDate })}
              error={errors.nextDueDate}
            />
          </div>
          <div>
            <label htmlFor="mf-reminders" className={`${DETAIL_LABEL} flex items-center gap-1.5`}>
              <input
                id="mf-reminders"
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
        body: 'This removes the holding and its goal target. It cannot be undone.',
      })}
      addLabel="Add holding"
      emptyMessage="No mutual fund holdings recorded."
    />
  )
}
