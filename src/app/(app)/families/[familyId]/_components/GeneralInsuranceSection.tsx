'use client'

import { EditableSection, SNUG } from '@/components/ledger/EditableSection'
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
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? 'Whole family'

  return (
    <EditableSection<Holding, HoldingDraft>
      index={2}
      title="General insurance — health & vehicle"
      description="Health floaters cover the whole household; vehicle policies usually sit with one member."
      columns={[
        { key: 'category', label: 'Category', width: SNUG },
        // This section carries one more fact than the other three, and at the
        // page's 980px it did not fit: the snug columns take ~710px, leaving
        // ~230px to split between policy and insured asset when the policy
        // name alone wants ~185px. Both wrapped to three and four lines.
        // Insured asset now rides under the policy name instead of holding a
        // column of its own, which is also where it reads best — it qualifies
        // the policy rather than standing beside it.
        { key: 'label', label: 'Policy' },
        { key: 'coverage', label: 'Coverage', width: SNUG, align: 'right' },
        { key: 'premium', label: 'Premium', width: SNUG, align: 'right' },
        { key: 'due', label: 'Due date', width: SNUG },
        { key: 'managed', label: 'Managed by', width: SNUG },
        { key: 'member', label: 'Member', width: SNUG },
      ]}
      rows={holdings}
      rowKey={(row) => row.id}
      rowLabel={(row) => row.label}
      renderRead={(row) => {
        const details = (row.details ?? {}) as Record<string, unknown>
        const insuredAsset = String(details.insured_asset ?? '').trim()
        return (
          <>
            <td className="whitespace-nowrap px-3 py-2 capitalize">
              {String(details.sub_category ?? '—')}
            </td>
            <td className="px-3 py-2">
              <span className="font-medium">{row.label}</span>
              {/* The insured asset gets its own line only when it says
                  something the policy name does not. On a vehicle policy the
                  two are routinely the same string — the registration number —
                  and printing it twice is noise, not information. */}
              {insuredAsset && insuredAsset !== row.label && (
                <span className="mt-0.5 block text-[11.5px] text-ink-soft">{insuredAsset}</span>
              )}
            </td>
            <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{formatINR(row.principalAmount)}</td>
            <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{formatINR(row.periodicAmount)}</td>
            <td className="whitespace-nowrap px-3 py-2 font-mono">
              {row.nextDueDate ? formatDMY(row.nextDueDate) : '—'}
            </td>
            <td className="whitespace-nowrap px-3 py-2">
              <ManagedByPill value={row.managedBy} />
            </td>
            <td className="whitespace-nowrap px-3 py-2">{nameOf(row.memberId)}</td>
          </>
        )
      }}
      renderEdit={(draft, set, errors) => (
        <>
          <td className="px-3 py-2">
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
          <td className="px-3 py-2">
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
          <td className="px-3 py-2">
            <MoneyInput
              id="gi-coverage"
              label="Coverage"
              value={draft.principalAmount}
              onChange={(principalAmount) => set({ principalAmount })}
              error={errors.principalAmount}
            />
          </td>
          <td className="px-3 py-2">
            <MoneyInput
              id="gi-premium"
              label="Premium"
              value={draft.periodicAmount}
              onChange={(periodicAmount) => set({ periodicAmount })}
              error={errors.periodicAmount}
            />
          </td>
          <td className="px-3 py-2">
            <DateField
              id="gi-due"
              label="Due date"
              value={draft.nextDueDate}
              onChange={(nextDueDate) => set({ nextDueDate })}
              error={errors.nextDueDate}
            />
          </td>
          <td className="px-3 py-2">
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
          {/* Member is set below in the details panel, where its label can
              stay visible — this cell just keeps the column aligned with the
              read row while editing. */}
          <td className="px-3 py-2 text-ink-soft">{nameOf(draft.memberId)}</td>
        </>
      )}
      renderDetails={(draft, set, errors) => (
        <>
          <div>
            {/* Moved out of the row when the column was dropped. It keeps its
                label text, so it is still found by the same name — and gains a
                visible one, which it never had in the row. */}
            <label htmlFor="gi-asset" className={DETAIL_LABEL}>
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
          </div>
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
            <MemberSelect
              id="gi-member"
              label="Member (optional)"
              hideLabel={false}
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
