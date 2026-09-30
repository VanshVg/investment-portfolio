'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { EditableSection, SNUG } from '@/components/ledger/EditableSection'
import { TextField } from '@/components/ledger/Field'
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

const CELL = 'px-3 py-2.5'

export function FamilyList({
  families,
  search,
  toolbar,
  createFamily,
  deleteFamily,
}: {
  families: FamilySummary[]
  /** The active search, so an empty result can say it is a search result. */
  search?: string
  toolbar?: React.ReactNode
  createFamily: (input: unknown) => Promise<ActionResult>
  deleteFamily: (id: string) => Promise<ActionResult>
}) {
  const router = useRouter()

  return (
    <EditableSection<FamilySummary, Draft>
      headingLevel={1}
      title="Families"
      description="Every household you track, whether or not you manage all of their products."
      toolbar={toolbar}
      columns={[
        { key: 'name', label: 'Family' },
        { key: 'head', label: 'Head of family' },
        { key: 'mobile', label: 'Mobile', width: SNUG },
        { key: 'members', label: 'Members', width: SNUG, align: 'right' },
        { key: 'holdings', label: 'Records', width: SNUG, align: 'right' },
        { key: 'due', label: 'Next due', width: SNUG },
      ]}
      rows={families}
      rowKey={(row) => row.id}
      rowLabel={(row) => row.name}
      renderRead={(row) => (
        <>
          <td className={CELL}>
            <Link href={`/families/${row.id}`} className="font-medium text-navy hover:underline">
              {row.name}
            </Link>
          </td>
          <td className={CELL}>{row.headName ?? '—'}</td>
          <td className={`whitespace-nowrap ${CELL} font-mono`}>{row.headMobile ?? '—'}</td>
          <td className={`whitespace-nowrap ${CELL} text-right font-mono`}>{row.memberCount}</td>
          <td className={`whitespace-nowrap ${CELL} text-right font-mono`}>{row.holdingCount}</td>
          <td className={`whitespace-nowrap ${CELL} font-mono`}>
            {row.nextDueDate ? formatDMY(row.nextDueDate) : '—'}
          </td>
        </>
      )}
      renderEdit={(draft, set, errors) => (
        <>
          <TextField
            id="family-name"
            required
            label="Family name"
            value={draft.name}
            onChange={(name) => set({ name })}
            error={errors.name}
            placeholder="e.g. Patel — Rajeshkumar"
            className="md:col-span-2"
          />
          <TextField
            id="family-head"
            label="Head of family"
            value={draft.headName}
            onChange={(headName) => set({ headName })}
          />
          <TextField
            id="family-mobile"
            label="Mobile"
            value={draft.headMobile}
            onChange={(headMobile) => set({ headMobile })}
            error={errors.headMobile}
            placeholder="98765 43210"
            mono
          />
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
      // A new household is empty; the next thing to do is add its members and
      // policies, which happens on its own page.
      onCreated={(id) => router.push(`/families/${id}`)}
      onDelete={deleteFamily}
      deleteConfirm={(row) => ({
        title: `Delete ${row.name}?`,
        body: `This hides the household, its ${row.memberCount} member record(s) and ${row.holdingCount} financial record(s), and stops their reminders.`,
        requireTyping: row.name,
      })}
      addLabel="Add family"
      emptyMessage={
        search
          ? `No families match “${search}”.`
          : 'No families yet. Add the first household to begin.'
      }
    />
  )
}
