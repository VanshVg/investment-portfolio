'use client'

import { CheckboxField, Field } from '@/components/ledger/Field'
import { inputClass } from '@/components/ui/styles'
import type { ManagedBy } from '@/lib/queries/families'

/**
 * The two controls every holding section carries, defined once. They were
 * byte-identical across four files, and the reminders toggle was already
 * missed from one section once (follow-up T4) — one definition is what
 * stops a fifth copy drifting from the other four.
 */
export function ManagedBySelect({
  id,
  value,
  onChange,
}: {
  id: string
  value: ManagedBy
  onChange: (value: ManagedBy) => void
}) {
  return (
    <Field id={id} label="Managed by">
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as ManagedBy)}
        className={inputClass()}
      >
        <option value="self">With us</option>
        <option value="external">External</option>
      </select>
    </Field>
  )
}

export function RemindersToggle({
  id,
  checked,
  onChange,
}: {
  id: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return <CheckboxField id={id} label="Send reminders" checked={checked} onChange={onChange} />
}

/** Read-mode table cell padding, shared by every holding section. */
export const CELL = 'px-3 py-2.5'
