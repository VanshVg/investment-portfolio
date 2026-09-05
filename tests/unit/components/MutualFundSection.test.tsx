// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MutualFundSection } from '@/app/(app)/families/[familyId]/_components/MutualFundSection'

const ok = async () => ({ ok: true as const, id: 'h1' })

const holdings = [
  {
    id: 'h1',
    familyId: 'f1',
    memberId: null,
    category: 'mutual_fund' as const,
    managedBy: 'self' as const,
    label: 'Parag Parikh Flexi Cap',
    institution: 'PPFAS',
    principalAmount: 850000,
    periodicAmount: 15000,
    anchorDueDate: null,
    nextDueDate: null,
    dueFrequency: 'monthly' as const,
    remindersEnabled: false,
    details: { target_goal: 5000000, folio_number: 'F/9912' },
  },
]

function renderSection(overrides = {}) {
  const createHolding = vi.fn(ok)
  render(
    <MutualFundSection
      familyId="f1"
      members={[]}
      holdings={holdings}
      createHolding={createHolding}
      updateHolding={ok}
      deleteHolding={ok}
      {...overrides}
    />,
  )
  return { createHolding }
}

describe('MutualFundSection', () => {
  it('shows the target goal from the details payload', () => {
    renderSection()
    expect(screen.getByText('Parag Parikh Flexi Cap')).toBeInTheDocument()
  })

  it('starts a new holding with reminders off, since a SIP auto-debits', () => {
    renderSection()
    fireEvent.click(screen.getByRole('button', { name: '+ Add holding' }))
    expect(screen.getByLabelText('Send reminders')).not.toBeChecked()
  })

  it('sends target_goal as a number, not a string', async () => {
    const { createHolding } = renderSection()
    fireEvent.click(screen.getByRole('button', { name: '+ Add holding' }))
    fireEvent.change(screen.getByLabelText('Fund name'), { target: { value: 'HDFC Flexi Cap' } })
    fireEvent.change(screen.getByLabelText('Target goal'), { target: { value: '2500000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(createHolding).toHaveBeenCalledWith(
        'f1',
        expect.objectContaining({
          category: 'mutual_fund',
          details: expect.objectContaining({ target_goal: 2500000 }),
        }),
      ),
    )
  })

  it('shows a rejected fund house detail error next to the field, keeping what was typed', async () => {
    const createHolding = vi.fn(async () => ({
      ok: false as const,
      fieldErrors: { 'details.fund_house': 'Enter at least one character.' },
    }))
    renderSection({ createHolding })

    fireEvent.click(screen.getByRole('button', { name: '+ Add holding' }))
    fireEvent.change(screen.getByLabelText('Fund name'), { target: { value: 'HDFC Flexi Cap' } })
    fireEvent.change(screen.getByLabelText('Target goal'), { target: { value: '2500000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(screen.getByText('Enter at least one character.')).toBeInTheDocument(),
    )
    expect(screen.getByLabelText('Fund name')).toHaveValue('HDFC Flexi Cap')
    expect(screen.getByLabelText('Target goal')).toHaveValue(2500000)
  })
})
