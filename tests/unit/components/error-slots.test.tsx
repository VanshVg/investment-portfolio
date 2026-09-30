// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LifeInsuranceSection } from '@/app/(app)/families/[familyId]/_components/LifeInsuranceSection'
import { GeneralInsuranceSection } from '@/app/(app)/families/[familyId]/_components/GeneralInsuranceSection'
import { MutualFundSection } from '@/app/(app)/families/[familyId]/_components/MutualFundSection'
import { FixedIncomeSection } from '@/app/(app)/families/[familyId]/_components/FixedIncomeSection'
import { MembersSection } from '@/app/(app)/families/[familyId]/_components/MembersSection'
import { FamilyHeader } from '@/app/(app)/families/[familyId]/_components/FamilyHeader'
import { FamilyList } from '@/app/(app)/families/_components/FamilyList'
import { ReminderRulesSection, type ReminderRuleRow } from '@/app/(app)/settings/reminders/_components/ReminderRulesSection'
import { AdvisorMobileForm } from '@/app/(app)/settings/reminders/_components/AdvisorMobileForm'
import { holdingDetailSchemas, holdingInput, type HoldingCategory } from '@/lib/validation/holdings'
import { memberInput } from '@/lib/validation/members'
import { familyInput } from '@/lib/validation/families'
import { advisorMobileInput, reminderRuleInput } from '@/lib/validation/reminders'
import type { ActionResult } from '@/lib/actions/result'

// FamilyList opens a household's page once it is added.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

/**
 * `fromZodError`/`fromPostgrestError` (src/lib/actions/result.ts) return
 * `{ ok: false, fieldErrors }` keyed by schema field path, with no `formError`
 * whenever any field error exists. `EditableSection` threads `fieldErrors`
 * into `renderEdit`/`renderDetails` as `errors`. So a schema key with no
 * rendered slot for it is a silent failure: the save is rejected and the
 * advisor sees nothing at all.
 *
 * These tests go through the real save path for every editable section —
 * render it, stub its action to reject with a fieldErrors map, open the
 * editor, submit, assert the message is on screen — rather than calling
 * `renderDetails`/`renderEdit` directly with a hand-built errors object.
 * Calling them directly would pass even for a section that forgets to thread
 * `errors` through in the first place, which is exactly the bug class this
 * file exists to catch.
 *
 * The key lists below are derived from the Zod schemas themselves, not
 * copied by hand, so that adding a schema field without a slot fails this
 * test. Verified by hand while writing this file: adding a throwaway
 * `.optional()` string field to `generalInsuranceDetails` in holdings.ts made
 * the GeneralInsuranceSection case above fail with "Unable to find an element
 * with the text: slot check: details.throwaway_probe_field" — removing the
 * field again restored the pass. Do not repeat that probe here; this comment
 * is the record of it.
 */

/**
 * Fields deliberately excluded from the "must have a rendered slot" check,
 * each with the reason recorded — an absent key here must be a decision,
 * never a gap. Every key not listed here is asserted to have a slot below.
 */
const KNOWN_UNREACHABLE = {
  // Every holding section's `managedBy` and `dueFrequency` are plain
  // `<select>`s and `remindersEnabled` is a checkbox — each can only ever
  // hold one of the schema's own valid enum/boolean values, so none of the
  // three can actually be rejected by the schema through this UI.
  // `institution` is a bare `z.string().trim().transform(...)` with no
  // `.refine`/`.min` of its own, so it likewise cannot fail validation.
  // None of these four is "producible": there is nothing a slot would ever
  // have to show.
  // `openedDueDate` has no control at all: the editor copies it from the
  // row's own stored due date when it opens (toHoldingDraft), so it is always
  // a date the database already accepted, and null on a new row.
  holdingBase: ['managedBy', 'dueFrequency', 'remindersEnabled', 'institution', 'openedDueDate'],
  // Per-section exclusions on top of the universal ones above: fields that
  // are part of the shared `holdingBase` schema but that one particular
  // section's editor never renders a control for at all — so, exactly like
  // `institution` above, whatever is already on the row (or `null`, on a new
  // row) simply passes through unchanged and can never fail validation
  // through this section's own UI.
  holdingBasePerSection: {
    // Fixed income has no periodic-amount input: an FD/NCD/bond is modelled
    // as a lump sum (principalAmount) plus interest_rate/payout_frequency in
    // details, not a recurring contribution. If a recurring-deposit product
    // (which does have a periodic contribution) is ever added here, this
    // exclusion needs revisiting alongside a real widget and slot.
    fixed_income: ['periodicAmount'],
  } as Partial<Record<HoldingCategory, string[]>>,
  // `relation` is an enum `<select>`, same reasoning as managedBy above.
  member: ['relation'],
  // `headName` and `notes` are bare trim+transform, same as `institution`
  // above — no refinement exists that could reject them.
  family: ['headName', 'notes'],
  // Holding detail keys with no rendered slot, checked per category.
  details: {
    // Maturity lives in the holding's own `next_due_date` column, never in
    // `details.maturity_date` — see the comment in FixedIncomeSection.tsx.
    // The schema key stays (for reading any row that predates that decision)
    // but nothing in the UI can ever write, and therefore never rejects,
    // this specific key.
    fixed_income: ['maturity_date'],
  } as Partial<Record<HoldingCategory, string[]>>,
  // FamilyList's add-row never exposes goalHorizonYears/assumedCagr — every
  // family it creates gets the hardcoded, always-in-bounds defaults from
  // emptyDraft (8, 12), so the families_goal_horizon_positive /
  // families_cagr_sane constraints can never actually fire through this
  // control. They are reachable — and already slotted — through
  // FamilyHeader, tested separately below, which is where an advisor
  // actually edits them.
  familyListCreate: ['goalHorizonYears', 'assumedCagr'],
  // isActive is a checkbox: its value is always a real boolean supplied by
  // the browser, so z.boolean() can never reject anything this control
  // actually produces.
  reminderRule: ['isActive'],
}

