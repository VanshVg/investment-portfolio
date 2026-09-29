'use client'

import { EditableSection, SNUG } from '@/components/ledger/EditableSection'
import { Field, TextField } from '@/components/ledger/Field'
import { fieldErrorProps } from '@/components/ledger/FieldError'
import { ManagedByPill } from '@/components/ledger/ManagedByPill'
import { MemberSelect } from '@/components/ledger/MemberSelect'
import { MoneyInput } from '@/components/ledger/MoneyInput'
import { DateField } from '@/components/ledger/DateField'
import { inputClass } from '@/components/ui/styles'
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

/** Stored lowercase; shown the way a person would write them. */
const SUB_CATEGORIES: { value: string; label: string }[] = [
  { value: 'health', label: 'Health' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'other', label: 'Other' },
]

function subCategoryLabel(value: unknown): string {
  return SUB_CATEGORIES.find((option) => option.value === value)?.label ?? '—'
}

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
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? 'Whole family'

  return (
    <EditableSection<Holding, HoldingDraft>
      title="General insurance"
      description="Health and vehicle cover. Health floaters cover the whole household; vehicle policies usually sit with one member."
      columns={[
        // Member leads, as it does in every other section, so the advisor
        // reads "whose, then what" in the same order all the way down.
        { key: 'member', label: 'Member', width: SNUG },
        // This section carries two more facts than the others — category and
        // insured asset — and at the page's width neither fits as a column:
        // a registration number broke across two lines. Both ride on a second
        // line under the policy name instead, which is also where they read
        // best: they qualify the policy rather than standing beside it.
        { key: 'label', label: 'Policy' },
        { key: 'coverage', label: 'Coverage', width: SNUG, align: 'right' },
        { key: 'premium', label: 'Premium', width: SNUG, align: 'right' },
        { key: 'due', label: 'Due date', width: SNUG },
        { key: 'managed', label: 'Managed by', width: SNUG },
      ]}
      rows={holdings}
      rowKey={(row) => row.id}
      rowLabel={(row) => row.label}
      renderRead={(row) => {
        const details = (row.details ?? {}) as Record<string, unknown>
        const insuredAsset = String(details.insured_asset ?? '').trim()
        return (
          <>
            <td className={`whitespace-nowrap ${CELL}`}>{nameOf(row.memberId)}</td>
            <td className={CELL}>
              <span className="font-medium">{row.label}</span>
              <span className="mt-0.5 block text-[11.5px] text-ink-soft">
                <span>{subCategoryLabel(details.sub_category)}</span>
                {/* The insured asset is shown only when it says something the
                    policy name does not. On a vehicle policy the two are
                    routinely the same string — the registration number — and
                    printing it twice is noise, not information. */}
                {insuredAsset && insuredAsset !== row.label && <span> · {insuredAsset}</span>}
              </span>
            </td>
            <td className={`whitespace-nowrap ${CELL} text-right font-mono`}>{formatINR(row.principalAmount)}</td>
            <td className={`whitespace-nowrap ${CELL} text-right font-mono`}>{formatINR(row.periodicAmount)}</td>
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
            id="gi-member"
            label="Member"
            members={members}
            value={draft.memberId}
            onChange={(memberId) => set({ memberId })}
            error={errors.memberId}
          />
          <Field id="gi-sub" label="Category" error={detailError(errors, 'sub_category')}>
            <select
              id="gi-sub"
              value={detail(draft, 'sub_category') || 'health'}
              onChange={(event) => set(setDetail(draft, 'sub_category', event.target.value))}
              className={inputClass()}
              {...fieldErrorProps('gi-sub', detailError(errors, 'sub_category'))}
            >
              {SUB_CATEGORIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <TextField
            id="gi-label"
            required
            label="Policy name"
            value={draft.label}
            onChange={(label) => set({ label })}
            error={errors.label}
            className="md:col-span-2"
          />
          <MoneyInput
            id="gi-coverage"
            label="Coverage"
            value={draft.principalAmount}
            onChange={(principalAmount) => set({ principalAmount })}
            error={errors.principalAmount}
          />
          <MoneyInput
            id="gi-premium"
            label="Premium"
            value={draft.periodicAmount}
            onChange={(periodicAmount) => set({ periodicAmount })}
            error={errors.periodicAmount}
          />
          <DateField
            id="gi-due"
            label="Due date"
            value={draft.nextDueDate}
            onChange={(nextDueDate) => set({ nextDueDate })}
            error={errors.nextDueDate}
          />
          <ManagedBySelect id="gi-managed" value={draft.managedBy} onChange={(managedBy) => set({ managedBy })} />
        </>
      )}
      renderDetails={(draft, set, errors) => (
        <>
          <TextField
            id="gi-asset"
            required
            label="Insured asset"
            value={detail(draft, 'insured_asset')}
            onChange={(value) => set(setDetail(draft, 'insured_asset', value))}
            error={detailError(errors, 'insured_asset')}
            placeholder="Vehicle number, or who is covered"
          />
          <TextField
            id="gi-policy-type"
            required
            label="Policy type"
            value={detail(draft, 'policy_type')}
            onChange={(value) => set(setDetail(draft, 'policy_type', value))}
            error={detailError(errors, 'policy_type')}
            placeholder="Floater, comprehensive…"
          />
          <TextField
            id="gi-policy-number"
            label="Policy number"
            value={detail(draft, 'policy_number')}
            onChange={(value) => set(setDetail(draft, 'policy_number', value))}
            error={detailError(errors, 'policy_number')}
            mono
          />
          <TextField
            id="gi-institution"
            label="Insurer"
            value={draft.institution}
            onChange={(institution) => set({ institution })}
          />
          <RemindersToggle
            id="gi-reminders"
            checked={draft.remindersEnabled}
            onChange={(remindersEnabled) => set({ remindersEnabled })}
          />
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
