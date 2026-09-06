// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemberSelect } from '@/components/ledger/MemberSelect'
import type { Member } from '@/lib/queries/families'

function makeMember(id: string, name: string): Member {
  return {
    id,
    familyId: 'f1',
    name,
    relation: 'self',
    mobile: null,
    whatsappConsent: false,
    whatsappConsentAt: null,
  }
}

const members: Member[] = [makeMember('m1', 'Hiral'), makeMember('m2', 'Meera')]

describe('MemberSelect', () => {
  it('emits the chosen member id, or null for the whole family', () => {
    const onChange = vi.fn()
    render(<MemberSelect id="member" label="Member" members={members} value={null} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Member'), { target: { value: 'm2' } })
    expect(onChange).toHaveBeenLastCalledWith('m2')
  })

  it('has no aria-invalid or aria-describedby when there is no error', () => {
    render(<MemberSelect id="member" label="Member" members={members} value={null} onChange={() => {}} />)
    const select = screen.getByLabelText('Member')
    expect(select).not.toHaveAttribute('aria-invalid')
    expect(select).not.toHaveAttribute('aria-describedby')
  })

  it('associates an external error with the field via aria-invalid and aria-describedby', () => {
    render(
      <MemberSelect
        id="member"
        label="Member"
        members={members}
        value={null}
        onChange={() => {}}
        error="Required."
      />,
    )
    const select = screen.getByLabelText('Member')
    expect(select).toHaveAttribute('aria-invalid', 'true')
    const describedBy = select.getAttribute('aria-describedby')
    expect(describedBy).toBe('member-error')
    expect(screen.getByRole('alert')).toHaveAttribute('id', describedBy as string)
    expect(screen.getByRole('alert')).toHaveTextContent('Required.')
  })
})
