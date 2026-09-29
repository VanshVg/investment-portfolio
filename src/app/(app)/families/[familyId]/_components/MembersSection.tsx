'use client'

import { EditableSection, SNUG } from '@/components/ledger/EditableSection'
import { CheckboxField, Field, TextField } from '@/components/ledger/Field'
import { inputClass } from '@/components/ui/styles'
import { memberRelations } from '@/lib/validation/members'
import type { Member, MemberRelation } from '@/lib/queries/families'
import type { ActionResult } from '@/lib/actions/result'
import { CELL } from './holding-fields'

interface Draft {
  name: string
  relation: MemberRelation
  mobile: string
  whatsappConsent: boolean
}

/** Stored lowercase; shown capitalised, as the read row already shows them. */
function relationLabel(relation: string): string {
  return relation.charAt(0).toUpperCase() + relation.slice(1)
}

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
          <td className={`${CELL} font-medium`}>{row.name}</td>
          <td className={`whitespace-nowrap ${CELL}`}>{relationLabel(row.relation)}</td>
          <td className={`whitespace-nowrap ${CELL} font-mono`}>{row.mobile ?? '—'}</td>
          <td className={`whitespace-nowrap ${CELL}`}>
            {row.whatsappConsent ? (
              <span className="inline-block rounded-full bg-teal-bg px-2 py-0.5 text-[11px] font-medium text-teal">
                Consented
              </span>
            ) : (
              <span className="text-[12px] text-ink-soft">Not consented</span>
            )}
          </td>
        </>
      )}
      renderEdit={(draft, set, errors) => {
        const noMobile = draft.mobile.trim() === ''
        return (
          <>
            <TextField
              id="member-name"
            required
              label="Name"
              value={draft.name}
              onChange={(name) => set({ name })}
              error={errors.name}
              className="md:col-span-2"
            />
            <Field id="member-relation" label="Relation">
              <select
                id="member-relation"
                value={draft.relation}
                onChange={(event) => set({ relation: event.target.value as MemberRelation })}
                className={inputClass()}
              >
                {memberRelations.map((relation) => (
                  <option key={relation} value={relation}>
                    {relationLabel(relation)}
                  </option>
                ))}
              </select>
            </Field>
            <TextField
              id="member-mobile"
              label="Mobile"
              value={draft.mobile}
              placeholder="98765 43210"
              mono
              onChange={(mobile) =>
                // Clearing the number must clear consent too, or the row would
                // be rejected by the check constraint on save.
                set({
                  mobile,
                  whatsappConsent: mobile.trim() === '' ? false : draft.whatsappConsent,
                })
              }
              error={errors.mobile}
            />
            <CheckboxField
              id="member-consent"
              label="WhatsApp consent"
              checked={draft.whatsappConsent}
              disabled={noMobile}
              hint={noMobile ? 'Add a mobile number first.' : undefined}
              onChange={(whatsappConsent) => set({ whatsappConsent })}
              error={errors.whatsappConsent}
            />
          </>
        )
      }}
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
              ? `${count} financial record(s) are linked to ${row.name}. They stay on this household's ledger, still marked as ${row.name}'s, and their reminders go to you only. You can restore ${row.name} from Deleted items.`
              : `${row.name} has no financial records linked. You can restore ${row.name} from Deleted items.`,
        }
      }}
      addLabel="Add family member"
      emptyMessage="No members yet."
    />
  )
}