function without(all: string[], excluded: string[]): string[] {
  return all.filter((key) => !excluded.includes(key))
}

function detailKeys(category: HoldingCategory): string[] {
  const all = Object.keys(holdingDetailSchemas[category].shape)
  const excluded = KNOWN_UNREACHABLE.details[category] ?? []
  return without(all, excluded).map((key) => `details.${key}`)
}

const ALL_BASE_HOLDING_FIELDS = Object.keys(holdingInput.options[0].shape).filter(
  (key) => key !== 'category' && key !== 'details',
)

function baseHoldingFields(category: HoldingCategory): string[] {
  const excluded = [...KNOWN_UNREACHABLE.holdingBase, ...(KNOWN_UNREACHABLE.holdingBasePerSection[category] ?? [])]
  return without(ALL_BASE_HOLDING_FIELDS, excluded)
}

const memberFields = without(Object.keys(memberInput.shape), KNOWN_UNREACHABLE.member)
const familyFields = without(Object.keys(familyInput.shape), KNOWN_UNREACHABLE.family)
const reminderRuleFields = without(
  Object.keys(reminderRuleInput.shape),
  KNOWN_UNREACHABLE.reminderRule,
)
const advisorMobileFields = Object.keys(advisorMobileInput.shape)

function errorsFor(keys: string[]): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const key of keys) errors[key] = `slot check: ${key}`
  return errors
}

async function expectEveryErrorVisible(errors: Record<string, string>) {
  for (const message of Object.values(errors)) {
    await waitFor(() => expect(screen.getByText(message)).toBeInTheDocument())
  }
}

const ok: () => Promise<ActionResult> = async () => ({ ok: true, id: 'r1' })

type HoldingSectionComponent = typeof LifeInsuranceSection

function renderHoldingSection(
  Component: HoldingSectionComponent,
  createHolding: (familyId: string, input: unknown) => Promise<ActionResult>,
) {
  render(
    <Component
      familyId="f1"
      members={[]}
      holdings={[]}
      createHolding={createHolding}
      updateHolding={ok}
      deleteHolding={ok}
    />,
  )
}

const HOLDING_SECTIONS: {
  name: string
  Component: HoldingSectionComponent
  category: HoldingCategory
  addLabel: string
}[] = [
  { name: 'LifeInsuranceSection', Component: LifeInsuranceSection, category: 'life_insurance', addLabel: '+ Add policy' },
  {
    name: 'GeneralInsuranceSection',
    Component: GeneralInsuranceSection,
    category: 'general_insurance',
    addLabel: '+ Add policy',
  },
  { name: 'MutualFundSection', Component: MutualFundSection, category: 'mutual_fund', addLabel: '+ Add holding' },
  { name: 'FixedIncomeSection', Component: FixedIncomeSection, category: 'fixed_income', addLabel: '+ Add holding' },
]

