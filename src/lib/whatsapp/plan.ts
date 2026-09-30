export interface Candidate {
  id: string
  dueInstanceId: string
  daysBefore: number
  recipientType: 'advisor' | 'client'
}

/** A bug must not be able to message the whole client book in one morning. */
export const CLIENT_CAP_PER_RUN = 200

/**
 * One message per due date per recipient. Several windows can be pending at
 * once for the same due date — a missed daily run, or the backlog waiting
 * when WhatsApp is first switched on — and sending all of them would give a
 * client two reminders about one policy on the same morning. Only the latest
 * window (the fewest days before) is kept; the others are superseded by it.
 */
export function collapseCatchUp<T extends Candidate>(rows: T[]): { keep: T[]; superseded: T[] } {
  const latest = new Map<string, T>()
  for (const row of rows) {
    const key = `${row.dueInstanceId}:${row.recipientType}`
    const current = latest.get(key)
    if (!current || row.daysBefore < current.daysBefore) latest.set(key, row)
  }
  const kept = new Set(latest.values())
  return {
    keep: rows.filter((row) => kept.has(row)),
    superseded: rows.filter((row) => !kept.has(row)),
  }
}

/** What goes now and what waits for the next run. */
export function applyCap<T>(rows: T[], cap: number): { now: T[]; deferred: T[] } {
  return { now: rows.slice(0, cap), deferred: rows.slice(cap) }
}
