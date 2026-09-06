'use client'

import { FieldError, fieldErrorProps } from './FieldError'

/**
 * Plain numeric entry. Formatting to lakh/crore happens in read mode via
 * formatINR — grouping digits while they are being typed fights the typist.
 */
export function MoneyInput({
  id,
  label,
  value,
  onChange,
  error,
}: {
  id: string
  label: string
  value: number | null
  onChange: (value: number | null) => void
  error?: string
}) {
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
        className="w-full rounded border border-line-strong bg-white px-1.5 py-1 text-right font-mono text-[12.5px]"
        {...fieldErrorProps(id, error)}
      />
      <FieldError id={id} message={error} />
    </>
  )
}
