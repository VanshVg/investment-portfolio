'use client'

import { useState, useTransition } from 'react'
import type { ActionResult } from '@/lib/actions/result'
import { MIN_PASSWORD_LENGTH } from '@/lib/validation/account'
import { FieldError, fieldErrorProps } from '@/components/ledger/FieldError'
import {
  buttonClass,
  CARD,
  FIELD_LABEL,
  inputClass,
  SECTION_LEAD,
  SECTION_TITLE,
} from '@/components/ui/styles'

type Field = 'currentPassword' | 'newPassword' | 'confirmPassword'

const FIELDS: { id: Field; label: string; autoComplete: string }[] = [
  { id: 'currentPassword', label: 'Current password', autoComplete: 'current-password' },
  { id: 'newPassword', label: 'New password', autoComplete: 'new-password' },
  { id: 'confirmPassword', label: 'Confirm new password', autoComplete: 'new-password' },
]

const EMPTY: Record<Field, string> = { currentPassword: '', newPassword: '', confirmPassword: '' }

/**
 * The signed-in advisor's own password. The current one is asked for first,
 * so a browser left signed in is not enough to change it. There is no
 * emailed reset: a forgotten password is set again from the Supabase
 * dashboard (Authentication → Users).
 */
export function PasswordForm({
  changePassword,
}: {
  changePassword: (input: unknown) => Promise<ActionResult>
}) {
  const [values, setValues] = useState(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [changed, setChanged] = useState(false)
  const [pending, startTransition] = useTransition()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setChanged(false)
    startTransition(async () => {
      const result = await changePassword(values)
      if (!result.ok) {
        // What was typed stays, so a single mistake is not three retypes.
        setErrors(result.fieldErrors ?? {})
        setFormError(result.formError ?? null)
        return
      }
      setValues(EMPTY)
      setErrors({})
      setFormError(null)
      setChanged(true)
    })
  }

  return (
    <section className={`mt-10 ${CARD} px-5 py-4`}>
      <h2 className={SECTION_TITLE}>Your password</h2>
      <p className={SECTION_LEAD}>
        Enter your current password, then the new one twice. At least {MIN_PASSWORD_LENGTH}{' '}
        characters.
      </p>
      <form onSubmit={submit} noValidate className="mt-3 flex max-w-sm flex-col gap-3">
        {FIELDS.map((field) => (
          <div key={field.id} className="flex flex-col gap-1">
            <label htmlFor={field.id} className={FIELD_LABEL}>
              {field.label}
            </label>
            <input
              id={field.id}
              type="password"
              autoComplete={field.autoComplete}
              value={values[field.id]}
              onChange={(event) => {
                setValues((current) => ({ ...current, [field.id]: event.target.value }))
                setChanged(false)
              }}
              className={inputClass('md')}
              {...fieldErrorProps(field.id, errors[field.id])}
            />
            <FieldError id={field.id} message={errors[field.id]} />
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={pending} className={buttonClass('primary', 'md')}>
            {pending ? 'Changing…' : 'Change password'}
          </button>
          {changed && (
            <span role="status" className="text-[12px] text-teal">
              Password changed.
            </span>
          )}
        </div>
      </form>
      {formError && (
        <p role="alert" className="mt-2 text-[12.5px] text-rust">
          {formError}
        </p>
      )}
    </section>
  )
}
