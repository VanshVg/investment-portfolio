// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MembersSection } from '@/app/(app)/families/[familyId]/_components/MembersSection'

const noop = async () => ({ ok: true as const, id: 'm1' })

const members = [
  {
    id: 'm1',
    familyId: 'f1',
    name: 'Rakesh',
    relation: 'self' as const,
    mobile: '+919876543210',
    whatsappConsent: true,
    whatsappConsentAt: '2026-01-01T00:00:00Z',
    removed: false,
  },
]

describe('MembersSection', () => {
  it('shows who has given WhatsApp consent', () => {
    render(
      <MembersSection
        familyId="f1"
        members={members}
        createMember={noop}
        updateMember={noop}
        deleteMember={noop}
        holdingCountByMember={{}}
      />,
    )
    expect(screen.getByText('Consented')).toBeInTheDocument()
  })

  it('blocks consent until a mobile number is present', () => {
    render(
      <MembersSection
        familyId="f1"
        members={members}
        createMember={noop}
        updateMember={noop}
        deleteMember={noop}
        holdingCountByMember={{}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '+ Add family member' }))
    // No mobile typed yet, so consent cannot be granted — this mirrors the
    // family_members_consent_needs_mobile check constraint.
    expect(screen.getByLabelText('WhatsApp consent')).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Mobile'), { target: { value: '9876543210' } })
    expect(screen.getByLabelText('WhatsApp consent')).toBeEnabled()
  })

  it('warns that holdings will be orphaned before deleting a member', async () => {
    render(
      <MembersSection
        familyId="f1"
        members={members}
        createMember={noop}
        updateMember={noop}
        deleteMember={noop}
        holdingCountByMember={{ m1: 3 }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Delete Rakesh' }))
    await waitFor(() =>
      expect(screen.getByRole('dialog')).toHaveTextContent(
        /3 financial record\(s\) are linked to Rakesh/,
      ),
    )
  })

  it('passes the family id when creating', async () => {
    const createMember = vi.fn(async () => ({ ok: true as const, id: 'm2' }))
    render(
      <MembersSection
        familyId="f1"
        members={members}
        createMember={createMember}
        updateMember={noop}
        deleteMember={noop}
        holdingCountByMember={{}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '+ Add family member' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Aarav' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(createMember).toHaveBeenCalledWith('f1', expect.objectContaining({ name: 'Aarav' })))
  })
})
