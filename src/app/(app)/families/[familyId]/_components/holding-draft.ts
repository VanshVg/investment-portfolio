import type { DueFrequency, Holding, ManagedBy } from '@/lib/queries/families'

/**
 * One draft shape for all four categories. The differences live entirely in
 * `details`, which each section reads and writes through the helpers below —
 * so the four sections stay thin while the plumbing exists once.
 */
export interface HoldingDraft {
  memberId: string | null
  managedBy: ManagedBy
  label: string
  institution: string
  principalAmount: number | null
  periodicAmount: number | null
  nextDueDate: string | null
  dueFrequency: DueFrequency
  remindersEnabled: boolean
  details: Record<string, unknown>
}

export function emptyHoldingDraft(): HoldingDraft {
  return {
    memberId: null,
    managedBy: 'self',
    label: '',
    institution: '',
    principalAmount: null,
    periodicAmount: null,
    nextDueDate: null,
    dueFrequency: 'annual',
    remindersEnabled: true,
    details: {},
  }
}

export function toHoldingDraft(holding: Holding): HoldingDraft {
  return {
    memberId: holding.memberId,
    managedBy: holding.managedBy,
    label: holding.label,
    institution: holding.institution ?? '',
    principalAmount: holding.principalAmount,
    periodicAmount: holding.periodicAmount,
    nextDueDate: holding.nextDueDate,
    dueFrequency: holding.dueFrequency,
    remindersEnabled: holding.remindersEnabled,
    details: (holding.details as Record<string, unknown>) ?? {},
  }
}

export function detail(draft: HoldingDraft, key: string): string {
  const value = draft.details[key]
  return value === undefined || value === null ? '' : String(value)
}

/** Empty means absent: a blank string would fail the strict optional schemas. */
export function setDetail(
  draft: HoldingDraft,
  key: string,
  value: string | number | undefined,
): Partial<HoldingDraft> {
  const next = { ...draft.details }
  if (value === undefined || value === '') delete next[key]
  else next[key] = value
  return { details: next }
}
