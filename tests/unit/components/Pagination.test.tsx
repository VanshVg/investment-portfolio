// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Pagination } from '@/components/ui/Pagination'

const href = (page: number) => `/list?page=${page}`

describe('Pagination', () => {
  it('shows nothing when everything fits on one page', () => {
    const { container } = render(
      <Pagination page={1} pageSize={50} total={50} href={href} label="Families" />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('says which rows are on screen, out of how many, and which page this is', () => {
    render(<Pagination page={2} pageSize={50} total={312} href={href} label="Families" />)
    expect(screen.getByRole('navigation', { name: 'Families pages' })).toBeInTheDocument()
    expect(screen.getByText(/Showing/)).toHaveTextContent('Showing 51–100 of 312')
    expect(screen.getByText('Page 2 of 7')).toBeInTheDocument()
  })

  it('links to the previous and next pages', () => {
    render(<Pagination page={2} pageSize={50} total={312} href={href} label="Families" />)
    const previous = screen.getByRole('link', { name: 'Previous page' })
    expect(previous).toHaveAttribute('href', '/list?page=1')
    expect(screen.getByRole('link', { name: 'Next page' })).toHaveAttribute('href', '/list?page=3')
  })

  it('offers no way back from the first page, and none forward from the last', () => {
    const { unmount } = render(
      <Pagination page={1} pageSize={50} total={120} href={href} label="Families" />,
    )
    expect(screen.queryByRole('link', { name: 'Previous page' })).not.toBeInTheDocument()
    expect(screen.getByText('← Previous')).toHaveAttribute('aria-disabled', 'true')
    unmount()

    render(<Pagination page={3} pageSize={50} total={120} href={href} label="Families" />)
    expect(screen.queryByRole('link', { name: 'Next page' })).not.toBeInTheDocument()
    expect(screen.getByText('Next →')).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText(/Showing/)).toHaveTextContent('Showing 101–120 of 120')
  })
})
