'use client'

import { useId, useState } from 'react'
import { buttonClass, FIELD_LABEL, inputClass } from '@/components/ui/styles'

/**
 * Consequences are stated before the fact, and the destructive cases require the
 * name to be typed. A checkbox is too easy to click past for an action that
 * cascades through a household's entire record.
 */
export function ConfirmDelete({
  title,
  body,
  requireTyping,
  error,
  pending,
  onConfirm,
  onCancel,
}: {
  title: string
  body: string
  requireTyping?: string
  /** A rejected delete, shown inside the dialog it belongs to. */
  error?: string | null
  pending?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const [typed, setTyped] = useState('')
  const armed = !requireTyping || typed.trim() === requireTyping
  const nameId = useId()

  return (
    <div
      role="dialog"
      aria-label={title}
      className="rounded border border-rust/50 border-l-4 border-l-rust bg-rust-bg px-4 py-3.5"
    >
      <p className="text-[13.5px] font-semibold text-rust">{title}</p>
      <p className="mt-1 max-w-[70ch] text-[12.5px] leading-relaxed text-ink">{body}</p>

      {requireTyping && (
        <div className="mt-3 flex max-w-sm flex-col gap-1">
          <label htmlFor={nameId} className={FIELD_LABEL}>
            Type <strong className="normal-case tracking-normal text-ink">{requireTyping}</strong> to
            confirm
          </label>
          <input
            id={nameId}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            className={inputClass('sm')}
          />
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-[12.5px] text-rust">
          {error}
        </p>
      )}

      <div className="mt-3.5 flex gap-2">
        <button
          type="button"
          disabled={!armed || pending}
          onClick={onConfirm}
          className={buttonClass('danger', 'sm')}
        >
          {pending ? 'Deleting…' : 'Delete'}
        </button>
        <button type="button" onClick={onCancel} className={buttonClass('secondary', 'sm')}>
          Cancel
        </button>
      </div>
    </div>
  )
}
