'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import type { ActionResult } from '@/lib/actions/result'
import { ConfirmDelete } from './ConfirmDelete'

export interface Column {
  key: string
  label: string
  width?: string
}

type Mode<T> = { kind: 'idle' } | { kind: 'new' } | { kind: 'edit'; row: T }

export interface EditableSectionProps<T, D> {
  title: string
  index?: number
  description?: string
  columns: Column[]
  rows: T[]
  rowKey: (row: T) => string
  rowLabel?: (row: T) => string
  renderRead: (row: T) => React.ReactNode
  renderEdit: (
    draft: D,
    set: (patch: Partial<D>) => void,
    errors: Record<string, string>,
  ) => React.ReactNode
  renderDetails?: (
    draft: D,
    set: (patch: Partial<D>) => void,
    errors: Record<string, string>,
  ) => React.ReactNode
  /** Required whenever `editable` is not false — it is only called in edit mode. */
  toDraft?: (row: T) => D
  emptyDraft: () => D
  /** When false, rows are add-and-delete only and no Edit button is rendered. */
  editable?: boolean
  onSave: (draft: D, id: string | null) => Promise<ActionResult>
  onDelete: (id: string) => Promise<ActionResult>
  /** Delete is offered only when its consequences can be stated. */
  deleteConfirm?: (row: T) => { title: string; body: string; requireTyping?: string }
  addLabel: string
  emptyMessage: string
}

/**
 * The shared row-editing mechanism for every ledger table.
 *
 * A row commits as a unit rather than per field, because two of the validation
 * rules this app relies on are whole-row: the consent/mobile check constraint
 * and the strict per-category details schemas. Neither can be evaluated from a
 * single field, and a per-field save would attribute the resulting violation to
 * whichever field happened to blur last.
 */
