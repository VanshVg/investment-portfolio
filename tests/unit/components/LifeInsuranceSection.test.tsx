// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LifeInsuranceSection } from '@/app/(app)/families/[familyId]/_components/LifeInsuranceSection'

const ok = async () => ({ ok: true as const, id: 'h1' })

const holdings = [
  {
    id: 'h1',
    familyId: 'f1',
    memberId: null,
    category: 'life_insurance' as const,
    managedBy: 'self' as const,
    label: 'HDFC Click2Protect',
    institution: 'HDFC Life',
    principalAmount: 5000000,
    periodicAmount: 12500,
    anchorDueDate: '2026-03-12',
    nextDueDate: '2027-03-12',
    dueFrequency: 'annual' as const,
    remindersEnabled: true,
    details: { policy_number: 'P/1234', term_years: 20 },
  },
]

function renderSection(overrides = {}) {
  const createHolding = vi.fn(ok)
  render(
    <LifeInsuranceSection
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

describe('LifeInsuranceSection', () => {
  it('formats amounts in Indian notation and dates as DD-MM-YYYY', () => {
    renderSection()
    expect(screen.getByText('12-03-2027')).toBeInTheDocument()
    expect(screen.getByText('With us')).toBeInTheDocument()
  })

  it('reveals the detail fields only while editing', () => {
    renderSection()
    expect(screen.queryByLabelText('Policy number')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit HDFC Click2Protect' }))
    expect(screen.getByLabelText('Policy number')).toHaveValue('P/1234')
  })

  it('sends the category with the draft so the union can discriminate', async () => {
    const { createHolding } = renderSection()
    fireEvent.click(screen.getByRole('button', { name: '+ Add policy' }))
    fireEvent.change(screen.getByLabelText('Plan name'), { target: { value: 'Max Life Smart' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(createHolding).toHaveBeenCalledWith(
        'f1',
        expect.objectContaining({ category: 'life_insurance', label: 'Max Life Smart' }),
      ),
    )
  })
})
