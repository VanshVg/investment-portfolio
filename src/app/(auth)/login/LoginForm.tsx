'use client'

import { useActionState, useState } from 'react'
import { buttonClass, FIELD_LABEL, inputClass } from '@/components/ui/styles'
import { PasswordToggle } from '@/components/ui/PasswordToggle'
import { login } from './actions'

const FIELD_CLASS = inputClass('lg')
const LABEL_CLASS = FIELD_LABEL

export function LoginForm() {
  const [error, formAction, pending] = useActionState(login, null)
  const [passwordVisible, setPasswordVisible] = useState(false)
  // Controlled, so it survives a failed attempt. React resets an action
  // form's uncontrolled fields once the action finishes, which wiped the
  // address along with the password and made the advisor type both again.
  // The password is left uncontrolled on purpose: clearing it after a
  // rejected attempt is the expected behaviour.
  const [email, setEmail] = useState('')

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className={LABEL_CLASS}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={FIELD_CLASS}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className={LABEL_CLASS}>
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={passwordVisible ? 'text' : 'password'}
            required
            autoComplete="current-password"
            className={`${FIELD_CLASS} pr-10`}
          />
          <PasswordToggle
            visible={passwordVisible}
            onToggle={() => setPasswordVisible((visible) => !visible)}
            controls="password"
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="text-[12.5px] text-rust">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className={`mt-2 ${buttonClass('primary', 'lg')}`}
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
