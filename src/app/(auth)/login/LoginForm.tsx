'use client'

import { useActionState } from 'react'
import { login } from './actions'

export function LoginForm() {
  const [error, formAction, pending] = useActionState(login, null)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] uppercase tracking-[0.05em] text-ink-soft">Email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="username"
          className="rounded border border-line-strong bg-[#fcfbf8] px-2.5 py-2 text-sm focus:border-navy focus:outline-2 focus:outline-navy"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] uppercase tracking-[0.05em] text-ink-soft">Password</span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="rounded border border-line-strong bg-[#fcfbf8] px-2.5 py-2 text-sm focus:border-navy focus:outline-2 focus:outline-navy"
        />
      </label>

      {error && (
        <p role="alert" className="text-[12.5px] text-rust">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded bg-navy px-4 py-2.5 text-sm font-medium text-white hover:bg-navy-deep disabled:opacity-60"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
