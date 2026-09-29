'use client'

import { inputClass } from '@/components/ui/styles'
import type { Member } from '@/lib/queries/families'
import { Field } from './Field'
import { fieldErrorProps } from './FieldError'

/**
 * The name to show for a holding's member: "Whole family" when there is none,
 * and "(removed)" after a member who has been soft-deleted (decision D2) but
 * still owns the holding.
 */
export function memberName(members: Member[], id: string | null): string {
  const member = members.find((m) => m.id === id)
  if (!member) return 'Whole family'
  return member.removed ? `${member.name} (removed)` : member.name
}

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
        {/* Current members, plus the one already on this holding if they have
            been removed — otherwise the select would silently show "Whole
            family" for them and the next save would change the attribution. */}
        {members
          .filter((member) => !member.removed || member.id === value)
          .map((member) => (
            <option key={member.id} value={member.id}>
              {memberName(members, member.id)}
            </option>
          ))}
      </select>
    </Field>
  )
}
