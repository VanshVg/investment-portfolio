'use client'

import { useState, useTransition } from 'react'
import type { ActionResult } from '@/lib/actions/result'
import { FieldError, fieldErrorProps } from '@/components/ledger/FieldError'
import {
  buttonClass,
  CARD,
  FIELD_LABEL,
  inputClass,
  SECTION_LEAD,
  SECTION_TITLE,
} from '@/components/ui/styles'

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
    <section className={`${CARD} px-5 py-4`}>
      <h2 className={SECTION_TITLE}>Your mobile number</h2>
      <p className={SECTION_LEAD}>
        Every reminder is sent here too — including the cross-sell reminders for policies managed
        elsewhere, which the client never sees.
      </p>
      <form onSubmit={submit} noValidate className="mt-3 flex flex-col gap-1">
        <label htmlFor="mobile" className={FIELD_LABEL}>
          Your mobile number
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="mobile"
            value={value}
            onChange={(event) => {
              setValue(event.target.value)
              setSaved(false)
            }}
            placeholder="98765 43210"
            className={`${inputClass('md', 'w-56')} font-mono`}
            {...fieldErrorProps('mobile', errors.mobile)}
          />
          <button type="submit" disabled={pending} className={buttonClass('primary', 'md')}>
            {pending ? 'Saving…' : 'Save'}
          </button>
          {saved && (
            <span role="status" className="text-[12px] text-teal">
              Saved.
            </span>
          )}
        </div>
        <FieldError id="mobile" message={errors.mobile} />
        {!value.trim() && !errors.mobile && (
          <p className="text-[12px] text-gold">
            Not set yet — reminders for policies managed elsewhere have no one to go to until it is.
          </p>
        )}
      </form>
      {formError && (
        <p role="alert" className="mt-2 text-[12.5px] text-rust">
          {formError}
        </p>
      )}
    </section>
  )
}
