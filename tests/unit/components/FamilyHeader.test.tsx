// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FamilyHeader } from '@/app/(app)/families/[familyId]/_components/FamilyHeader'

const family = {
  id: 'f1',
  name: 'Patel',
  headName: 'Rakesh',
  headMobile: '+919876543210',
  notes: null,
  goalHorizonYears: 8,
  assumedCagr: 12,
}

describe('FamilyHeader', () => {
  it('submits every field as one unit', async () => {
    const updateFamily = vi.fn(async () => ({ ok: true as const, id: 'f1' }))
    render(<FamilyHeader family={family} updateFamily={updateFamily} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }))

    fireEvent.change(screen.getByLabelText('Family name'), { target: { value: 'Patel Family' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }))

    await waitFor(() => expect(updateFamily).toHaveBeenCalledTimes(1))
    expect((updateFamily.mock.calls[0] as unknown as [string, unknown])[1]).toMatchObject({
      name: 'Patel Family',
      headName: 'Rakesh',
      goalHorizonYears: 8,
      assumedCagr: 12,
    })
  })

  it('shows a field error returned by the action and keeps the typed value', async () => {
    const updateFamily = vi.fn(async () => ({
      ok: false as const,
      fieldErrors: { assumedCagr: 'Assumed CAGR must be between 0 and 30%.' },
    }))
    render(<FamilyHeader family={family} updateFamily={updateFamily} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }))

    fireEvent.change(screen.getByLabelText('Assumed CAGR (%)'), { target: { value: '99' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Assumed CAGR must be between 0 and 30%.'),
    )
    expect(screen.getByLabelText('Assumed CAGR (%)')).toHaveValue(99)
  })

  it('confirms the save so the advisor knows it landed', async () => {
    const updateFamily = vi.fn(async () => ({ ok: true as const, id: 'f1' }))
    render(<FamilyHeader family={family} updateFamily={updateFamily} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }))
    await waitFor(() => expect(screen.getByText('Saved.')).toBeInTheDocument())
  })
  it('shows the details read-only until the advisor chooses to edit', () => {
    render(<FamilyHeader family={family} updateFamily={vi.fn()} />)
    expect(screen.getByText('Rakesh')).toBeInTheDocument()
    expect(screen.getByText('+919876543210')).toBeInTheDocument()
    expect(screen.queryByLabelText('Family name')).not.toBeInTheDocument()
  })

  it('cancelling closes the form without saving anything', () => {
    const updateFamily = vi.fn()
    render(<FamilyHeader family={family} updateFamily={updateFamily} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }))
    fireEvent.change(screen.getByLabelText('Family name'), { target: { value: 'Changed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(updateFamily).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Family name')).not.toBeInTheDocument()
  })
})
