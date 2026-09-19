'use client'

import { useState, useTransition } from 'react'
import type { ActionResult } from '@/lib/actions/result'
import { FieldError, fieldErrorProps } from '@/components/ledger/FieldError'

/**
 * The advisor's own WhatsApp number. `reminderRecipients` routes every
 * reminder to it — both parties for a holding managed here, the advisor
 * alone (as the cross-sell trigger) for one managed elsewhere — so a blank
 * value here leaves externally managed reminders with no recipient at all.
 */
export function AdvisorMobileForm({
  mobile,
  updateAdvisorMobile,
}: {
  mobile: string | null
  updateAdvisorMobile: (input: unknown) => Promise<ActionResult>
}) {
  const [value, setValue] = useState(mobile ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setSaved(false)
    startTransition(async () => {
      const result = await updateAdvisorMobile({ mobile: value })
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        setFormError(result.formError ?? null)
        return
      }
      setErrors({})
      setFormError(null)
      setSaved(true)
    })
  }

  return (
    <section className="rounded border border-line bg-paper-raised p-4">
      <h2 className="font-serif text-[17px] font-semibold text-navy">Your mobile number</h2>
      <p className="mt-0.5 text-[12.5px] text-ink-soft">
        Every reminder is sent here too — including the cross-sell reminders for policies managed
        elsewhere, which the client never sees.
      </p>
      <form onSubmit={submit} noValidate className="mt-2 flex flex-wrap items-center gap-2">
        <label htmlFor="mobile" className="sr-only">
          Your mobile number
        </label>
        <input
          id="mobile"
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            setSaved(false)
          }}
          placeholder="98765 43210"
          className="w-48 rounded border border-line-strong bg-white px-2 py-1.5 font-mono text-[13px]"
          {...fieldErrorProps('mobile', errors.mobile)}
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-navy px-3 py-1.5 text-[12.5px] text-white disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        {saved && <span className="text-[12px] text-teal">Saved.</span>}
      </form>
      <FieldError id="mobile" message={errors.mobile} />
      {formError && (
        <p role="alert" className="mt-2 text-[12.5px] text-rust">
          {formError}
        </p>
      )}
    </section>
  )
}
