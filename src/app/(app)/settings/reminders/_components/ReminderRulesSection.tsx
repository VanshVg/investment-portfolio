'use client'

import { useState, useTransition } from 'react'
import type { ActionResult } from '@/lib/actions/result'
import { FieldError, fieldErrorProps } from '@/components/ledger/FieldError'

const CATEGORY_LABELS: Record<string, string> = {
  life_insurance: 'Life insurance',
  general_insurance: 'General insurance',
  mutual_fund: 'Mutual fund',
  fixed_income: 'Fixed income',
}

export interface ReminderRuleRow {
  id: string
  category: string
  daysBefore: number[]
  isActive: boolean
}

function Row({
  rule,
  updateReminderRule,
}: {
  rule: ReminderRuleRow
  updateReminderRule: (id: string, input: unknown) => Promise<ActionResult>
}) {
  const [daysBefore, setDaysBefore] = useState(rule.daysBefore.join(', '))
  const [isActive, setIsActive] = useState(rule.isActive)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setSaved(false)
    startTransition(async () => {
      const result = await updateReminderRule(rule.id, { daysBefore, isActive })
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

  const daysId = `${rule.id}-daysBefore`
  const activeId = `${rule.id}-isActive`

  return (
    <tr className="border-b border-line last:border-0 align-top">
      <td className="whitespace-nowrap px-2 py-2 font-medium">
        {CATEGORY_LABELS[rule.category] ?? rule.category}
      </td>
      <td className="px-2 py-2">
        <form onSubmit={submit} noValidate className="flex flex-wrap items-center gap-2">
          <label htmlFor={daysId} className="sr-only">
            Days before due date, comma-separated
          </label>
          <input
            id={daysId}
            value={daysBefore}
            onChange={(event) => {
              setDaysBefore(event.target.value)
              setSaved(false)
            }}
            placeholder="30, 15"
            className="w-36 rounded border border-line-strong bg-white px-2 py-1 font-mono text-[12.5px]"
            {...fieldErrorProps(daysId, errors.daysBefore)}
          />
          <label htmlFor={activeId} className="flex items-center gap-1.5 text-[12px] text-ink-soft">
            <input
              id={activeId}
              type="checkbox"
              checked={isActive}
              onChange={(event) => {
                setIsActive(event.target.checked)
                setSaved(false)
              }}
            />
            Active
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-navy px-2.5 py-1 text-[12px] text-white disabled:opacity-60"
          >
            {pending ? 'Saving…' : 'Save'}
          </button>
          {saved && <span className="text-[12px] text-teal">Saved.</span>}
          <FieldError id={daysId} message={errors.daysBefore} />
          {formError && (
            <span role="alert" className="text-[12px] text-rust">
              {formError}
            </span>
          )}
        </form>
      </td>
    </tr>
  )
}

/**
 * A plain per-row form rather than `EditableSection`: these four rows are
 * fixed (no add, no delete — a category rule is seeded once and lives for
 * the life of the app) and each is already fully editable, so there is no
 * idle/read state worth switching out of. `EditableSection`'s add/edit/
 * delete row lifecycle would add clicks this page has no use for.
 */
export function ReminderRulesSection({
  rules,
  updateReminderRule,
}: {
  rules: ReminderRuleRow[]
  updateReminderRule: (id: string, input: unknown) => Promise<ActionResult>
}) {
  return (
    <section className="mt-8">
      <h2 className="font-serif text-[17px] font-semibold text-navy">Reminder windows</h2>
      <p className="mt-0.5 text-[12.5px] text-ink-soft">
        Days before the due date each category&apos;s reminders fire, widest first. 0 means
        &quot;remind on the due date itself.&quot;
      </p>
      <div className="mt-2 overflow-x-auto rounded border border-line bg-paper-raised">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.04em] text-ink-soft">
              <th className="px-2 py-1.5 font-medium">Category</th>
              <th className="px-2 py-1.5 font-medium">Reminder windows (days before)</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <Row key={rule.id} rule={rule} updateReminderRule={updateReminderRule} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
