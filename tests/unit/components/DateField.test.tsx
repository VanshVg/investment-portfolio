// @vitest-environment jsdom
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DateField } from '@/components/ledger/DateField'
import { formatDMY, todayInIndia } from '@/lib/domain/dates'

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
  it.each([
    ['15/03/2027', 'Use DD-MM-YYYY.'],
    ['31-02-2027', 'That date does not exist.'],
    ['15-03-0202', 'Enter a year between 1950 and 2100.'],
  ])('says what is wrong with %j rather than always blaming the format', (typed, message) => {
    render(<DateField id="due" label="Due date" value={null} onChange={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: typed } })
    fireEvent.blur(screen.getByLabelText('Due date'))
    expect(screen.getByRole('alert')).toHaveTextContent(message)
  })

  describe('calendar picker', () => {
    it('fills the field with the day picked, in DD-MM-YYYY, and emits ISO', () => {
      const onChange = vi.fn()
      render(<DateField id="due" label="Due date" value="2027-03-12" onChange={onChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Open calendar' }))
      // Opens on the month of the date already in the field.
      fireEvent.click(screen.getByRole('button', { name: /March 20th, 2027/ }))

      expect(screen.getByLabelText('Due date')).toHaveValue('20-03-2027')
      expect(onChange).toHaveBeenLastCalledWith('2027-03-20')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('still accepts a typed date — the calendar is an addition, not a replacement', () => {
      const onChange = vi.fn()
      render(<DateField id="due" label="Due date" value={null} onChange={onChange} />)
      fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '01-04-2027' } })
      fireEvent.blur(screen.getByLabelText('Due date'))
      expect(onChange).toHaveBeenCalledWith('2027-04-01')
    })

    it('offers a shortcut to today, by the Indian calendar', () => {
      const onChange = vi.fn()
      render(<DateField id="due" label="Due date" value={null} onChange={onChange} />)
      fireEvent.click(screen.getByRole('button', { name: 'Open calendar' }))
      fireEvent.click(screen.getByRole('button', { name: 'Today' }))

      const today = todayInIndia()
      expect(onChange).toHaveBeenLastCalledWith(today)
      expect(screen.getByLabelText('Due date')).toHaveValue(formatDMY(today))
    })

    it('closes on Escape without the key reaching the form around it', () => {
      // A ledger editor saves on Enter and discards on Escape. A key pressed
      // inside the calendar must not do either to the row being edited.
      const onFormKeyDown = vi.fn()
      render(
        <div onKeyDown={onFormKeyDown}>
          <DateField id="due" label="Due date" value="2027-03-12" onChange={vi.fn()} />
        </div>,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Open calendar' }))
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(onFormKeyDown).not.toHaveBeenCalled()
    })

    it('does not let Enter on the calendar button reach the form around it', () => {
      const onFormKeyDown = vi.fn()
      render(
        <div onKeyDown={onFormKeyDown}>
          <DateField id="due" label="Due date" value={null} onChange={vi.fn()} />
        </div>,
      )
      fireEvent.keyDown(screen.getByRole('button', { name: 'Open calendar' }), { key: 'Enter' })
      expect(onFormKeyDown).not.toHaveBeenCalled()
    })

    it('closes when the advisor clicks elsewhere on the page', () => {
      render(<DateField id="due" label="Due date" value={null} onChange={vi.fn()} />)
      fireEvent.click(screen.getByRole('button', { name: 'Open calendar' }))
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      fireEvent.mouseDown(document.body)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})
