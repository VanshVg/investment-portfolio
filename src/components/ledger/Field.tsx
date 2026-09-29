'use client'

import { FIELD_LABEL, inputClass } from '@/components/ui/styles'
import { FieldError, fieldErrorProps } from './FieldError'

/**
 * One labelled field: the visible label above, the control, then its error.
 *
 * Editors used to squeeze controls into table cells with the labels hidden
 * for screen readers only, so a sighted advisor saw a row of unlabelled boxes
 * cut to the column's width. Every editor now lays its fields out as a grid
 * of these instead, each with its label on show.
 *
 * `className` is for grid placement only (`md:col-span-2` for a long name).
 */
export function Field({
  id,
  label,
  error,
  className = '',
  children,
}: {
  id: string
  label: string
  error?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <label htmlFor={id} className={FIELD_LABEL}>
        {label}
      </label>
      {children}
      <FieldError id={id} message={error} />
    </div>
  )
}

/**
 * A checkbox laid out to sit level with the text inputs in the same grid row,
 * rather than floating at the top of its cell.
 */
export function CheckboxField({
  id,
  label,
  checked,
  onChange,
  disabled,
  error,
  hint,
}: {
  id: string
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  error?: string
  /** Why the box is disabled, shown beside it rather than left as a mystery. */
  hint?: string
}) {
  return (
    <div className="flex min-w-0 flex-col justify-end gap-1">
      <label
        htmlFor={id}
        className={`flex h-9 items-center gap-2 text-[13px] ${disabled ? 'text-ink-soft' : 'text-ink'}`}
      >
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="h-4 w-4"
          {...fieldErrorProps(id, error)}
        />
        {label}
      </label>
      {hint && <span className="text-[11px] text-ink-soft">{hint}</span>}
      <FieldError id={id} message={error} />
    </div>
  )
}

/** A labelled text input — the most common field, spelled out once. */
export function TextField({
  id,
  label,
  value,
  onChange,
  error,
  placeholder,
  mono,
  className,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  placeholder?: string
  /** For numbers read digit by digit: mobiles, policy and folio numbers. */
  mono?: boolean
  className?: string
}) {
  return (
    <Field id={id} label={label} error={error} className={className}>
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={`${inputClass()} ${mono ? 'font-mono' : ''}`}
        {...fieldErrorProps(id, error)}
      />
    </Field>
  )
}

/**
 * A labelled number input whose empty state is `undefined`, the shape the
 * optional numeric fields in a holding's details expect.
 */
export function NumberField({
  id,
  label,
  value,
  onChange,
  error,
  min,
  step,
  className,
}: {
  id: string
  label: string
  value: string | number
  onChange: (value: number | undefined) => void
  error?: string
  min?: number
  step?: string
  className?: string
}) {
  return (
    <Field id={id} label={label} error={error} className={className}>
      <input
        id={id}
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(event) =>
          onChange(event.target.value === '' ? undefined : Number(event.target.value))
        }
        className={`${inputClass()} font-mono`}
        {...fieldErrorProps(id, error)}
      />
    </Field>
  )
}
