'use client'

import type { Member } from '@/lib/queries/families'
import { FieldError, fieldErrorProps } from './FieldError'

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
}: {
  id: string
  label: string
  members: Member[]
  value: string | null
  onChange: (value: string | null) => void
  error?: string
}) {
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
        className="w-full rounded border border-line-strong bg-white px-1.5 py-1 text-[12.5px]"
        {...fieldErrorProps(id, error)}
      >
        <option value="">Whole family</option>
        {members.map((member) => (
          <option key={member.id} value={member.id}>
            {member.name}
          </option>
        ))}
      </select>
      <FieldError id={id} message={error} />
    </>
  )
}
