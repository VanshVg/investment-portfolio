/** One page of a longer list, and enough to say where it sits in the whole. */
export interface Page<T> {
  rows: T[]
  /** Matching rows across every page. */
  total: number
  /** 1-based; the page actually served, which may be earlier than the one asked for. */
  page: number
  pageSize: number
}

/** A `?page=` value as a page number. Anything that is not a positive whole number is page 1. */
export function parsePage(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value)) return 1
  const page = Number(value)
  return page >= 1 ? page : 1
}

export function lastPage(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize))
}

/**
 * Pages a list already in memory. Used where a filter runs after the query
 * (overdue rows drop periods renewed past, which PostgREST cannot express),
 * so the database's own count would be wrong.
 */
export function paginate<T>(items: T[], requested: number, pageSize: number): Page<T> {
  const page = Math.min(Math.max(1, requested), lastPage(items.length, pageSize))
  const start = (page - 1) * pageSize
  return { rows: items.slice(start, start + pageSize), total: items.length, page, pageSize }
}

interface RangeResult<Row> {
  data: Row[] | null
  count: number | null
  error: { code?: string; message: string } | null
}

/**
 * Runs a query for one page. `run` builds the query afresh for a row range
 * (`from`–`to`, inclusive) with `{ count: 'exact' }`.
 *
 * PostgREST refuses a range starting past the last row (416, PGRST103)
 * instead of returning an empty page. That happens whenever an address
 * outlives the rows behind it — a bookmark, or the last row of the last page
 * deleted — and showing an error for it would be absurd: the last page that
 * exists is served instead.
 */
export async function fetchPage<Row>(
  run: (from: number, to: number) => PromiseLike<RangeResult<Row>>,
  requested: number,
  pageSize: number,
): Promise<Page<Row>> {
  let page = Math.max(1, requested)
  let result = await run((page - 1) * pageSize, page * pageSize - 1)

  if (result.error?.code === 'PGRST103') {
    const first = await run(0, pageSize - 1)
    if (first.error) throw new Error(first.error.message)
    page = lastPage(first.count ?? 0, pageSize)
    result = page === 1 ? first : await run((page - 1) * pageSize, page * pageSize - 1)
  }
  if (result.error) throw new Error(result.error.message)

  const rows = result.data ?? []
  return { rows, total: result.count ?? rows.length, page, pageSize }
}

/**
 * The address of one section's page, keeping every other parameter — a
 * filter or another section's page that reset on paging would be worse than
 * no paging. Page 1 drops the parameter, so the first page keeps the plain
 * address. `anchor` lands the reader on the section they were paging.
 */
export function pageHref(
  path: string,
  params: Record<string, string | undefined>,
  key: string,
  page: number,
  anchor?: string,
): string {
  const query = new URLSearchParams()
  for (const [name, value] of Object.entries(params)) {
    if (value && name !== key) query.set(name, value)
  }
  if (page > 1) query.set(key, String(page))
  const search = query.toString()
  return `${path}${search ? `?${search}` : ''}${anchor ? `#${anchor}` : ''}`
}
