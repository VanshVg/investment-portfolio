// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { ReplyList } from '@/app/(app)/messages/_components/ReplyList'
import { MessageTable } from '@/app/(app)/messages/_components/MessageTable'
import type { MessageRow, ReplyRow } from '@/lib/queries/messages'

const reply = (overrides: Partial<ReplyRow> = {}): ReplyRow => ({
  id: 'r1',
  from: '+919800000001',
  body: 'When is the premium due?',
  receivedAt: '2027-03-15T04:00:00Z',
  optOut: false,
  handled: false,
  senders: [{ name: 'Meera Shah', familyId: 'f1', familyName: 'Shah family' }],
  ...overrides,
})

const message = (overrides: Partial<MessageRow> = {}): MessageRow => ({
  id: 'm1',
  at: '2027-03-15T04:00:00Z',
  familyId: 'f1',
  familyName: 'Shah family',
  holdingLabel: 'Star Health',
  dueDate: '2027-04-01',
  recipient: 'client',
  mobile: '+919800000001',
  status: 'sent',
  detail: null,
  test: false,
  ...overrides,
})

describe('ReplyList', () => {
  it('shows who replied, their household, what they said and when', () => {
    render(<ReplyList replies={[reply()]} markReplyHandled={vi.fn()} />)
    expect(screen.getByText('Meera Shah')).toBeInTheDocument()
    const household = screen.getByRole('link', { name: 'Shah family' })
    expect(household).toHaveAttribute('href', '/families/f1')
    expect(screen.getByText('When is the premium due?')).toBeInTheDocument()
    expect(screen.getByText('15-03-2027, 09:30')).toBeInTheDocument()
  })

  it('shows the number when it matches no member, and labels an opt-out', () => {
    render(
      <ReplyList
        replies={[reply({ senders: [], optOut: true, body: 'STOP' })]}
        markReplyHandled={vi.fn()}
      />,
    )
    expect(screen.getByText('+919800000001')).toBeInTheDocument()
    expect(screen.getByText(/Opted out/)).toBeInTheDocument()
  })

  it('marks a reply handled', async () => {
    const markReplyHandled = vi.fn(async () => ({ ok: true as const, id: 'r1' }))
    render(<ReplyList replies={[reply()]} markReplyHandled={markReplyHandled} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mark handled: Meera Shah' }))
    expect(await screen.findByText('Handled')).toBeInTheDocument()
    expect(markReplyHandled).toHaveBeenCalledWith('r1')
    expect(screen.queryByRole('button', { name: /Mark handled/ })).not.toBeInTheDocument()
  })

  it('says when there are no replies', () => {
    render(<ReplyList replies={[]} markReplyHandled={vi.fn()} />)
    expect(screen.getByText('No replies yet.')).toBeInTheDocument()
  })
})

describe('MessageTable', () => {
  it('shows the household, the policy, who it went to and what happened', () => {
    render(
      <MessageTable
        rows={[message({ status: 'skipped', detail: 'No WhatsApp consent' })]}
        emptyMessage="Nothing."
      />,
    )
    const row = screen.getAllByRole('row')[1]
    expect(within(row).getByRole('link', { name: 'Shah family' })).toHaveAttribute(
      'href',
      '/families/f1',
    )
    expect(within(row).getByText('Star Health')).toBeInTheDocument()
    expect(within(row).getByText('Client')).toBeInTheDocument()
    expect(within(row).getByText('Skipped')).toBeInTheDocument()
    expect(within(row).getByText('No WhatsApp consent')).toBeInTheDocument()
  })

  it('labels a Test-mode preview as such', () => {
    render(<MessageTable rows={[message({ status: 'pending', test: true })]} emptyMessage="-" />)
    expect(screen.getByText('Test preview')).toBeInTheDocument()
  })

  it('shows the empty message', () => {
    render(<MessageTable rows={[]} emptyMessage="No failed messages." />)
    expect(screen.getByText('No failed messages.')).toBeInTheDocument()
  })
})
