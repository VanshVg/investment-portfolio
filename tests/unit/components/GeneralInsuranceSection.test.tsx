// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { GeneralInsuranceSection } from '@/app/(app)/families/[familyId]/_components/GeneralInsuranceSection'

const ok = async () => ({ ok: true as const, id: 'h1' })

const holdings = [
  {
    id: 'h1',
    familyId: 'f1',
    memberId: null,
    category: 'general_insurance' as const,
    managedBy: 'external' as const,
    label: 'Star Health floater',
    institution: 'Star Health',
    principalAmount: 1000000,
    periodicAmount: 24000,
    anchorDueDate: '2026-08-04',
    nextDueDate: '2027-08-04',
    dueFrequency: 'annual' as const,
    remindersEnabled: true,
    details: { sub_category: 'health', insured_asset: 'Family floater', policy_type: 'Floater' },
  },
]

describe('GeneralInsuranceSection', () => {
  it('shows the sub-category from the details payload', () => {
    render(
      <GeneralInsuranceSection
        familyId="f1"
        members={[]}
        holdings={holdings}
        createHolding={ok}
        updateHolding={ok}
        deleteHolding={ok}
      />,
    )
    expect(screen.getByText('Health')).toBeInTheDocument()
    expect(screen.getByText('External')).toBeInTheDocument()
  })

  it('defaults a new row to health rather than leaving the required field unset', () => {
    render(
      <GeneralInsuranceSection
        familyId="f1"
        members={[]}
        holdings={holdings}
        createHolding={ok}
        updateHolding={ok}
        deleteHolding={ok}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '+ Add policy' }))
    expect(screen.getByLabelText('Category')).toHaveValue('health')
  })

  it('sends the required detail fields with the draft', async () => {
    const createHolding = vi.fn(ok)
    render(
      <GeneralInsuranceSection
        familyId="f1"
        members={[]}
        holdings={holdings}
        createHolding={createHolding}
        updateHolding={ok}
        deleteHolding={ok}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '+ Add policy' }))
    fireEvent.change(screen.getByLabelText('Policy name'), { target: { value: 'HDFC Ergo' } })
    fireEvent.change(screen.getByLabelText('Insured asset'), { target: { value: 'Honda City' } })
    fireEvent.change(screen.getByLabelText('Policy type'), { target: { value: 'Comprehensive' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(createHolding).toHaveBeenCalledWith(
        'f1',
        expect.objectContaining({
          category: 'general_insurance',
          details: expect.objectContaining({
            sub_category: 'health',
            insured_asset: 'Honda City',
            policy_type: 'Comprehensive',
          }),
        }),
      ),
    )
  })

  it('shows a rejected details field error next to the field that caused it, keeping what was typed', async () => {
    const createHolding = vi.fn(async () => ({
      ok: false as const,
      fieldErrors: { 'details.policy_type': 'A policy type is required.' },
    }))
    render(
      <GeneralInsuranceSection
        familyId="f1"
        members={[]}
        holdings={holdings}
        createHolding={createHolding}
        updateHolding={ok}
        deleteHolding={ok}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '+ Add policy' }))
    fireEvent.change(screen.getByLabelText('Policy name'), { target: { value: 'HDFC Ergo' } })
    fireEvent.change(screen.getByLabelText('Insured asset'), { target: { value: 'Honda City' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(screen.getByText('A policy type is required.')).toBeInTheDocument(),
    )
    // Never discard input: the rejected save keeps the editor open with what was typed.
    expect(screen.getByLabelText('Policy name')).toHaveValue('HDFC Ergo')
    expect(screen.getByLabelText('Insured asset')).toHaveValue('Honda City')
  })
  it('carries the reminder toggle through to the saved holding', async () => {
    // Insurance renewals are exactly what an advisor wants chasing, so the
    // toggle defaults on here — but it has to actually reach the payload.
    const createHolding = vi.fn(ok)
    render(
      <GeneralInsuranceSection
        familyId="f1"
        members={[]}
        holdings={holdings}
        createHolding={createHolding}
        updateHolding={ok}
        deleteHolding={ok}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '+ Add policy' }))
    expect(screen.getByLabelText('Send reminders')).toBeChecked()

    fireEvent.change(screen.getByLabelText('Policy name'), { target: { value: 'HDFC Ergo' } })
    fireEvent.change(screen.getByLabelText('Insured asset'), { target: { value: 'Swift' } })
    fireEvent.change(screen.getByLabelText('Policy type'), { target: { value: 'Comprehensive' } })
    fireEvent.click(screen.getByLabelText('Send reminders'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(createHolding).toHaveBeenCalled())
    const input = (createHolding.mock.calls[0] as unknown[])[1] as Record<string, unknown>
    expect(input.remindersEnabled).toBe(false)
  })
})
