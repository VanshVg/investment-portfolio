'use client'

import Link from 'next/link'
import { EditableSection } from '@/components/ledger/EditableSection'
import { FieldError, fieldErrorProps } from '@/components/ledger/FieldError'
import { formatDMY } from '@/lib/domain/dates'
import type { FamilySummary } from '@/lib/queries/families'
import type { ActionResult } from '@/lib/actions/result'

interface Draft {
  name: string
  headName: string
  headMobile: string
  notes: string
  goalHorizonYears: number
  assumedCagr: number
}

const CELL = 'w-full rounded border border-line-strong bg-white px-1.5 py-1 text-[12.5px]'

export function FamilyList({
  families,
  createFamily,
  deleteFamily,
}: {
  families: FamilySummary[]
  createFamily: (input: unknown) => Promise<ActionResult>
  deleteFamily: (id: string) => Promise<ActionResult>
}) {
  return (
    <EditableSection<FamilySummary, Draft>
      title="Client families"
      description="Every household you track, whether or not you manage all of their products."
      columns={[
        { key: 'name', label: 'Family', width: '28%' },
        { key: 'head', label: 'Head of family', width: '20%' },
        { key: 'mobile', label: 'Mobile', width: '18%' },
        { key: 'members', label: 'Members', width: '10%' },
        { key: 'holdings', label: 'Records', width: '10%' },
        { key: 'due', label: 'Next due', width: '14%' },
      ]}
      rows={families}
      rowKey={(row) => row.id}
      rowLabel={(row) => row.name}
      renderRead={(row) => (
        <>
          <td className="px-2 py-1.5">
            <Link href={`/families/${row.id}`} className="font-medium text-navy underline">
              {row.name}
            </Link>
          </td>
          <td className="px-2 py-1.5">{row.headName ?? '—'}</td>
          <td className="px-2 py-1.5 font-mono">{row.headMobile ?? '—'}</td>
          <td className="px-2 py-1.5 font-mono">{row.memberCount}</td>
          <td className="px-2 py-1.5 font-mono">{row.holdingCount}</td>
          <td className="px-2 py-1.5 font-mono">
            {row.nextDueDate ? formatDMY(row.nextDueDate) : '—'}
          </td>
        </>
      )}
      renderEdit={(draft, set, errors) => (
        <>
          <td className="px-2 py-1.5">
            <label htmlFor="family-name" className="sr-only">
              Family name
            </label>
            <input
              id="family-name"
              value={draft.name}
              onChange={(event) => set({ name: event.target.value })}
              className={CELL}
              {...fieldErrorProps('family-name', errors.name)}
            />
            <FieldError id="family-name" message={errors.name} />
          </td>
          <td className="px-2 py-1.5">
            <label htmlFor="family-head" className="sr-only">
              Head of family
            </label>
            <input
              id="family-head"
              value={draft.headName}
              onChange={(event) => set({ headName: event.target.value })}
              className={CELL}
            />
          </td>
          <td className="px-2 py-1.5" colSpan={4}>
            <label htmlFor="family-mobile" className="sr-only">
              Mobile
            </label>
            <input
              id="family-mobile"
              value={draft.headMobile}
              onChange={(event) => set({ headMobile: event.target.value })}
              placeholder="98765 43210"
              className={CELL}
              {...fieldErrorProps('family-mobile', errors.headMobile)}
            />
            <FieldError id="family-mobile" message={errors.headMobile} />
          </td>
        </>
      )}
      // The list adds and removes households; it never edits one. Editing
      // happens in the workspace, where the full field set is visible — a
      // partial draft saved from here would silently reset notes, horizon and
      // CAGR to defaults this table never showed. The family-name link is the
      // way in, so no Edit button is rendered at all.
      editable={false}
      emptyDraft={() => ({
        name: '',
        headName: '',
        headMobile: '',
        notes: '',
        goalHorizonYears: 8,
        assumedCagr: 12,
      })}
      onSave={(draft) => createFamily(draft)}
      onDelete={deleteFamily}
      deleteConfirm={(row) => ({
        title: `Delete ${row.name}?`,
        body: `This permanently erases ${row.memberCount} member record(s), ${row.holdingCount} financial record(s), and every reminder logged against them. It cannot be undone.`,
        requireTyping: row.name,
      })}
      addLabel="Add family"
      emptyMessage="No families yet. Add the first household to begin."
    />
  )
}
