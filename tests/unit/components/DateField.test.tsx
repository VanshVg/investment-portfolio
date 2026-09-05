// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DateField } from '@/components/ledger/DateField'

describe('DateField', () => {
  it('shows an ISO value in Indian DD-MM-YYYY form', () => {
    render(<DateField id="due" label="Due date" value="2027-03-12" onChange={() => {}} />)
    expect(screen.getByLabelText('Due date')).toHaveValue('12-03-2027')
  })

  it('emits ISO when a valid Indian date is typed', () => {
    const onChange = vi.fn()
    render(<DateField id="due" label="Due date" value={null} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '01-04-2027' } })
    fireEvent.blur(screen.getByLabelText('Due date'))
    expect(onChange).toHaveBeenLastCalledWith('2027-04-01')
  })

  it('emits null when cleared', () => {
    const onChange = vi.fn()
    render(<DateField id="due" label="Due date" value="2027-03-12" onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '' } })
    fireEvent.blur(screen.getByLabelText('Due date'))
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it('reports an unparseable date instead of silently discarding it', () => {
    render(<DateField id="due" label="Due date" value={null} onChange={() => {}} />)
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '31-02-2027' } })
    fireEvent.blur(screen.getByLabelText('Due date'))
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
