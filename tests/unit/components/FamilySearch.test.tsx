// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { FamilySearch, SEARCH_DEBOUNCE_MS } from '@/app/(app)/families/_components/FamilySearch'

const replace = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}))

beforeEach(() => {
  replace.mockClear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function type(value: string) {
  fireEvent.change(screen.getByLabelText('Search families'), { target: { value } })
}

describe('FamilySearch', () => {
  it('searches once typing pauses, without waiting for Enter', () => {
    render(<FamilySearch />)
    type('Pat')
    expect(replace).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS))
    expect(replace).toHaveBeenCalledWith('/families?q=Pat')
  })

  it('sends only the last value when keys arrive faster than the pause', () => {
    render(<FamilySearch />)
    type('P')
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS / 2))
    type('Pa')
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS / 2))
    type('Pat')
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS))

    expect(replace).toHaveBeenCalledTimes(1)
    expect(replace).toHaveBeenCalledWith('/families?q=Pat')
  })

  it('returns to the full list when the box is emptied', () => {
    render(<FamilySearch search="Pat" />)
    type('')
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS))
    expect(replace).toHaveBeenCalledWith('/families')
  })

  it('searches straight away on Enter, and does not search again when the timer runs out', () => {
    render(<FamilySearch />)
    type('Shah')
    fireEvent.submit(screen.getByRole('search'))
    expect(replace).toHaveBeenCalledWith('/families?q=Shah')

    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS))
    expect(replace).toHaveBeenCalledTimes(1)
  })

  it('encodes what was typed rather than pasting it into the URL raw', () => {
    render(<FamilySearch />)
    type('Patel & Sons')
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS))
    expect(replace).toHaveBeenCalledWith('/families?q=Patel+%26+Sons')
  })

  it('does not search when only surrounding spaces changed', () => {
    render(<FamilySearch search="Pat" />)
    type('Pat ')
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS))
    expect(replace).not.toHaveBeenCalled()
  })

  it('empties the box when the search is cleared from outside, e.g. the Clear search link', () => {
    const { rerender } = render(<FamilySearch search="Pat" />)
    expect(screen.getByLabelText('Search families')).toHaveValue('Pat')
    rerender(<FamilySearch search={undefined} />)
    expect(screen.getByLabelText('Search families')).toHaveValue('')
  })

  it('keeps what is being typed when the results for an earlier value arrive', () => {
    const { rerender } = render(<FamilySearch />)
    type('Pa')
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS))
    type('Pate')
    // The page re-renders with the search that was sent, while the advisor
    // has already typed further. Their newer text must survive it.
    rerender(<FamilySearch search="Pa" />)
    expect(screen.getByLabelText('Search families')).toHaveValue('Pate')
  })

  it('offers a clear button only when there is text to clear', () => {
    render(<FamilySearch />)
    expect(screen.queryByRole('button', { name: 'Clear search text' })).not.toBeInTheDocument()
    type('Pat')
    expect(screen.getByRole('button', { name: 'Clear search text' })).toBeInTheDocument()
  })

  it('clearing empties the box, shows every family at once, and keeps the cursor in the box', () => {
    render(<FamilySearch search="Pat" />)
    fireEvent.click(screen.getByRole('button', { name: 'Clear search text' }))

    const box = screen.getByLabelText('Search families')
    expect(box).toHaveValue('')
    expect(replace).toHaveBeenCalledWith('/families')
    expect(box).toHaveFocus()
  })
})
