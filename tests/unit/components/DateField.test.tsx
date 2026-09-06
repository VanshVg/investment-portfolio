// @vitest-environment jsdom
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DateField } from '@/components/ledger/DateField'

function Wrapper({ initial }: { initial: string | null }) {
  const [value, setValue] = useState<string | null>(initial)
  return (
    <>
      <DateField id="due" label="Due date" value={value} onChange={setValue} />
      <button type="button" onClick={() => setValue('2027-06-15')}>
        set external
      </button>
    </>
  )
}

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

  it('resets to the new external value and clears the invalid state, even mid-typo', () => {
    render(<Wrapper initial={null} />)
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '31-02-2027' } })
    fireEvent.blur(screen.getByLabelText('Due date'))
    expect(screen.getByRole('alert')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'set external' }))

    expect(screen.getByLabelText('Due date')).toHaveValue('15-06-2027')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('associates an external error with the field via aria-invalid and aria-describedby', () => {
    render(
      <DateField id="due" label="Due date" value="2027-03-12" onChange={() => {}} error="Required." />,
    )
    const input = screen.getByLabelText('Due date')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    const describedBy = input.getAttribute('aria-describedby')
    expect(describedBy).toBe('due-error')
    expect(screen.getByRole('alert')).toHaveAttribute('id', describedBy as string)
    expect(screen.getByRole('alert')).toHaveTextContent('Required.')
  })
})
