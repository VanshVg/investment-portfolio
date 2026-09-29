'use client'

import { useActionState, useState } from 'react'
import { buttonClass, FIELD_LABEL, inputClass } from '@/components/ui/styles'
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
        {/* The toggle sits beside the input rather than inside the label: a label
            must not wrap another control, and clicking it would focus the field. */}
        <div className="relative">
          <input
            id="password"
            name="password"
            type={passwordVisible ? 'text' : 'password'}
            required
            autoComplete="current-password"
            className={`${FIELD_CLASS} pr-10`}
          />
          <button
            type="button"
            onClick={() => setPasswordVisible((visible) => !visible)}
            aria-label={passwordVisible ? 'Hide password' : 'Show password'}
            aria-pressed={passwordVisible}
            aria-controls="password"
            className="absolute inset-y-0 right-0 flex items-center px-2.5 text-ink-soft hover:text-navy focus-visible:outline-2 focus-visible:outline-navy"
          >
            {passwordVisible ? <EyeOffIcon /> : <EyeIcon />}
          </button>
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

const ICON_PROPS = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

function EyeIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M10.7 5.1A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a18.5 18.5 0 0 1-2.9 3.9M6.5 6.6A18.4 18.4 0 0 0 2 12s3.6 7 10 7a10.5 10.5 0 0 0 4.4-.9" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m3 3 18 18" />
    </svg>
  )
}
