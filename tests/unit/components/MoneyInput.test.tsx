// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MoneyInput } from '@/components/ledger/MoneyInput'

describe('MoneyInput', () => {
  it('emits a number as it is typed', () => {
    const onChange = vi.fn()
    render(<MoneyInput id="premium" label="Annual premium" value={null} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Annual premium'), { target: { value: '25000' } })
    expect(onChange).toHaveBeenLastCalledWith(25000)
  })

  it('has no aria-invalid or aria-describedby when there is no error', () => {
    render(<MoneyInput id="premium" label="Annual premium" value={null} onChange={() => {}} />)
    const input = screen.getByLabelText('Annual premium')
    expect(input).not.toHaveAttribute('aria-invalid')
    expect(input).not.toHaveAttribute('aria-describedby')
  })

  it('associates an external error with the field via aria-invalid and aria-describedby', () => {
    render(
      <MoneyInput id="premium" label="Annual premium" value={null} onChange={() => {}} error="Required." />,
    )
    const input = screen.getByLabelText('Annual premium')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    const describedBy = input.getAttribute('aria-describedby')
    expect(describedBy).toBe('premium-error')
    expect(screen.getByRole('alert')).toHaveAttribute('id', describedBy as string)
    expect(screen.getByRole('alert')).toHaveTextContent('Required.')
  })
})
