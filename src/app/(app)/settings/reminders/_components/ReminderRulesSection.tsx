'use client'

import { useState, useTransition } from 'react'
import type { ActionResult } from '@/lib/actions/result'
import { FieldError, fieldErrorProps } from '@/components/ledger/FieldError'
import {
  buttonClass,
  inputClass,
  SECTION_LEAD,
  SECTION_TITLE,
  TABLE,
  TABLE_HEAD_ROW,
  TABLE_WRAP,
  TD,
  TH,
} from '@/components/ui/styles'

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
    <tr className="border-b border-line align-middle last:border-0">
      <td className={`${TD} w-[1%] whitespace-nowrap font-medium`}>
        {CATEGORY_LABELS[rule.category] ?? rule.category}
      </td>
      <td className={TD}>
        <form onSubmit={submit} noValidate className="flex flex-wrap items-center gap-x-4 gap-y-2">
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
            className={`${inputClass('sm', 'w-40')} font-mono`}
            {...fieldErrorProps(daysId, errors.daysBefore)}
          />
          <label htmlFor={activeId} className="flex items-center gap-2 text-[12.5px] text-ink">
            <input
              id={activeId}
              type="checkbox"
              checked={isActive}
              onChange={(event) => {
                setIsActive(event.target.checked)
                setSaved(false)
              }}
              className="h-4 w-4"
            />
            Active
          </label>
          <button type="submit" disabled={pending} className={buttonClass('secondary', 'sm')}>
            {pending ? 'Saving…' : 'Save'}
          </button>
          {saved && (
            <span role="status" className="text-[12px] text-teal">
              Saved.
            </span>
          )}
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
    <section className="mt-10">
      <h2 className={SECTION_TITLE}>Reminder windows</h2>
      <p className={SECTION_LEAD}>
        How many days before the due date each category&apos;s reminders fire, separated by
        commas — for example <span className="font-mono">30, 15</span>. 0 means &quot;on the due
        date itself.&quot;
      </p>
      <div className={`mt-3 ${TABLE_WRAP}`}>
        <table className={TABLE}>
          <thead>
            <tr className={TABLE_HEAD_ROW}>
              <th className={TH}>Category</th>
              <th className={TH}>Days before due date</th>
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
