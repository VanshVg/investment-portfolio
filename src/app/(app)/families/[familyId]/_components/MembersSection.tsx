'use client'

import { EditableSection, SNUG } from '@/components/ledger/EditableSection'
import { FieldError, fieldErrorProps } from '@/components/ledger/FieldError'
import { memberRelations } from '@/lib/validation/members'
import type { Member, MemberRelation } from '@/lib/queries/families'
import type { ActionResult } from '@/lib/actions/result'

interface Draft {
  name: string
  relation: MemberRelation
  mobile: string
  whatsappConsent: boolean
}

const CELL = 'w-full rounded border border-line-strong bg-white px-1.5 py-1 text-[12.5px]'

export function MembersSection({
  familyId,
  members,
  holdingCountByMember,
  createMember,
  updateMember,
  deleteMember,
}: {
  familyId: string
  members: Member[]
  holdingCountByMember: Record<string, number>
  createMember: (familyId: string, input: unknown) => Promise<ActionResult>
  updateMember: (id: string, familyId: string, input: unknown) => Promise<ActionResult>
  deleteMember: (id: string, familyId: string) => Promise<ActionResult>
}) {
  return (
    <EditableSection<Member, Draft>
      title="Family members"
      description="Everyone this household's cover and investments should track. Consent is required before any reminder goes to a client."
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'relation', label: 'Relation', width: SNUG },
        { key: 'mobile', label: 'Mobile', width: SNUG },
        { key: 'consent', label: 'WhatsApp', width: SNUG },
      ]}
      rows={members}
      rowKey={(row) => row.id}
      rowLabel={(row) => row.name}
      renderRead={(row) => (
        <>
          <td className="px-3 py-2 font-medium">{row.name}</td>
          <td className="whitespace-nowrap px-3 py-2 capitalize">{row.relation}</td>
          <td className="whitespace-nowrap px-3 py-2 font-mono">{row.mobile ?? '—'}</td>
          <td className="whitespace-nowrap px-3 py-2">
            {row.whatsappConsent ? (
              <span className="rounded-full bg-teal-bg px-2 py-0.5 text-[11px] text-teal">
                Consented
              </span>
            ) : (
              <span className="text-ink-soft">Not consented</span>
            )}
          </td>
        </>
      )}
      renderEdit={(draft, set, errors) => (
        <>
          <td className="px-3 py-2">
            <label htmlFor="member-name" className="sr-only">
              Name
            </label>
            <input
              id="member-name"
              value={draft.name}
              onChange={(event) => set({ name: event.target.value })}
              className={CELL}
              {...fieldErrorProps('member-name', errors.name)}
            />
            <FieldError id="member-name" message={errors.name} />
          </td>
          <td className="px-3 py-2">
            <label htmlFor="member-relation" className="sr-only">
              Relation
            </label>
            <select
              id="member-relation"
              value={draft.relation}
              onChange={(event) => set({ relation: event.target.value as MemberRelation })}
              className={CELL}
            >
              {memberRelations.map((relation) => (
                <option key={relation} value={relation}>
                  {relation}
                </option>
              ))}
            </select>
          </td>
          <td className="px-3 py-2">
            <label htmlFor="member-mobile" className="sr-only">
              Mobile
            </label>
            <input
              id="member-mobile"
              value={draft.mobile}
              placeholder="98765 43210"
              onChange={(event) =>
                // Clearing the number must clear consent too, or the row would
                // be rejected by the check constraint on save.
                set({
                  mobile: event.target.value,
                  whatsappConsent: event.target.value.trim() === '' ? false : draft.whatsappConsent,
                })
              }
              className={`${CELL} font-mono`}
              {...fieldErrorProps('member-mobile', errors.mobile)}
            />
            <FieldError id="member-mobile" message={errors.mobile} />
          </td>
          <td className="px-3 py-2">
            <label htmlFor="member-consent" className="flex items-center gap-1.5 text-[12px]">
              <input
                id="member-consent"
                type="checkbox"
                checked={draft.whatsappConsent}
                disabled={draft.mobile.trim() === ''}
                onChange={(event) => set({ whatsappConsent: event.target.checked })}
                {...fieldErrorProps('member-consent', errors.whatsappConsent)}
              />
              WhatsApp consent
            </label>
            <FieldError id="member-consent" message={errors.whatsappConsent} />
          </td>
        </>
      )}
      toDraft={(row) => ({
        name: row.name,
        relation: row.relation,
        mobile: row.mobile ?? '',
        whatsappConsent: row.whatsappConsent,
      })}
      emptyDraft={() => ({ name: '', relation: 'other', mobile: '', whatsappConsent: false })}
      onSave={(draft, id) =>
        id === null ? createMember(familyId, draft) : updateMember(id, familyId, draft)
      }
      onDelete={(id) => deleteMember(id, familyId)}
      deleteConfirm={(row) => {
        const count = holdingCountByMember[row.id] ?? 0
        return {
          title: `Remove ${row.name}?`,
          body:
            count > 0
              ? `${count} financial record(s) are linked to ${row.name}. They will be kept, but will no longer be attributed to anyone. This cannot be undone.`
              : `${row.name} has no financial records linked. This cannot be undone.`,
        }
      }}
      addLabel="Add family member"
      emptyMessage="No members yet."
    />
  )
}
