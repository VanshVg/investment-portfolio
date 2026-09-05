'use client'

import { useState, useTransition } from 'react'
import type { Family } from '@/lib/queries/families'
import type { ActionResult } from '@/lib/actions/result'
import { FieldError, fieldErrorProps } from '@/components/ledger/FieldError'

const FIELD = 'w-full rounded border border-line-strong bg-white px-2 py-1.5 text-[13px]'
const LABEL = 'text-[11px] uppercase tracking-[0.05em] text-ink-soft'

/**
 * A plain form rather than an EditableSection: a household is one record with no
 * row semantics. It still commits as a single unit, so the whole-row validation
 * story is unchanged.
 */
export function FamilyHeader({
  family,
  updateFamily,
}: {
  family: Family
  updateFamily: (id: string, input: unknown) => Promise<ActionResult>
}) {
  const [draft, setDraft] = useState({
    name: family.name,
    headName: family.headName ?? '',
    headMobile: family.headMobile ?? '',
    notes: family.notes ?? '',
    goalHorizonYears: family.goalHorizonYears,
    assumedCagr: family.assumedCagr,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  function set(patch: Partial<typeof draft>) {
    setDraft((current) => ({ ...current, ...patch }))
    setSaved(false)
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await updateFamily(family.id, draft)
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        setFormError(result.formError ?? null)
        setSaved(false)
        return
      }
      setErrors({})
      setFormError(null)
      setSaved(true)
    })
  }

  return (
    <form
      onSubmit={submit}
      // Validation is server-side (via updateFamily/zod) and surfaced through
      // FieldError; the browser's own min/max constraint validation must not
      // silently swallow the submit event before our handler runs.
      noValidate
      className="rounded border border-line bg-paper-raised p-4"
    >
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label htmlFor="name" className={LABEL}>
            Family name
          </label>
          <input
            id="name"
            value={draft.name}
            onChange={(event) => set({ name: event.target.value })}
            className={FIELD}
            {...fieldErrorProps('name', errors.name)}
          />
          <FieldError id="name" message={errors.name} />
        </div>
        <div>
          <label htmlFor="headName" className={LABEL}>
            Head of family
          </label>
          <input
            id="headName"
            value={draft.headName}
            onChange={(event) => set({ headName: event.target.value })}
            className={FIELD}
          />
        </div>
        <div>
          <label htmlFor="headMobile" className={LABEL}>
            Mobile
          </label>
          <input
            id="headMobile"
            value={draft.headMobile}
            onChange={(event) => set({ headMobile: event.target.value })}
            placeholder="98765 43210"
            className={`${FIELD} font-mono`}
            {...fieldErrorProps('headMobile', errors.headMobile)}
          />
          <FieldError id="headMobile" message={errors.headMobile} />
        </div>
        <div>
          <label htmlFor="goalHorizonYears" className={LABEL}>
            Goal horizon (years)
          </label>
          <input
            id="goalHorizonYears"
            type="number"
            min={1}
            max={40}
            value={draft.goalHorizonYears}
            onChange={(event) => set({ goalHorizonYears: Number(event.target.value) })}
            className={`${FIELD} font-mono`}
            {...fieldErrorProps('goalHorizonYears', errors.goalHorizonYears)}
          />
          <FieldError id="goalHorizonYears" message={errors.goalHorizonYears} />
        </div>
        <div>
          <label htmlFor="assumedCagr" className={LABEL}>
            Assumed CAGR (%)
          </label>
          <input
            id="assumedCagr"
            type="number"
            min={0}
            max={30}
            step="0.1"
            value={draft.assumedCagr}
            onChange={(event) => set({ assumedCagr: Number(event.target.value) })}
            className={`${FIELD} font-mono`}
            {...fieldErrorProps('assumedCagr', errors.assumedCagr)}
          />
          <FieldError id="assumedCagr" message={errors.assumedCagr} />
        </div>
        <div>
          <label htmlFor="notes" className={LABEL}>
            Notes
          </label>
          <input
            id="notes"
            value={draft.notes}
            onChange={(event) => set({ notes: event.target.value })}
            className={FIELD}
          />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-navy px-3 py-1.5 text-[12.5px] text-white disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save details'}
        </button>
        {saved && <span className="text-[12px] text-teal">Saved.</span>}
        {formError && (
          <span role="alert" className="text-[12px] text-rust">
            {formError}
          </span>
        )}
      </div>
    </form>
  )
}
