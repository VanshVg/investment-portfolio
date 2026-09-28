import { beforeEach, describe, expect, it, vi } from 'vitest'
import { todayInIndia } from '@/lib/domain/dates'

// This handler is the one route in the app that holds a client bypassing
// row-level security. Its two collaborators — reconciliation and the sweep —
// each have their own exhaustive suites against the live database
// (reconcile-due-instances.test.ts, ensure-due-instances.test.ts,
// sweep.test.ts). Mocking both here, along with the admin client's own
// holdings read, keeps this suite to what the route itself is responsible
// for: the secret gate, calling each collaborator the right number of times
// with the right arguments, and shaping the response. None of that touches
// the live database, so this suite cannot race another suite's fixtures or
// mutate the seeded household — the failure mode this file used to have.
const { mockReconcileDueInstances, mockRunReminderSweep } = vi.hoisted(() => ({
  mockReconcileDueInstances: vi.fn(),
  mockRunReminderSweep: vi.fn(),
}))

const FAKE_HOLDING_IDS = ['fixture-holding-a', 'fixture-holding-b', 'fixture-holding-c']

vi.mock('@/lib/reminders/reconcile', () => ({
  reconcileDueInstances: mockReconcileDueInstances,
}))
vi.mock('@/lib/reminders/sweep', () => ({
  runReminderSweep: mockRunReminderSweep,
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabase: () => ({
    from: (table: string) => {
      if (table !== 'holdings') {
        throw new Error(`cron-reminders route unexpectedly queried table "${table}"`)
      }
      return {
        select: async () => ({
          data: FAKE_HOLDING_IDS.map((id) => ({ id })),
          error: null,
        }),
      }
    },
  }),
}))

const { GET } = await import('@/app/api/cron/reminders/route')

const SWEEP_RESULT = { scanned: 3, queued: 2, skipped: 1, failed: 0 }

function requestWith(secret: string): Request {
  return new Request('http://localhost/api/cron/reminders', {
    headers: { authorization: `Bearer ${secret}` },
  })
}

describe('GET /api/cron/reminders', () => {
  beforeEach(() => {
    mockReconcileDueInstances.mockReset().mockResolvedValue({
      created: 1,
      deleted: 0,
      preserved: 0,
      refreshed: 0,
    })
    mockRunReminderSweep.mockReset().mockResolvedValue(SWEEP_RESULT)
  })

  it('rejects a request with no secret and calls neither collaborator', async () => {
    const response = await GET(new Request('http://localhost/api/cron/reminders'))
    expect(response.status).toBe(401)
    expect(mockReconcileDueInstances).not.toHaveBeenCalled()
    expect(mockRunReminderSweep).not.toHaveBeenCalled()
  })

  it('rejects a request with the wrong secret and calls neither collaborator', async () => {
    const response = await GET(requestWith('wrong-secret'))
    expect(response.status).toBe(401)
    expect(mockReconcileDueInstances).not.toHaveBeenCalled()
    expect(mockRunReminderSweep).not.toHaveBeenCalled()
  })

  it('reconciles every holding once and sweeps with today, returning counts only', async () => {
    const response = await GET(requestWith(process.env.CRON_SECRET!))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(Object.keys(body).sort()).toEqual(['generated', 'removed', 'sweep'])
    expect(JSON.stringify(body)).not.toMatch(/\+91|@/) // no mobiles, no emails

    expect(mockReconcileDueInstances).toHaveBeenCalledTimes(FAKE_HOLDING_IDS.length)
    const reconciledIds = mockReconcileDueInstances.mock.calls.map((call) => call[1]).sort()
    expect(reconciledIds).toEqual([...FAKE_HOLDING_IDS].sort())

    expect(mockRunReminderSweep).toHaveBeenCalledTimes(1)
    expect(mockRunReminderSweep.mock.calls[0]![1]).toBe(todayInIndia())

    expect(body).toEqual({
      generated: FAKE_HOLDING_IDS.length,
      removed: 0,
      sweep: SWEEP_RESULT,
    })
  })

  it('returns the counts-only error shape when the sweep throws, not the default 500', async () => {
    mockRunReminderSweep.mockRejectedValueOnce(new Error('sweep exploded'))

    const response = await GET(requestWith(process.env.CRON_SECRET!))
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(Object.keys(body).sort()).toEqual(['generated', 'removed', 'sweep'])
    expect(body.sweep).toBeNull()
    expect(JSON.stringify(body)).not.toMatch(/\+91|@/)
  })
})
