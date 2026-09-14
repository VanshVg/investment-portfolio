// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RenewalTable } from '@/app/(app)/renewals/_components/RenewalTable'
import type { RenewalRow } from '@/lib/queries/renewals'

function row(overrides: Partial<RenewalRow> = {}): RenewalRow {
  return {
    dueInstanceId: 'instance-1',
    dueDate: '2026-10-01',
    amountDue: 12000,
    paymentStatus: 'unknown',
    holdingId: 'holding-1',
    label: 'HDFC Life Click2Protect',
    category: 'life_insurance',
    managedBy: 'self',
    dueFrequency: 'annual',
    familyId: 'family-1',
    familyName: 'Shah family',
    memberId: 'member-1',
    memberName: 'Ramesh Shah',
    offSchedule: false,
    firedWindows: [],
    ...overrides,
  }
}

describe('RenewalTable', () => {
  it('renders the due date in the Indian DD-MM-YYYY format', () => {
    render(<RenewalTable rows={[row({ dueDate: '2026-10-01' })]} />)
    expect(screen.getByText('01-10-2026')).toBeInTheDocument()
  })

  it('renders a different date correctly too, not a hardcoded string', () => {
    render(<RenewalTable rows={[row({ dueDate: '2026-01-05' })]} />)
    expect(screen.getByText('05-01-2026')).toBeInTheDocument()
  })

  it('renders one row per due instance passed in', () => {
    render(
      <RenewalTable
        rows={[
          row({ dueInstanceId: 'a', label: 'Term plan' }),
          row({ dueInstanceId: 'b', label: 'Health cover' }),
        ]}
      />,
    )
    expect(screen.getByText('Term plan')).toBeInTheDocument()
    expect(screen.getByText('Health cover')).toBeInTheDocument()
    expect(screen.queryByText('No renewals in this window.')).not.toBeInTheDocument()
  })

  it('marks an externally managed holding distinctly from one managed here', () => {
    render(<RenewalTable rows={[row({ managedBy: 'external' })]} />)
    expect(screen.getByText('External')).toBeInTheDocument()
  })

  it('marks a self-managed holding as with us, not external', () => {
    render(<RenewalTable rows={[row({ managedBy: 'self' })]} />)
    expect(screen.getByText('With us')).toBeInTheDocument()
    expect(screen.queryByText('External')).not.toBeInTheDocument()
  })

  it('flags an off-schedule instance', () => {
    render(<RenewalTable rows={[row({ offSchedule: true })]} />)
    expect(screen.getByText('Off schedule')).toBeInTheDocument()
  })

  it('does not flag an on-schedule instance', () => {
    render(<RenewalTable rows={[row({ offSchedule: false })]} />)
    expect(screen.queryByText('Off schedule')).not.toBeInTheDocument()
  })

  it('shows which reminder windows have been queued', () => {
    render(<RenewalTable rows={[row({ firedWindows: [30, 15] })]} />)
    expect(screen.getByText('30d, 15d')).toBeInTheDocument()
  })

  it('reflects the actual windows passed in, not a fixed pair', () => {
    render(<RenewalTable rows={[row({ firedWindows: [60, 45] })]} />)
    expect(screen.getByText('60d, 45d')).toBeInTheDocument()
    expect(screen.queryByText('30d, 15d')).not.toBeInTheDocument()
  })

  it('shows a dash when no reminder window has fired yet', () => {
    render(<RenewalTable rows={[row({ firedWindows: [] })]} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('falls back to "Whole family" when the holding has no named member', () => {
    render(<RenewalTable rows={[row({ memberId: null, memberName: null })]} />)
    expect(screen.getByText('Whole family')).toBeInTheDocument()
  })

  it('formats the amount due with Indian digit grouping', () => {
    render(<RenewalTable rows={[row({ amountDue: 1500000 })]} />)
    expect(screen.getByText('₹15,00,000')).toBeInTheDocument()
  })

  it('says so plainly when nothing is due in the window', () => {
    render(<RenewalTable rows={[]} />)
    expect(screen.getByText('No renewals in this window.')).toBeInTheDocument()
  })
})
