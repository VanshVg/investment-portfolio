'use client'

import { inputClass } from '@/components/ui/styles'
import type { Member } from '@/lib/queries/families'
import { Field } from './Field'
import { fieldErrorProps } from './FieldError'

/**
 * Member is optional on a holding: a family floater covers the household rather
 * than one person, which is why member_id is nullable in the schema.
 */
export function MemberSelect({
  id,
  label,
  members,
  value,
  onChange,
  error,
  className,
}: {
  id: string
  label: string
  members: Member[]
  value: string | null
  onChange: (value: string | null) => void
  error?: string
  className?: string
}) {
  return (
    <Field id={id} label={label} error={error} className={className}>
      <select
        id={id}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
        className={inputClass()}
        {...fieldErrorProps(id, error)}
      >
        <option value="">Whole family</option>
        {members.map((member) => (
          <option key={member.id} value={member.id}>
            {member.name}
          </option>
        ))}
      </select>
    </Field>
  )
}
