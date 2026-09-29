'use client'

import { inputClass } from '@/components/ui/styles'
import { Field } from './Field'
import { fieldErrorProps } from './FieldError'

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
  required,
  className,
}: {
  id: string
  label: string
  value: number | null
  onChange: (value: number | null) => void
  error?: string
  required?: boolean
  className?: string
}) {
  return (
    <Field id={id} label={label} error={error} required={required} className={className}>
      <div className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-[13px] text-ink-soft"
        >
          ₹
        </span>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          aria-required={required || undefined}
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
          className={`${inputClass()} pl-6 font-mono`}
          {...fieldErrorProps(id, error)}
        />
      </div>
    </Field>
  )
}
