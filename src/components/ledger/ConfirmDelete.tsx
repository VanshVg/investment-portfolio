'use client'

import { useId, useState } from 'react'

/**
 * Consequences are stated before the fact, and the destructive cases require the
 * name to be typed. A checkbox is too easy to click past for an action that
 * cascades through a household's entire record.
 */
export function ConfirmDelete({
  title,
  body,
  requireTyping,
  onConfirm,
  onCancel,
}: {
  title: string
  body: string
  requireTyping?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const [typed, setTyped] = useState('')
  const armed = !requireTyping || typed.trim() === requireTyping
  const nameId = useId()

  return (
    <div role="dialog" aria-label={title} className="rounded border border-rust bg-rust-bg p-3">
      <p className="font-medium text-rust">{title}</p>
      <p className="mt-1 text-[12.5px] text-ink">{body}</p>

      {requireTyping && (
        <div className="mt-2">
          <label htmlFor={nameId} className="text-[11px] text-ink-soft">
            Type <strong>{requireTyping}</strong> to confirm
          </label>
          <input
            id={nameId}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            className="mt-1 w-full rounded border border-line-strong bg-white px-2 py-1 text-[12.5px]"
          />
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={!armed}
          onClick={onConfirm}
          className="rounded bg-rust px-3 py-1.5 text-[12.5px] text-white disabled:opacity-50"
        >
          Delete
        </button>
        <button type="button" onClick={onCancel} className="rounded px-3 py-1.5 text-[12.5px] underline">
          Cancel
        </button>
      </div>
    </div>
  )
}
