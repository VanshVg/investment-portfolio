// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FixedIncomeSection } from '@/app/(app)/families/[familyId]/_components/FixedIncomeSection'

const ok = async () => ({ ok: true as const, id: 'h1' })

const holdings = [
  {
    id: 'h1',
    familyId: 'f1',
    memberId: null,
    category: 'fixed_income' as const,
    managedBy: 'external' as const,
    label: 'SBI 5-year FD',
    institution: 'State Bank of India',
    principalAmount: 500000,
    periodicAmount: null,
    anchorDueDate: '2026-11-01',
    nextDueDate: '2026-11-01',
    dueFrequency: 'one_time' as const,
    remindersEnabled: true,
    details: { asset_type: 'Fixed deposit', interest_rate: 7.1 },
  },
]

function renderSection(overrides = {}) {
  const createHolding = vi.fn(ok)
  render(
    <FixedIncomeSection
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

describe('FixedIncomeSection', () => {
  it('shows the maturity date in Indian format', () => {
    renderSection()
    expect(screen.getByText('01-11-2026')).toBeInTheDocument()
  })

  it('defaults a new holding to a one-time maturity rather than a recurring due date', () => {
    renderSection()
    fireEvent.click(screen.getByRole('button', { name: '+ Add holding' }))
    expect(screen.getByLabelText('Frequency')).toHaveValue('one_time')
  })

  it('writes maturity to the due date column and never to details', async () => {
    const { createHolding } = renderSection()
    fireEvent.click(screen.getByRole('button', { name: '+ Add holding' }))
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'HDFC FD' } })
    fireEvent.change(screen.getByLabelText('Asset type'), { target: { value: 'Fixed deposit' } })
    fireEvent.change(screen.getByLabelText('Maturity date'), { target: { value: '15-06-2028' } })
    fireEvent.blur(screen.getByLabelText('Maturity date'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(createHolding).toHaveBeenCalled())
    const input = (createHolding.mock.calls[0] as unknown[])[1] as Record<string, unknown>
    expect(input.nextDueDate).toBe('2028-06-15')
    expect((input.details as Record<string, unknown>).maturity_date).toBeUndefined()
  })

  it('shows a rejected payout frequency detail error next to the field, keeping what was typed', async () => {
    const createHolding = vi.fn(async () => ({
      ok: false as const,
      fieldErrors: { 'details.payout_frequency': 'Enter at least one character.' },
    }))
    renderSection({ createHolding })

    fireEvent.click(screen.getByRole('button', { name: '+ Add holding' }))
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'HDFC FD' } })
    fireEvent.change(screen.getByLabelText('Asset type'), { target: { value: 'Fixed deposit' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(screen.getByText('Enter at least one character.')).toBeInTheDocument(),
    )
    expect(screen.getByLabelText('Description')).toHaveValue('HDFC FD')
    expect(screen.getByLabelText('Asset type')).toHaveValue('Fixed deposit')
  })

  it('shows a rejected remarks detail error next to the field, keeping what was typed', async () => {
    // remarks is written by this form, so it needs its own slot: a field the UI
    // can populate but cannot report on fails silently if the schema ever
    // tightens, which is the defect class every section here exists to avoid.
    const createHolding = vi.fn(async () => ({
      ok: false as const,
      fieldErrors: { 'details.remarks': 'Remarks are too long.' },
    }))
    renderSection({ createHolding })

    fireEvent.click(screen.getByRole('button', { name: '+ Add holding' }))
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'HDFC FD' } })
    fireEvent.change(screen.getByLabelText('Remarks'), { target: { value: 'Joint holding' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.getByText('Remarks are too long.')).toBeInTheDocument())
    expect(screen.getByLabelText('Description')).toHaveValue('HDFC FD')
    expect(screen.getByLabelText('Remarks')).toHaveValue('Joint holding')
  })
})
