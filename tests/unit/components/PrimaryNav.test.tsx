// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PrimaryNav } from '@/components/ui/PrimaryNav'

let pathname = '/families'

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
}))

beforeEach(() => {
  pathname = '/families'
})

function link(name: string) {
  // A string name is matched exactly by Testing Library, unlike Playwright.
  return screen.getByRole('link', { name })
}

describe('PrimaryNav', () => {
  it('links to every section, starting with the families list that is home', () => {
    render(<PrimaryNav />)
    const links = screen.getAllByRole('link')
    expect(links.map((a) => a.textContent)).toEqual(['Families', 'Renewals', 'Settings'])
    expect(link('Families')).toHaveAttribute('href', '/families')
    expect(link('Renewals')).toHaveAttribute('href', '/renewals')
    expect(link('Settings')).toHaveAttribute('href', '/settings/reminders')
  })

  it('marks the section being viewed as the current page, and only that one', () => {
    pathname = '/renewals'
    render(<PrimaryNav />)
    expect(link('Renewals')).toHaveAttribute('aria-current', 'page')
    expect(link('Families')).not.toHaveAttribute('aria-current')
    expect(link('Settings')).not.toHaveAttribute('aria-current')
  })

  it('treats a single family workspace as part of the families section', () => {
    pathname = '/families/7b2c1f0e-0000-4000-8000-000000000000'
    render(<PrimaryNav />)
    expect(link('Families')).toHaveAttribute('aria-current', 'page')
  })

  it('does not mistake a path that merely shares a prefix for the section', () => {
    pathname = '/renewals-archive'
    render(<PrimaryNav />)
    expect(link('Renewals')).not.toHaveAttribute('aria-current')
  })
})
