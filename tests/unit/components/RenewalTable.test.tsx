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

type ActionResult = { ok: true; id: string } | { ok: false; formError?: string }

function renderTable(
  rows: RenewalRow[],
  setPaymentStatus: (
    dueInstanceId: string,
    status: RenewalRow['paymentStatus'],
  ) => Promise<ActionResult> = vi.fn(async () => ({ ok: true, id: 'x' })),
  markRenewed: (dueInstanceId: string) => Promise<ActionResult> = vi.fn(async () => ({
    ok: true,
    id: 'x',
  })),
) {
  return render(
    <RenewalTable rows={rows} setPaymentStatus={setPaymentStatus} markRenewed={markRenewed} />,
  )
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
    it('names the control with the holding, family, member and due date, not a bare "Payment status"', () => {
      renderTable([row({ label: 'Term plan', dueDate: '2026-10-01' })])
      expect(
        screen.getByRole('combobox', {
          name: 'Payment status for Term plan, Shah family (Ramesh Shah), due 01-10-2026',
        }),
      ).toBeInTheDocument()
    })

    // The scoping requirement in full: a recurring holding produces more than
    // one row with the same label, so the label alone is not enough to tell
    // two rows' controls apart — only the full description including the due
    // date is. (Cross-family and cross-member collisions are covered above.)
    it('gives two rows sharing a label but different due dates two distinct accessible names', () => {
      renderTable([
        row({ dueInstanceId: 'a', label: 'LIC Jeevan Umang', dueDate: '2026-10-01' }),
        row({ dueInstanceId: 'b', label: 'LIC Jeevan Umang', dueDate: '2027-10-01' }),
      ])
      expect(
        screen.getByRole('combobox', {
          name: 'Payment status for LIC Jeevan Umang, Shah family (Ramesh Shah), due 01-10-2026',
        }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('combobox', {
          name: 'Payment status for LIC Jeevan Umang, Shah family (Ramesh Shah), due 01-10-2027',
        }),
      ).toBeInTheDocument()
    })

    it('names a whole-family holding accordingly, not with a blank or null member', () => {
      renderTable([row({ label: 'Family health floater', memberId: null, memberName: null })])
      expect(
        screen.getByRole('combobox', {
          name: 'Payment status for Family health floater, Shah family (whole family), due 01-10-2026',
        }),
      ).toBeInTheDocument()
    })

    it('reflects the row\'s starting payment status', () => {
      renderTable([row({ paymentStatus: 'paid' })])
      const select = screen.getByRole('combobox', {
        name: 'Payment status for HDFC Life Click2Protect, Shah family (Ramesh Shah), due 01-10-2026',
      }) as HTMLSelectElement
      expect(select.value).toBe('paid')
    })

    // Regression: mark-renewed writes payment_status through a different
    // control on the same row. Next.js's own refresh after a server action
    // patches `rows` with the new value, but this component previously read
    // `row.paymentStatus` only into a `useState` initializer, which React
    // does not re-run on a later render -- so the row's own tick kept
    // showing the value it had when this control first mounted, not the
    // value the row now carries. This is the defect a code review caught
    // between rounds: found only by simulating the actual re-render a
    // server-action refresh produces, which every other test here skips by
    // rendering once and reading straight off the initial props.
    it('picks up a payment status written by something other than its own control, on the same rendered row', () => {
      const testRow = row({ dueInstanceId: 'instance-1', paymentStatus: 'unknown' })
      const view = renderTable([testRow])

      expect(
        (
          screen.getByRole('combobox', {
            name: 'Payment status for HDFC Life Click2Protect, Shah family (Ramesh Shah), due 01-10-2026',
          }) as HTMLSelectElement
        ).value,
      ).toBe('unknown')

      // Same props object shape, only the server-owned field changed -- exactly
      // what a revalidated `rows` array looks like after markRenewed runs.
      view.rerender(
        <RenewalTable
          rows={[{ ...testRow, paymentStatus: 'paid' }]}
          setPaymentStatus={vi.fn(async () => ({ ok: true as const, id: 'instance-1' }))}
          markRenewed={vi.fn(async () => ({ ok: true as const, id: 'instance-1' }))}
        />,
      )

      const select = screen.getByRole('combobox', {
        name: 'Payment status for HDFC Life Click2Protect, Shah family (Ramesh Shah), due 01-10-2026',
      }) as HTMLSelectElement
      expect(select.value).toBe('paid')
    })

    // Regression: PaymentStatusControl used to be keyed on row.paymentStatus
    // so it would remount and pick up a server-driven change. But
    // setPaymentStatus's own revalidatePath call refreshes every row's props
    // from the server after ANY successful write on the page, including the
    // advisor's own -- so that key changed, and the control remounted, right
    // after the advisor's own click. A plain render-and-await (no rerender)
    // can't reproduce that: nothing in this harness updates `rows` on its
    // own, same as production, where the remount only happens once
    // revalidatePath's refetch actually lands. The `rerender` below is that
    // landing, simulated. useOptimistic must show the same DOM node -- and
    // keep its focus -- straight through it.
    it('keeps focus on the select after a successful change', async () => {
      const setPaymentStatus = vi.fn(async () => ({ ok: true as const, id: 'instance-1' }))
      const testRow = row({ dueInstanceId: 'instance-1', paymentStatus: 'unknown' })
      const view = renderTable([testRow], setPaymentStatus)

      const select = screen.getByRole('combobox', {
        name: 'Payment status for HDFC Life Click2Protect, Shah family (Ramesh Shah), due 01-10-2026',
      }) as HTMLSelectElement
      select.focus()
      expect(select).toHaveFocus()

      fireEvent.change(select, { target: { value: 'paid' } })

      await waitFor(() => expect(setPaymentStatus).toHaveBeenCalledWith('instance-1', 'paid'))

      // The revalidate-driven refetch landing: same shape of props change the
      // stale-state regression test above uses, applied to the row this
      // control's own change just saved.
      view.rerender(
        <RenewalTable
          rows={[{ ...testRow, paymentStatus: 'paid' }]}
          setPaymentStatus={setPaymentStatus}
          markRenewed={vi.fn(async () => ({ ok: true as const, id: 'instance-1' }))}
        />,
      )

      // Not merely a same-looking select -- the exact DOM node must still be
      // the focused element. A key-based remount swaps in a new node here.
      expect(document.activeElement).toBe(select)
      expect(select).toHaveFocus()
    })

    it('calls the action with the due instance id and the newly chosen status', async () => {
      const setPaymentStatus = vi.fn(async () => ({ ok: true as const, id: 'instance-1' }))
      renderTable([row({ dueInstanceId: 'instance-1', paymentStatus: 'unknown' })], setPaymentStatus)

      fireEvent.change(
        screen.getByRole('combobox', {
          name: 'Payment status for HDFC Life Click2Protect, Shah family (Ramesh Shah), due 01-10-2026',
        }),
        { target: { value: 'paid' } },
      )

      await waitFor(() => expect(setPaymentStatus).toHaveBeenCalledWith('instance-1', 'paid'))
    })

    // The `if (pending) return` guard at the top of onChange is what makes a
    // second, overlapping save unreachable now -- it used to be the native
    // `disabled` attribute's job, before that was removed because disabling
    // a focused select blurs it with no way back (see the focus-retention
    // test above). Nothing else in this file exercises the guard itself: a
    // future edit could delete that one line and every other test here would
    // still pass.
    it('ignores a second change fired while the first save for this control is still pending', async () => {
      let resolveFirst: (value: ActionResult) => void = () => {}
      const firstPromise = new Promise<ActionResult>((resolve) => {
        resolveFirst = resolve
      })
      const setPaymentStatus = vi.fn(() => firstPromise)
      renderTable([row({ dueInstanceId: 'instance-1', paymentStatus: 'unknown' })], setPaymentStatus)

      const select = screen.getByRole('combobox', {
        name: 'Payment status for HDFC Life Click2Protect, Shah family (Ramesh Shah), due 01-10-2026',
      }) as HTMLSelectElement

      fireEvent.change(select, { target: { value: 'paid' } })
      await waitFor(() => expect(setPaymentStatus).toHaveBeenCalledTimes(1))
      expect(select).toHaveAttribute('aria-busy', 'true')

      // A different choice while the first save is still in flight -- the
      // guard must ignore this rather than starting a second, overlapping
      // save.
      fireEvent.change(select, { target: { value: 'unpaid' } })

      expect(setPaymentStatus).toHaveBeenCalledTimes(1)
      expect(setPaymentStatus).toHaveBeenCalledWith('instance-1', 'paid')
      expect(select.value).toBe('paid')

      resolveFirst({ ok: true, id: 'instance-1' })
      await waitFor(() => expect(select).toHaveAttribute('aria-busy', 'false'))
      expect(setPaymentStatus).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
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
        name: 'Payment status for HDFC Life Click2Protect, Shah family (Ramesh Shah), due 01-10-2026',
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

  describe('accessible-name collisions across families and members (defect check)', () => {
    // The renewals page's default view spans every family it tracks, so a
    // holding label plus a due date is not a safe row identifier: two
    // different families can each hold a policy with the same label due the
    // same day. This must produce two distinct names for BOTH controls, not
    // one name that both rows share.
    it('gives two rows sharing a label and due date but different families distinct names, for both controls', () => {
      renderTable([
        row({
          dueInstanceId: 'a',
          label: 'LIC Jeevan Umang',
          dueDate: '2026-10-01',
          familyId: 'family-shah',
          familyName: 'Shah family',
          memberId: 'member-1',
          memberName: 'Ramesh Shah',
        }),
        row({
          dueInstanceId: 'b',
          label: 'LIC Jeevan Umang',
          dueDate: '2026-10-01',
          familyId: 'family-mehta',
          familyName: 'Mehta family',
          memberId: 'member-2',
          memberName: 'Sunita Mehta',
        }),
      ])

      expect(
        screen.getByRole('combobox', {
          name: 'Payment status for LIC Jeevan Umang, Shah family (Ramesh Shah), due 01-10-2026',
        }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('combobox', {
          name: 'Payment status for LIC Jeevan Umang, Mehta family (Sunita Mehta), due 01-10-2026',
        }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', {
          name: 'Mark renewed for LIC Jeevan Umang, Shah family (Ramesh Shah), due 01-10-2026',
        }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', {
          name: 'Mark renewed for LIC Jeevan Umang, Mehta family (Sunita Mehta), due 01-10-2026',
        }),
      ).toBeInTheDocument()
    })

    // Same family, same label, same date -- only the member differs. A
    // household with two adult children each holding an identically labelled
    // plan due the same day produces exactly this.
    it('gives two rows sharing a family, label and due date but different members distinct names, for both controls', () => {
      renderTable([
        row({
          dueInstanceId: 'a',
          label: 'HDFC Life Click2Protect',
          dueDate: '2026-10-01',
          familyId: 'family-shah',
          familyName: 'Shah family',
          memberId: 'member-1',
          memberName: 'Aarav Shah',
        }),
        row({
          dueInstanceId: 'b',
          label: 'HDFC Life Click2Protect',
          dueDate: '2026-10-01',
          familyId: 'family-shah',
          familyName: 'Shah family',
          memberId: 'member-2',
          memberName: 'Diya Shah',
        }),
      ])

      expect(
        screen.getByRole('combobox', {
          name: 'Payment status for HDFC Life Click2Protect, Shah family (Aarav Shah), due 01-10-2026',
        }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('combobox', {
          name: 'Payment status for HDFC Life Click2Protect, Shah family (Diya Shah), due 01-10-2026',
        }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', {
          name: 'Mark renewed for HDFC Life Click2Protect, Shah family (Aarav Shah), due 01-10-2026',
        }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', {
          name: 'Mark renewed for HDFC Life Click2Protect, Shah family (Diya Shah), due 01-10-2026',
        }),
      ).toBeInTheDocument()
    })

    // A whole-family holding (memberId/memberName null) and a named member's
    // holding, same family, same label, same due date -- the "(whole
    // family)" vs "(Ramesh Shah)" segment is the only thing that can tell
    // these two rows' controls apart. Not covered above: every other case
    // there pairs two named members or two families, never a null member
    // against a named one.
    it('gives a whole-family row and a named-member row of the same family, label and date distinct names, for both controls', () => {
      renderTable([
        row({
          dueInstanceId: 'a',
          label: 'Family health floater',
          dueDate: '2026-10-01',
          familyId: 'family-shah',
          familyName: 'Shah family',
          memberId: null,
          memberName: null,
        }),
        row({
          dueInstanceId: 'b',
          label: 'Family health floater',
          dueDate: '2026-10-01',
          familyId: 'family-shah',
          familyName: 'Shah family',
          memberId: 'member-1',
          memberName: 'Ramesh Shah',
        }),
      ])

      expect(
        screen.getByRole('combobox', {
          name: 'Payment status for Family health floater, Shah family (whole family), due 01-10-2026',
        }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('combobox', {
          name: 'Payment status for Family health floater, Shah family (Ramesh Shah), due 01-10-2026',
        }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', {
          name: 'Mark renewed for Family health floater, Shah family (whole family), due 01-10-2026',
        }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', {
          name: 'Mark renewed for Family health floater, Shah family (Ramesh Shah), due 01-10-2026',
        }),
      ).toBeInTheDocument()
    })
  })

  describe('mark renewed control', () => {
    it('names the control with the holding, family, member and due date, not a bare "Mark renewed"', () => {
      renderTable([row({ label: 'Term plan', dueDate: '2026-10-01' })])
      expect(
        screen.getByRole('button', {
          name: 'Mark renewed for Term plan, Shah family (Ramesh Shah), due 01-10-2026',
        }),
      ).toBeInTheDocument()
    })

    it('gives two rows sharing a label but different due dates two distinct accessible names', () => {
      renderTable([
        row({ dueInstanceId: 'a', label: 'LIC Jeevan Umang', dueDate: '2026-10-01' }),
        row({ dueInstanceId: 'b', label: 'LIC Jeevan Umang', dueDate: '2027-10-01' }),
      ])
      expect(
        screen.getByRole('button', {
          name: 'Mark renewed for LIC Jeevan Umang, Shah family (Ramesh Shah), due 01-10-2026',
        }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', {
          name: 'Mark renewed for LIC Jeevan Umang, Shah family (Ramesh Shah), due 01-10-2027',
        }),
      ).toBeInTheDocument()
    })

    it('is not offered on a one_time holding, which has no next period', () => {
      renderTable([row({ label: 'Matured FD', dueDate: '2026-10-01', dueFrequency: 'one_time' })])
      expect(
        screen.queryByRole('button', {
          name: 'Mark renewed for Matured FD, Shah family (Ramesh Shah), due 01-10-2026',
        }),
      ).not.toBeInTheDocument()
    })

    it('calls the action with the due instance id', async () => {
      const markRenewed = vi.fn(async () => ({ ok: true as const, id: 'instance-1' }))
      renderTable(
        [row({ dueInstanceId: 'instance-1', label: 'Term plan', dueDate: '2026-10-01' })],
        undefined,
        markRenewed,
      )

      fireEvent.click(
        screen.getByRole('button', {
          name: 'Mark renewed for Term plan, Shah family (Ramesh Shah), due 01-10-2026',
        }),
      )

      await waitFor(() => expect(markRenewed).toHaveBeenCalledWith('instance-1'))
    })

    it('shows an error when the write fails', async () => {
      const markRenewed = vi.fn(async () => ({
        ok: false as const,
        formError: 'This record has a single maturity date and does not renew. Record the payment instead.',
      }))
      renderTable(
        [row({ label: 'Term plan', dueDate: '2026-10-01' })],
        undefined,
        markRenewed,
      )

      fireEvent.click(
        screen.getByRole('button', {
          name: 'Mark renewed for Term plan, Shah family (Ramesh Shah), due 01-10-2026',
        }),
      )

      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(
          'This record has a single maturity date and does not renew. Record the payment instead.',
        ),
      )
    })
  })
})
