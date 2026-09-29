'use client'

import { useState, useTransition } from 'react'
import type { Family } from '@/lib/queries/families'
import type { ActionResult } from '@/lib/actions/result'
import { NumberField, TextField } from '@/components/ledger/Field'
import { buttonClass, CARD, FIELD_LABEL, SECTION_TITLE } from '@/components/ui/styles'

type Draft = {
  name: string
  headName: string
  headMobile: string
  notes: string
  goalHorizonYears: number
  assumedCagr: number
}

function toDraft(family: Family): Draft {
  return {
    name: family.name,
    headName: family.headName ?? '',
    headMobile: family.headMobile ?? '',
    notes: family.notes ?? '',
    goalHorizonYears: family.goalHorizonYears,
    assumedCagr: family.assumedCagr,
  }
}

/**
 * A plain form rather than an EditableSection: a household is one record with no
 * row semantics. It still commits as a single unit, so the whole-row validation
 * story is unchanged.
 *
 * Read-only until the advisor asks to edit. These details change rarely, and
 * an always-open form at the top of the page made the household's own record
 * the easiest thing on it to change by accident — and the heaviest thing on
 * the page to look at.
 */
export function FamilyHeader({
  family,
  updateFamily,
}: {
  family: Family
  updateFamily: (id: string, input: unknown) => Promise<ActionResult>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Draft>(() => toDraft(family))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  function set(patch: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...patch }))
  }

  function startEditing() {
    setDraft(toDraft(family))
    setErrors({})
    setFormError(null)
    setSaved(false)
    setEditing(true)
  }

  function cancel() {
    setEditing(false)
    setErrors({})
    setFormError(null)
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await updateFamily(family.id, draft)
      if (!result.ok) {
        // The form stays open holding what was typed. Never discard input.
        setErrors(result.fieldErrors ?? {})
        setFormError(result.formError ?? null)
        return
      }
      setErrors({})
      setFormError(null)
      setSaved(true)
      setEditing(false)
    })
  }

  const facts: { label: string; value: React.ReactNode; mono?: boolean }[] = [
    { label: 'Head of family', value: family.headName || '—' },
    { label: 'Mobile', value: family.headMobile || '—', mono: true },
    { label: 'Goal horizon', value: `${family.goalHorizonYears} years` },
    { label: 'Assumed CAGR', value: `${family.assumedCagr}%` },
    { label: 'Notes', value: family.notes || '—' },
  ]

  return (
    <section aria-labelledby="household-details" className={`${CARD} px-5 py-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="household-details" className={SECTION_TITLE}>
          Household details
        </h2>
        {!editing && (
          <div className="flex items-center gap-3">
            {saved && (
              <span role="status" className="text-[12px] text-teal">
                Saved.
              </span>
            )}
            <button type="button" onClick={startEditing} className={buttonClass('secondary', 'sm')}>
              Edit details
            </button>
          </div>
        )}
      </div>

      {!editing ? (
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-5">
          {facts.map((fact) => (
            <div key={fact.label} className="min-w-0">
              <dt className={FIELD_LABEL}>{fact.label}</dt>
              <dd className={`mt-1 truncate text-[13px] text-ink ${fact.mono ? 'font-mono' : ''}`}>
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <form
          onSubmit={submit}
          // Validation is server-side (via updateFamily/zod) and surfaced through
          // FieldError; the browser's own min/max constraint validation must not
          // silently swallow the submit event before our handler runs.
          noValidate
          onKeyDown={(event) => {
            if (event.key === 'Escape') cancel()
          }}
          className="mt-3"
        >
          <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 md:grid-cols-3">
            <TextField
              id="name"
            required
              label="Family name"
              value={draft.name}
              onChange={(name) => set({ name })}
              error={errors.name}
            />
            <TextField
              id="headName"
              label="Head of family"
              value={draft.headName}
              onChange={(headName) => set({ headName })}
            />
            <TextField
              id="headMobile"
              label="Mobile"
              value={draft.headMobile}
              onChange={(headMobile) => set({ headMobile })}
              error={errors.headMobile}
              placeholder="98765 43210"
              mono
            />
            <NumberField
              id="goalHorizonYears"
              label="Goal horizon (years)"
              min={1}
              value={draft.goalHorizonYears}
              onChange={(value) => set({ goalHorizonYears: value ?? 0 })}
              error={errors.goalHorizonYears}
            />
            <NumberField
              id="assumedCagr"
              label="Assumed CAGR (%)"
              min={0}
              step="0.1"
              value={draft.assumedCagr}
              onChange={(value) => set({ assumedCagr: value ?? 0 })}
              error={errors.assumedCagr}
            />
            <TextField
              id="notes"
              label="Notes"
              value={draft.notes}
              onChange={(notes) => set({ notes })}
            />
          </div>

          {formError && (
            <p role="alert" className="mt-3 text-[12.5px] text-rust">
              {formError}
            </p>
          )}

          <div className="mt-4 flex items-center gap-2">
            <button type="submit" disabled={pending} className={buttonClass('primary', 'sm')}>
              {pending ? 'Saving…' : 'Save details'}
            </button>
            <button type="button" onClick={cancel} className={buttonClass('secondary', 'sm')}>
              Cancel
            </button>
            <span className="ml-1 text-[11.5px] text-ink-soft">
              <span className="text-rust">*</span> required
            </span>
          </div>
        </form>
      )}
    </section>
  )
}
