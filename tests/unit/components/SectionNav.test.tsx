// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SectionNav } from '@/app/(app)/families/[familyId]/_components/SectionNav'

describe('SectionNav', () => {
  it('links to every section anchor', () => {
    render(<SectionNav counts={{ members: 3, life: 2, general: 1, mutual: 4, fixed: 0 }} />)
    expect(screen.getByRole('link', { name: /Members/ })).toHaveAttribute('href', '#members')
    expect(screen.getByRole('link', { name: /Life insurance/ })).toHaveAttribute('href', '#life')
    expect(screen.getByRole('link', { name: /Fixed income/ })).toHaveAttribute('href', '#fixed')
  })

  it('shows how many records each section holds', () => {
    render(<SectionNav counts={{ members: 3, life: 2, general: 1, mutual: 4, fixed: 0 }} />)
    expect(screen.getByRole('link', { name: /Members/ })).toHaveTextContent('3')
    expect(screen.getByRole('link', { name: /Fixed income/ })).toHaveTextContent('0')
  })
})
