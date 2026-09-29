'use client'

import { useState } from 'react'
import { describeDMYProblem, formatDMY, parseDMY, toISODate } from '@/lib/domain/dates'
import { DateInput } from '@/components/ui/DateInput'
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
  // What is wrong with the typed text, in words, or null when nothing is.
  const [problem, setProblem] = useState<string | null>(null)
  // Tracks the value this text was last synced from, so an external change
  // (e.g. picking a different row to edit) can be caught during render rather
  // than in an effect — React's own pattern for resetting derived
  // state, and it sidesteps the lint rule against setState-in-effect.
  const [syncedValue, setSyncedValue] = useState(value)

  if (value !== syncedValue) {
    setSyncedValue(value)
    setText(value ? formatDMY(value) : '')
    setProblem(null)
  }

  function commit() {
    const trimmed = text.trim()
    if (trimmed === '') {
      setProblem(null)
      onChange(null)
      return
    }
    const typedProblem = describeDMYProblem(trimmed)
    const parsed = parseDMY(trimmed)
    if (typedProblem || !parsed) {
      // Surface it rather than dropping what was typed, and say which rule
      // it broke: "Use DD-MM-YYYY" is the wrong thing to tell someone who
      // typed 31-02-2027 in exactly that format.
      setProblem(typedProblem ?? 'Use DD-MM-YYYY.')
      return
    }
    setProblem(null)
    onChange(toISODate(parsed))
  }

  return (
    <Field id={id} label={label} error={error} className={className}>
      <DateInput
        id={id}
        text={text}
        onTextChange={setText}
        onBlur={commit}
        // A picked day is always valid, so it commits straight away rather
        // than waiting for the blur a typed date needs.
        onPick={(iso) => {
          setProblem(null)
          onChange(iso)
        }}
        inputProps={{ ...fieldErrorProps(id, error), 'aria-invalid': error ? true : problem !== null }}
      />
      {/* A server error takes the Field's own error slot; this covers only
          what was typed but never parsed, which the server never sees. */}
      {!error && problem && (
        <span role="alert" className="text-[11px] text-rust">
          {problem}
        </span>
      )}
    </Field>
  )
}
