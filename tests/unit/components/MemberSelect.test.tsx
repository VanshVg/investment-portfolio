// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemberSelect, memberName } from '@/components/ledger/MemberSelect'
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
    removed: false,
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
  describe('removed members (decision D2)', () => {
    const everyone: Member[] = [
      makeMember('m1', 'Hiral'),
      { ...makeMember('m2', 'Aarav'), removed: true },
    ]
    const options = () => screen.getAllByRole('option').map((o) => o.textContent)

    it('does not offer a removed member for a new assignment', () => {
      render(<MemberSelect id="member" label="Member" members={everyone} value={null} onChange={() => {}} />)
      expect(options()).toEqual(['Whole family', 'Hiral'])
    })

    it('keeps a removed member on a holding already theirs, marked as removed', () => {
      render(<MemberSelect id="member" label="Member" members={everyone} value="m2" onChange={() => {}} />)
      expect(options()).toEqual(['Whole family', 'Hiral', 'Aarav (removed)'])
      expect(screen.getByLabelText('Member')).toHaveValue('m2')
    })

    it('names a removed member as removed, and no member as the whole family', () => {
      expect(memberName(everyone, 'm2')).toBe('Aarav (removed)')
      expect(memberName(everyone, 'm1')).toBe('Hiral')
      expect(memberName(everyone, null)).toBe('Whole family')
    })
  })
})