describe.each(HOLDING_SECTIONS)('$name error slots', ({ Component, category, addLabel }) => {
  it('shows every producible field error through the real save path', async () => {
    const keys = [...baseHoldingFields(category), ...detailKeys(category)]
    const fieldErrors = errorsFor(keys)
    const createHolding = async () => ({ ok: false as const, fieldErrors })

    renderHoldingSection(Component, createHolding)
    fireEvent.click(screen.getByRole('button', { name: addLabel }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await expectEveryErrorVisible(fieldErrors)
  })
})

describe('MembersSection error slots', () => {
  it('shows every producible field error through the real save path', async () => {
    const fieldErrors = errorsFor(memberFields)
    const createMember = async () => ({ ok: false as const, fieldErrors })

    render(
      <MembersSection
        familyId="f1"
        members={[]}
        holdingCountByMember={{}}
        createMember={createMember}
        updateMember={ok}
        deleteMember={ok}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '+ Add family member' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await expectEveryErrorVisible(fieldErrors)
  })
})

describe('FamilyHeader error slots', () => {
  it('shows every producible field error through the real save path, including the two check-constraint fields', async () => {
    const fieldErrors = errorsFor(familyFields)
    const updateFamily = async () => ({ ok: false as const, fieldErrors })

    render(
      <FamilyHeader
        family={{
          id: 'f1',
          name: 'Patel',
          headName: 'Rakesh',
          headMobile: '+919876543210',
          notes: null,
          goalHorizonYears: 8,
          assumedCagr: 12,
        }}
        updateFamily={updateFamily}
      />,
    )
    // The details are read-only until the advisor opens the form.
    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }))

    await expectEveryErrorVisible(fieldErrors)
  })
})

describe('FamilyList error slots', () => {
  it('shows every field error the add-row can actually trigger through the real save path', async () => {
    const keys = without(familyFields, KNOWN_UNREACHABLE.familyListCreate)
    const fieldErrors = errorsFor(keys)
    const createFamily = async () => ({ ok: false as const, fieldErrors })

    render(<FamilyList families={[]} createFamily={createFamily} deleteFamily={ok} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add family' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await expectEveryErrorVisible(fieldErrors)
  })
})

describe('ReminderRulesSection error slots', () => {
  it('shows every producible field error through the real save path', async () => {
    const fieldErrors = errorsFor(reminderRuleFields)
    const updateReminderRule = async () => ({ ok: false as const, fieldErrors })
    const rule: ReminderRuleRow = {
      id: 'r1',
      category: 'life_insurance',
      daysBefore: [30, 15],
      isActive: true,
    }

    render(<ReminderRulesSection rules={[rule]} updateReminderRule={updateReminderRule} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await expectEveryErrorVisible(fieldErrors)
  })
})

describe('AdvisorMobileForm error slots', () => {
  it('shows every producible field error through the real save path', async () => {
    const fieldErrors = errorsFor(advisorMobileFields)
    const updateAdvisorMobile = async () => ({ ok: false as const, fieldErrors })

    render(<AdvisorMobileForm mobile={null} updateAdvisorMobile={updateAdvisorMobile} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await expectEveryErrorVisible(fieldErrors)
  })
})

/**
 * Every entry in KNOWN_UNREACHABLE is a claim about the code as it stands, and
 * two kinds of claim stop being true the moment someone changes it: "this
 * section renders no control for the field", and "no rule exists that could
 * reject this field". A stale exclusion is worse than no exclusion — it
 * silently reinstates the invisible-rejection bug the rest of this file exists
 * to prevent, in the one place nobody will think to look. So the claims that
 * can expire are asserted rather than trusted, and adding the control or the
 * rule breaks the exclusion instead of quietly outliving it.
 */
describe('the KNOWN_UNREACHABLE exclusions are still true', () => {
  it('leaves the unrejectable fields with no rule that could reject them', () => {
    // A .min or .refine added here would make `institution` rejectable in all
    // four sections at once, none of which renders a slot for it.
    expect(holdingInput.options[0].shape.institution.safeParse('').success).toBe(true)

    const family = familyInput.shape
    for (const key of KNOWN_UNREACHABLE.family) {
      expect(family[key as keyof typeof family].safeParse('').success).toBe(true)
    }
  })

  it('still renders no periodic-amount control on fixed income', async () => {
    const fieldErrors = {
      label: 'slot check: label',
      periodicAmount: 'slot check: periodicAmount',
    }
    renderHoldingSection(FixedIncomeSection, async () => ({ ok: false as const, fieldErrors }))
    fireEvent.click(screen.getByRole('button', { name: '+ Add holding' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    // Wait for a key that does have a slot before asserting the absence of one
    // that should not: otherwise this passes merely by running before the
    // rejected save has been rendered at all.
    await screen.findByText(fieldErrors.label)
    expect(screen.queryByText(fieldErrors.periodicAmount)).not.toBeInTheDocument()
  })

  it('still exposes neither horizon nor CAGR in the family add-row', async () => {
    const fieldErrors = {
      name: 'slot check: name',
      goalHorizonYears: 'slot check: goalHorizonYears',
      assumedCagr: 'slot check: assumedCagr',
    }
    render(
      <FamilyList
        families={[]}
        createFamily={async () => ({ ok: false as const, fieldErrors })}
        deleteFamily={ok}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '+ Add family' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await screen.findByText(fieldErrors.name)
    expect(screen.queryByText(fieldErrors.goalHorizonYears)).not.toBeInTheDocument()
    expect(screen.queryByText(fieldErrors.assumedCagr)).not.toBeInTheDocument()
  })
})
