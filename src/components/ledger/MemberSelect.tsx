'use client'

import type { Member } from '@/lib/queries/families'
import { FieldError, fieldErrorProps } from './FieldError'

/**
 * Member is optional on a holding: a family floater covers the household rather
 * than one person, which is why member_id is nullable in the schema.
 *
 * `hideLabel` is the one place that decides sr-only vs visible for this
 * control, so a section that wants to show member attribution (general
 * insurance) does not need — and must not add — a second `<label>` of its own.
 */
export function MemberSelect({
  id,
  label,
  members,
  value,
  onChange,
  error,
  hideLabel = true,
}: {
  id: string
  label: string
  members: Member[]
  value: string | null
  onChange: (value: string | null) => void
  error?: string
  hideLabel?: boolean
}) {
  return (
    <>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'text-[11px] text-ink-soft'}>
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
