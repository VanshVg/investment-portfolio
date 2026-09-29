'use client'

import { useState } from 'react'
import { formatDMY, parseDMY, toISODate } from '@/lib/domain/dates'
import { inputClass } from '@/components/ui/styles'
import { Field } from './Field'
import { fieldErrorProps } from './FieldError'

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
  className,
}: {
  id: string
  label: string
  value: string | null
  onChange: (value: string | null) => void
  error?: string
  className?: string
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
    <Field id={id} label={label} error={error} className={className}>
      <input
        id={id}
        value={text}
        placeholder="DD-MM-YYYY"
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        className={`${inputClass()} font-mono`}
        {...fieldErrorProps(id, error)}
        aria-invalid={error ? true : invalid}
      />
      {/* A server error takes the Field's own error slot; this covers only
          what was typed but never parsed, which the server never sees. */}
      {!error && invalid && (
        <span role="alert" className="text-[11px] text-rust">
          Use DD-MM-YYYY.
        </span>
      )}
    </Field>
  )
}
