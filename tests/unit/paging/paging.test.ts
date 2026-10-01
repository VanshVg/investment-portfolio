import { describe, expect, it, vi } from 'vitest'
import { fetchPage, pageHref, paginate, parsePage } from '@/lib/queries/paging'

describe('parsePage', () => {
  it('reads a positive whole number', () => {
    expect(parsePage('3')).toBe(3)
  })

  it.each([undefined, '', '0', '-2', '1.5', 'abc', '2abc'])('falls back to 1 for %j', (value) => {
    expect(parsePage(value)).toBe(1)
  })
})

describe('paginate', () => {
  const items = Array.from({ length: 7 }, (_, i) => i + 1)

  it('returns the requested slice with the total', () => {
    expect(paginate(items, 2, 3)).toEqual({ rows: [4, 5, 6], total: 7, page: 2, pageSize: 3 })
  })

  it('serves the last page for a page past the end', () => {
    expect(paginate(items, 9, 3)).toEqual({ rows: [7], total: 7, page: 3, pageSize: 3 })
  })

  it('is page 1 of nothing when empty', () => {
    expect(paginate([], 4, 3)).toEqual({ rows: [], total: 0, page: 1, pageSize: 3 })
  })
})

describe('fetchPage', () => {
  /** A stand-in for a PostgREST query over `total` rows, honouring its range rules. */
  function table(total: number) {
    return vi.fn(async (from: number, to: number) => {
      if (from > 0 && from >= total) {
        return { data: null, count: null, error: { code: 'PGRST103', message: 'Range' } }
      }
      const length = Math.max(0, Math.min(to, total - 1) - from + 1)
      const rows = Array.from({ length }, (_, i) => from + i)
      return { data: rows, count: total, error: null }
    })
  }

  it('asks for the page’s range and reports the total', async () => {
    const run = table(120)
    const result = await fetchPage(run, 2, 50)
    expect(run).toHaveBeenCalledWith(50, 99)
    expect(result).toMatchObject({ total: 120, page: 2, pageSize: 50 })
    expect(result.rows).toHaveLength(50)
  })

  it('serves the last page when asked for one past the end', async () => {
    const result = await fetchPage(table(120), 9, 50)
    expect(result).toMatchObject({ total: 120, page: 3 })
    expect(result.rows).toEqual(Array.from({ length: 20 }, (_, i) => 100 + i))
  })

  it('serves page 1 when everything fits on it', async () => {
    const result = await fetchPage(table(10), 5, 50)
    expect(result).toMatchObject({ total: 10, page: 1 })
    expect(result.rows).toHaveLength(10)
  })

  it('throws any other error', async () => {
    const run = vi.fn(async () => ({
      data: null,
      count: null,
      error: { code: '42P01', message: 'boom' },
    }))
    await expect(fetchPage(run, 1, 50)).rejects.toThrow('boom')
  })
})

describe('pageHref', () => {
  it('sets one section’s page and keeps every other parameter', () => {
    expect(pageHref('/messages', { recentPage: '2', q: 'x' }, 'repliesPage', 3)).toBe(
      '/messages?recentPage=2&q=x&repliesPage=3',
    )
  })

  it('drops the parameter for page 1, so the first page has the plain address', () => {
    expect(pageHref('/families', { q: 'shah', page: '4' }, 'page', 1)).toBe('/families?q=shah')
    expect(pageHref('/families', {}, 'page', 1)).toBe('/families')
  })

  it('jumps to the section it belongs to', () => {
    expect(pageHref('/messages', {}, 'recentPage', 2, 'recent')).toBe(
      '/messages?recentPage=2#recent',
    )
  })

  it('ignores empty parameters', () => {
    expect(pageHref('/renewals', { from: '', to: '2027-01-01' }, 'page', 2)).toBe(
      '/renewals?to=2027-01-01&page=2',
    )
  })
})
