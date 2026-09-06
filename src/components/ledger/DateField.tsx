'use client'

import { useState } from 'react'
import { formatDMY, parseDMY, toISODate } from '@/lib/domain/dates'
import { FieldError, fieldErrorProps } from './FieldError'

/**
 * Indian convention is DD-MM-YYYY; storage is always ISO. A native date input
 * renders in the browser's locale, which is not reliably Indian, so the
 * conversion is explicit here.
 */
export function DateField({
  id,
  label,
  value,
  onChange,
  error,
}: {
  id: string
  label: string
  value: string | null
  onChange: (value: string | null) => void
  error?: string
}) {
  const [text, setText] = useState(() => (value ? formatDMY(value) : ''))
  const [invalid, setInvalid] = useState(false)
  // Tracks the value this text was last synced from, so an external change
  // (e.g. picking a different row to edit) can be caught during render rather
  // than in an effect — React's own pattern for resetting derived
  // state, and it sidesteps the lint rule against setState-in-effect.
  const [syncedValue, setSyncedValue] = useState(value)

  if (value !== syncedValue) {
    setSyncedValue(value)
    setText(value ? formatDMY(value) : '')
    setInvalid(false)
  }

  function commit() {
    const trimmed = text.trim()
    if (trimmed === '') {
      setInvalid(false)
      onChange(null)
      return
    }
    const parsed = parseDMY(trimmed)
    if (!parsed) {
      // Surface it rather than dropping what was typed.
      setInvalid(true)
      return
    }
    setInvalid(false)
    onChange(toISODate(parsed))
  }

  return (
    <>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        value={text}
        placeholder="DD-MM-YYYY"
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        className="w-full rounded border border-line-strong bg-white px-1.5 py-1 font-mono text-[12.5px]"
        {...fieldErrorProps(id, error)}
        aria-invalid={error ? true : invalid}
      />
      {error ? (
        <FieldError id={id} message={error} />
      ) : (
        invalid && (
          <span role="alert" className="text-[11px] text-rust">
            Use DD-MM-YYYY.
          </span>
        )
      )}
    </>
  )
}