export function EditableSection<T, D>({
  title,
  index,
  description,
  columns,
  rows,
  rowKey,
  rowLabel,
  renderRead,
  renderEdit,
  renderDetails,
  toDraft,
  emptyDraft,
  editable = true,
  onSave,
  onDelete,
  deleteConfirm,
  addLabel,
  emptyMessage,
}: EditableSectionProps<T, D>) {
  const [mode, setMode] = useState<Mode<T>>({ kind: 'idle' })
  const [draft, setDraft] = useState<D | null>(null)
  const [original, setOriginal] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<T | null>(null)
  const [pending, startTransition] = useTransition()
  const editorRef = useRef<HTMLTableRowElement>(null)

  // Focus the first control whenever an editor opens, so a run of records can be
  // entered without reaching for the mouse.
  useEffect(() => {
    if (mode.kind === 'idle') return
    editorRef.current?.querySelector<HTMLElement>('input, select, textarea')?.focus()
  }, [mode])

  const dirty = draft !== null && JSON.stringify(draft) !== original

  function open(next: Mode<T>) {
    // toDraft is only reachable in edit mode, which `editable` gates.
    const seed = next.kind === 'edit' && toDraft ? toDraft(next.row) : emptyDraft()
    setDraft(seed)
    setOriginal(JSON.stringify(seed))
    setErrors({})
    setFormError(null)
    setMode(next)
  }

  function close() {
    setMode({ kind: 'idle' })
    setDraft(null)
    setErrors({})
    setFormError(null)
  }

  function cancel() {
    if (dirty && !window.confirm('Discard the changes to this row?')) return
    close()
  }

  // Every entry point that would replace the open draft — Cancel, Escape,
  // switching to a different row's Edit, or starting a new row — must go
  // through the same guard. Without it, the dirty check only protected the
  // one path that happened to call it.
  function requestOpen(next: Mode<T>) {
    if (dirty && !window.confirm('Discard the changes to this row?')) return
    open(next)
  }

  function set(patch: Partial<D>) {
    setDraft((current) => (current === null ? current : { ...current, ...patch }))
  }

  function save() {
    if (draft === null) return
    const id = mode.kind === 'edit' ? rowKey(mode.row) : null

    startTransition(async () => {
      const result = await onSave(draft, id)

      if (!result.ok) {
        // The editor stays open holding what was typed. Never discard input.
        setErrors(result.fieldErrors ?? {})
        setFormError(result.formError ?? null)
        return
      }

      if (id === null) open({ kind: 'new' }) // keep the run going
      else close()
    })
  }

  function remove(row: T) {
    startTransition(async () => {
      const result = await onDelete(rowKey(row))
      if (!result.ok) {
        // Never discard input: a rejected delete keeps the dialog (and
        // whatever was typed into its confirmation field) in place.
        setFormError(result.formError ?? 'Could not delete.')
        return
      }
      setConfirming(null)
    })
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (
      event.key === 'Enter' &&
      !(event.target instanceof HTMLTextAreaElement) &&
      !(event.target instanceof HTMLSelectElement)
    ) {
      event.preventDefault()
      save()
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      cancel()
    }
  }

  const editing = mode.kind !== 'idle' && draft !== null
  const editingId = mode.kind === 'edit' ? rowKey(mode.row) : null
  const colSpan = columns.length + 1

  return (
    <section className="mt-8">
      <h2 className="font-serif text-[17px] font-semibold text-navy">
        {index !== undefined && <span className="mr-1.5 text-gold">{index}.</span>}
        {title}
      </h2>
      {description && <p className="mt-0.5 text-[12.5px] text-ink-soft">{description}</p>}

      <div className="mt-2 overflow-x-auto rounded border border-line bg-paper-raised">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.04em] text-ink-soft">
              {columns.map((column) => (
                <th key={column.key} style={{ width: column.width }} className="px-2 py-1.5 font-medium">
                  {column.label}
                </th>
              ))}
              <th className="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !editing && (
              <tr>
                <td colSpan={colSpan} className="px-2 py-4 text-center text-ink-soft">
                  {emptyMessage}
                </td>
              </tr>
            )}

            {rows.map((row) => {
              const id = rowKey(row)
              if (id === editingId) return null
              const label = rowLabel ? rowLabel(row) : id

              return (
                <tr key={id} className="border-b border-line last:border-0">
                  {renderRead(row)}
                  <td className="whitespace-nowrap px-2 py-1.5 text-right">
                    {editable && (
                      <button
                        type="button"
                        onClick={() => requestOpen({ kind: 'edit', row })}
                        className="underline hover:text-navy"
                      >
                        Edit {label}
                      </button>
                    )}
                    {/* Delete is offered only where its consequences can be
                        stated — an unexplained destructive action is worse
                        than no action. */}
                    {deleteConfirm && (
                      <button
                        type="button"
                        onClick={() => setConfirming(row)}
                        className="ml-3 underline hover:text-rust"
                      >
                        Delete {label}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}

            {editing && (
              <tr ref={editorRef} onKeyDown={onKeyDown} className="border-b border-line bg-[#fcfbf8]">
                {renderEdit(draft, set, errors)}
                <td className="whitespace-nowrap px-2 py-1.5 text-right">
                  <button type="button" onClick={save} disabled={pending} className="underline">
                    {pending ? 'Saving…' : 'Save'}
                  </button>
                  <button type="button" onClick={cancel} className="ml-3 underline">
                    Cancel
                  </button>
                </td>
              </tr>
            )}

            {editing && renderDetails && (
              // Same key handling as the editor row: the detail fields are part
              // of the same commit unit, so Enter and Escape must work in them.
              <tr onKeyDown={onKeyDown} className="border-b border-line bg-[#fcfbf8]">
                <td colSpan={colSpan} className="px-2 pb-3">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-4">
                    {renderDetails(draft, set, errors)}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {formError && (
        <p role="alert" className="mt-2 text-[12.5px] text-rust">
          {formError}
        </p>
      )}

      {confirming && deleteConfirm && (
        <div className="mt-2">
          <ConfirmDelete
            {...deleteConfirm(confirming)}
            onConfirm={() => remove(confirming)}
            onCancel={() => setConfirming(null)}
          />
        </div>
      )}

      <button
        type="button"
        onClick={() => requestOpen({ kind: 'new' })}
        className="mt-2 text-[12.5px] text-navy underline"
      >
        + {addLabel}
      </button>
    </section>
  )
}
