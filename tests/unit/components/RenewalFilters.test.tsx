// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { RenewalFilters } from '@/app/(app)/renewals/_components/RenewalFilters'
import { defaultRange, parseRenewalParams } from '@/app/(app)/renewals/_components/renewal-params'
import type { RenewalFilters as RenewalFilterValues } from '@/lib/queries/renewals'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

function filters(overrides: Partial<RenewalFilterValues> = {}): RenewalFilterValues {
  return { from: '2026-09-14', to: '2026-10-14', page: 1, ...overrides }
}

function lastPushedUrl(): URL {
  const call = push.mock.calls.at(-1)
  if (!call) throw new Error('router.push was never called')
  return new URL(call[0] as string, 'http://localhost')
}

beforeEach(() => {
  push.mockClear()
})

describe('RenewalFilters', () => {
  it('changing managed-by pushes a query string carrying the new value', () => {
    render(<RenewalFilters filters={filters()} families={[]} members={[]} />)
    fireEvent.change(screen.getByLabelText('Managed by'), { target: { value: 'external' } })
    expect(lastPushedUrl().searchParams.get('managedBy')).toBe('external')
  })

  it('choosing "All" for managed-by removes the param rather than sending an empty one', () => {
    render(<RenewalFilters filters={filters({ managedBy: 'self' })} families={[]} members={[]} />)
    fireEvent.change(screen.getByLabelText('Managed by'), { target: { value: '' } })
    expect(lastPushedUrl().searchParams.has('managedBy')).toBe(false)
  })

  it('preserves the existing date range when only managed-by changes', () => {
    render(<RenewalFilters filters={filters()} families={[]} members={[]} />)
    fireEvent.change(screen.getByLabelText('Managed by'), { target: { value: 'self' } })
    const url = lastPushedUrl()
    expect(url.searchParams.get('from')).toBe('2026-09-14')
    expect(url.searchParams.get('to')).toBe('2026-10-14')
  })

  it('clicking a preset sets both from and to, spanning the right number of days', () => {
    render(<RenewalFilters filters={filters()} families={[]} members={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Next 60 days' }))
    const url = lastPushedUrl()
    const from = new Date(url.searchParams.get('from')!)
    const to = new Date(url.searchParams.get('to')!)
    const days = Math.round((to.getTime() - from.getTime()) / 86_400_000)
    expect(days).toBe(60)
  })

  it('a different preset spans a different number of days, not a fixed 60', () => {
    render(<RenewalFilters filters={filters()} families={[]} members={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Next 90 days' }))
    const url = lastPushedUrl()
    const from = new Date(url.searchParams.get('from')!)
    const to = new Date(url.searchParams.get('to')!)
    const days = Math.round((to.getTime() - from.getTime()) / 86_400_000)
    expect(days).toBe(90)
  })

  it('changing family clears any previously selected member', () => {
    render(
      <RenewalFilters
        filters={filters({ familyId: 'family-1', memberId: 'member-1' })}
        families={[
          { id: 'family-1', name: 'Shah family' },
          { id: 'family-2', name: 'Mehta family' },
        ]}
        members={[{ id: 'member-1', name: 'Ramesh' }]}
      />,
    )
    fireEvent.change(screen.getByLabelText('Family'), { target: { value: 'family-2' } })
    const url = lastPushedUrl()
    expect(url.searchParams.get('familyId')).toBe('family-2')
    expect(url.searchParams.has('memberId')).toBe(false)
  })

  it('does not render a member filter until a family is selected', () => {
    render(<RenewalFilters filters={filters()} families={[]} members={[]} />)
    expect(screen.queryByLabelText('Member')).not.toBeInTheDocument()
  })

  it('applying a custom range parses DD-MM-YYYY input into ISO params', () => {
    render(<RenewalFilters filters={filters()} families={[]} members={[]} />)
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '01-11-2026' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '30-11-2026' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    const url = lastPushedUrl()
    expect(url.searchParams.get('from')).toBe('2026-11-01')
    expect(url.searchParams.get('to')).toBe('2026-11-30')
  })

  it('ignores an unparsable custom range rather than navigating with bad data', () => {
    render(<RenewalFilters filters={filters()} families={[]} members={[]} />)
    fireEvent.change(screen.getByLabelText('From'), { target: { value: 'not a date' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(push).not.toHaveBeenCalled()
  })
})

describe('custom range calendar', () => {
  it('fills From from the calendar, and Apply uses what was picked', () => {
    render(<RenewalFilters filters={filters({ from: '2026-09-14', to: '2026-10-14' })} families={[]} members={[]} />)

    // Two date fields, two calendar buttons: the first belongs to From.
    fireEvent.click(screen.getAllByRole('button', { name: 'Open calendar' })[0])
    fireEvent.click(screen.getByRole('button', { name: /September 20th, 2026/ }))
    expect(screen.getByLabelText('From')).toHaveValue('20-09-2026')

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(lastPushedUrl().searchParams.get('from')).toBe('2026-09-20')
    expect(lastPushedUrl().searchParams.get('to')).toBe('2026-10-14')
  })
})

describe('custom range validation', () => {
  it('explains a date that cannot be read, and does not navigate', () => {
    render(<RenewalFilters filters={filters()} families={[]} members={[]} />)
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '31-02-2026' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(screen.getByRole('alert')).toHaveTextContent('From: That date does not exist.')
    expect(push).not.toHaveBeenCalled()
  })

  it('refuses a range that ends before it starts', () => {
    render(<RenewalFilters filters={filters()} families={[]} members={[]} />)
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '30-11-2026' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '01-11-2026' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(screen.getByRole('alert')).toHaveTextContent('From must be on or before To.')
    expect(push).not.toHaveBeenCalled()
  })

  it('asks for both ends of the range', () => {
    render(<RenewalFilters filters={filters()} families={[]} members={[]} />)
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter both dates.')
  })
})

describe('clear filters', () => {
  const clear = () => screen.queryByRole('button', { name: 'Clear filters' })

  it('is not offered when the page is already on its defaults', () => {
    render(<RenewalFilters filters={filters(defaultRange())} families={[]} members={[]} />)
    expect(clear()).not.toBeInTheDocument()
  })

  it('is offered once a scope filter is set, and returns to a bare page with every param gone', () => {
    render(
      <RenewalFilters
        filters={filters({ ...defaultRange(), managedBy: 'external', familyId: 'family-1', memberId: 'member-1' })}
        families={[{ id: 'family-1', name: 'Shah family' }]}
        members={[{ id: 'member-1', name: 'Ramesh' }]}
      />,
    )
    fireEvent.click(clear()!)
    const url = lastPushedUrl()
    expect(url.pathname).toBe('/renewals')
    expect([...url.searchParams.keys()]).toEqual([])
  })

  it('is offered when only the period differs from the default', () => {
    render(<RenewalFilters filters={filters({ from: '2026-01-01', to: '2026-12-31' })} families={[]} members={[]} />)
    expect(clear()).toBeInTheDocument()
  })
})

describe('parseRenewalParams', () => {
  it('defaults to a 30-day window when no range is given', () => {
    const parsed = parseRenewalParams({})
    const from = new Date(parsed.from)
    const to = new Date(parsed.to)
    const days = Math.round((to.getTime() - from.getTime()) / 86_400_000)
    expect(days).toBe(30)
  })

  // The server that renders this page runs in UTC. Between midnight and
  // 05:30 IST the host's own date is still yesterday, and the page must open
  // on the advisor's today, not the server's.
  it('opens on the Indian calendar date, not the host date, just after IST midnight', () => {
    const hostTimeZone = process.env.TZ
    process.env.TZ = 'UTC'
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date('2026-09-19T19:00:00Z')) // 00:30 IST on the 20th
      const parsed = parseRenewalParams({})
      expect(parsed.from).toBe('2026-09-20')
      expect(parsed.to).toBe('2026-10-20')
    } finally {
      vi.useRealTimers()
      if (hostTimeZone === undefined) delete process.env.TZ
      else process.env.TZ = hostTimeZone
    }
  })

  it('keeps an explicit, valid range rather than overriding it with the default', () => {
    const parsed = parseRenewalParams({ from: '2026-01-01', to: '2026-01-10' })
    expect(parsed.from).toBe('2026-01-01')
    expect(parsed.to).toBe('2026-01-10')
  })

  it('falls back to the default range on a malformed date', () => {
    const parsed = parseRenewalParams({ from: 'not-a-date', to: '2026-99-99' })
    expect(parsed.from).not.toBe('not-a-date')
    expect(parsed.to).not.toBe('2026-99-99')
  })

  it('rejects a managedBy value the enum does not contain', () => {
    expect(parseRenewalParams({ managedBy: 'both' }).managedBy).toBeUndefined()
  })

  it('accepts a valid managedBy value', () => {
    expect(parseRenewalParams({ managedBy: 'external' }).managedBy).toBe('external')
  })

  it('defaults to page 1 for a missing or non-numeric page param', () => {
    expect(parseRenewalParams({}).page).toBe(1)
    expect(parseRenewalParams({ page: 'two' }).page).toBe(1)
  })

  it('carries through a valid page number', () => {
    expect(parseRenewalParams({ page: '3' }).page).toBe(3)
  })
})
