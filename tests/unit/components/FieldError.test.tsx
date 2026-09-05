// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FieldError, fieldErrorProps } from '@/components/ledger/FieldError'

describe('fieldErrorProps', () => {
  it('returns undefined for both attributes when there is no error', () => {
    expect(fieldErrorProps('name')).toEqual({ 'aria-invalid': undefined, 'aria-describedby': undefined })
  })

  it('points aria-describedby at the field id and sets aria-invalid when there is an error', () => {
    expect(fieldErrorProps('name', 'Required.')).toEqual({
      'aria-invalid': true,
      'aria-describedby': 'name-error',
    })
  })
})

describe('FieldError', () => {
  it('renders nothing when there is no message', () => {
    const { container } = render(<FieldError id="name" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the message as an alert with the conventional id', () => {
    render(<FieldError id="name" message="Required." />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveAttribute('id', 'name-error')
    expect(alert).toHaveTextContent('Required.')
  })
})
