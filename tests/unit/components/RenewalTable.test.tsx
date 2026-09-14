// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

function renderTable(
  rows: RenewalRow[],
  setPaymentStatus: (
    dueInstanceId: string,
    status: RenewalRow['paymentStatus'],
  ) => Promise<{ ok: true; id: string } | { ok: false; formError?: string }> = vi.fn(async () => ({
    ok: true,
    id: 'x',
  })),
) {
  return render(<RenewalTable rows={rows} setPaymentStatus={setPaymentStatus} />)
}

describe('RenewalTable', () => {
  it('renders the due date in the Indian DD-MM-YYYY format', () => {
    renderTable([row({ dueDate: '2026-10-01' })])
    expect(screen.getByText('01-10-2026')).toBeInTheDocument()
  })

  it('renders a different date correctly too, not a hardcoded string', () => {
    renderTable([row({ dueDate: '2026-01-05' })])
    expect(screen.getByText('05-01-2026')).toBeInTheDocument()
  })

  it('renders one row per due instance passed in', () => {
    renderTable([
      row({ dueInstanceId: 'a', label: 'Term plan' }),
      row({ dueInstanceId: 'b', label: 'Health cover' }),
    ])
    expect(screen.getByText('Term plan')).toBeInTheDocument()
    expect(screen.getByText('Health cover')).toBeInTheDocument()
    expect(screen.queryByText('No renewals in this window.')).not.toBeInTheDocument()
  })

  it('marks an externally managed holding distinctly from one managed here', () => {
    renderTable([row({ managedBy: 'external' })])
    expect(screen.getByText('External')).toBeInTheDocument()
  })

  it('marks a self-managed holding as with us, not external', () => {
    renderTable([row({ managedBy: 'self' })])
    expect(screen.getByText('With us')).toBeInTheDocument()
    expect(screen.queryByText('External')).not.toBeInTheDocument()
  })

  it('flags an off-schedule instance', () => {
    renderTable([row({ offSchedule: true })])
    expect(screen.getByText('Off schedule')).toBeInTheDocument()
  })

  it('does not flag an on-schedule instance', () => {
    renderTable([row({ offSchedule: false })])
    expect(screen.queryByText('Off schedule')).not.toBeInTheDocument()
  })

  it('shows which reminder windows have been queued', () => {
    renderTable([row({ firedWindows: [30, 15] })])
    expect(screen.getByText('30d, 15d')).toBeInTheDocument()
  })

  it('reflects the actual windows passed in, not a fixed pair', () => {
    renderTable([row({ firedWindows: [60, 45] })])
    expect(screen.getByText('60d, 45d')).toBeInTheDocument()
    expect(screen.queryByText('30d, 15d')).not.toBeInTheDocument()
  })

  it('shows a dash when no reminder window has fired yet', () => {
    renderTable([row({ firedWindows: [] })])
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('falls back to "Whole family" when the holding has no named member', () => {
    renderTable([row({ memberId: null, memberName: null })])
    expect(screen.getByText('Whole family')).toBeInTheDocument()
  })

  it('formats the amount due with Indian digit grouping', () => {
    renderTable([row({ amountDue: 1500000 })])
    expect(screen.getByText('₹15,00,000')).toBeInTheDocument()
  })

  it('says so plainly when nothing is due in the window', () => {
    renderTable([])
    expect(screen.getByText('No renewals in this window.')).toBeInTheDocument()
  })

  describe('payment status control', () => {
    it('names the control with the holding label and due date, not a bare "Payment status"', () => {
      renderTable([row({ label: 'Term plan', dueDate: '2026-10-01' })])
      expect(
        screen.getByRole('combobox', { name: 'Payment status for Term plan, due 01-10-2026' }),
      ).toBeInTheDocument()
    })

    // The scoping requirement in full: a recurring holding produces more than
    // one row with the same label, so the label alone is not enough to tell
    // two rows' controls apart — only the label plus the due date is.
    it('gives two rows sharing a label but different due dates two distinct accessible names', () => {
      renderTable([
        row({ dueInstanceId: 'a', label: 'LIC Jeevan Umang', dueDate: '2026-10-01' }),
        row({ dueInstanceId: 'b', label: 'LIC Jeevan Umang', dueDate: '2027-10-01' }),
      ])
      expect(
        screen.getByRole('combobox', { name: 'Payment status for LIC Jeevan Umang, due 01-10-2026' }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('combobox', { name: 'Payment status for LIC Jeevan Umang, due 01-10-2027' }),
      ).toBeInTheDocument()
    })

    it('reflects the row\'s starting payment status', () => {
      renderTable([row({ paymentStatus: 'paid' })])
      const select = screen.getByRole('combobox', {
        name: 'Payment status for HDFC Life Click2Protect, due 01-10-2026',
      }) as HTMLSelectElement
      expect(select.value).toBe('paid')
    })

    it('calls the action with the due instance id and the newly chosen status', async () => {
      const setPaymentStatus = vi.fn(async () => ({ ok: true as const, id: 'instance-1' }))
      renderTable([row({ dueInstanceId: 'instance-1', paymentStatus: 'unknown' })], setPaymentStatus)

      fireEvent.change(
        screen.getByRole('combobox', {
          name: 'Payment status for HDFC Life Click2Protect, due 01-10-2026',
        }),
        { target: { value: 'paid' } },
      )

      await waitFor(() => expect(setPaymentStatus).toHaveBeenCalledWith('instance-1', 'paid'))
    })

    // Optimistic update, rolled back — a control that kept showing "Paid"
    // after the write actually failed would make the database wrong without
    // anything on screen saying so.
    it('reverts to the previous value and shows an error when the write fails', async () => {
      const setPaymentStatus = vi.fn(async () => ({
        ok: false as const,
        formError: 'That record could not be saved. It may have changed or been removed — refresh and try again.',
      }))
      renderTable([row({ paymentStatus: 'unknown' })], setPaymentStatus)

      const select = screen.getByRole('combobox', {
        name: 'Payment status for HDFC Life Click2Protect, due 01-10-2026',
      }) as HTMLSelectElement

      fireEvent.change(select, { target: { value: 'paid' } })

      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(
          'That record could not be saved. It may have changed or been removed — refresh and try again.',
        ),
      )
      expect(select.value).toBe('unknown')
    })
  })
})
