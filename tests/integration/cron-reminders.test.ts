import { beforeEach, describe, expect, it, vi } from 'vitest'
import { todayInIndia } from '@/lib/domain/dates'

// This handler is the one route in the app that holds a client bypassing
// row-level security. Its two collaborators — reconciliation and the sweep —
// each have their own exhaustive suites against the live database
// (reconcile-due-instances.test.ts, ensure-due-instances.test.ts,
// sweep.test.ts), and the live-holdings read that feeds reconciliation is
// covered against the database in soft-delete.test.ts. Mocking all three
// here keeps this suite to what the route itself is responsible
// for: the secret gate, calling each collaborator the right number of times
// with the right arguments, and shaping the response. None of that touches
// the live database, so this suite cannot race another suite's fixtures or
// mutate the seeded household — the failure mode this file used to have.
const {
  mockReconcileDueInstances,
  mockRunReminderSweep,
  mockListLiveHoldingIds,
  mockSendQueuedWhatsApp,
} = vi.hoisted(() => ({
  mockReconcileDueInstances: vi.fn(),
  mockRunReminderSweep: vi.fn(),
  mockListLiveHoldingIds: vi.fn(),
  mockSendQueuedWhatsApp: vi.fn(),
}))

const FAKE_HOLDING_IDS = ['fixture-holding-a', 'fixture-holding-b', 'fixture-holding-c']

vi.mock('@/lib/reminders/reconcile', () => ({
  reconcileDueInstances: mockReconcileDueInstances,
}))
vi.mock('@/lib/reminders/sweep', () => ({
  runReminderSweep: mockRunReminderSweep,
}))
vi.mock('@/lib/reminders/live-holdings', () => ({
  listLiveHoldingIds: mockListLiveHoldingIds,
}))
// The WhatsApp step has its own suites (whatsapp-send.test.ts, whatsapp-daily.test.ts).
vi.mock('@/lib/whatsapp/daily', () => ({
  sendQueuedWhatsApp: mockSendQueuedWhatsApp,
}))
// The route reads through its collaborators only; a direct table read from
// the route itself would bypass the soft-delete filter they apply.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabase: () => ({
    from: (table: string) => {
      throw new Error(`cron-reminders route unexpectedly queried table "${table}" directly`)
    },
  }),
}))

const { GET } = await import('@/app/api/cron/reminders/route')

const SWEEP_RESULT = { scanned: 3, queued: 2, skipped: 1, failed: 0 }
const WHATSAPP_RESULT = { mode: 'live', sent: 2, skipped: 1, failed: 0, deferred: 0 }

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
    mockListLiveHoldingIds.mockReset().mockResolvedValue(FAKE_HOLDING_IDS)
    mockSendQueuedWhatsApp.mockReset().mockResolvedValue(WHATSAPP_RESULT)
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
    expect(Object.keys(body).sort()).toEqual(['generated', 'removed', 'sweep', 'whatsapp'])
    expect(JSON.stringify(body)).not.toMatch(/\+91|@/) // no mobiles, no emails

    expect(mockReconcileDueInstances).toHaveBeenCalledTimes(FAKE_HOLDING_IDS.length)
    const reconciledIds = mockReconcileDueInstances.mock.calls.map((call) => call[1]).sort()
    expect(reconciledIds).toEqual([...FAKE_HOLDING_IDS].sort())

    expect(mockRunReminderSweep).toHaveBeenCalledTimes(1)
    expect(mockRunReminderSweep.mock.calls[0]![1]).toBe(todayInIndia())

    // Sending runs after the sweep, so today's reminders go out today.
    expect(mockSendQueuedWhatsApp).toHaveBeenCalledTimes(1)
    expect(mockSendQueuedWhatsApp.mock.calls[0]![1]).toBe(todayInIndia())
    expect(mockSendQueuedWhatsApp.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockRunReminderSweep.mock.invocationCallOrder[0]!,
    )

    expect(body).toEqual({
      generated: FAKE_HOLDING_IDS.length,
      removed: 0,
      sweep: SWEEP_RESULT,
      whatsapp: WHATSAPP_RESULT,
    })
  })

  it('still reports the sweep when sending fails, with the WhatsApp counts null', async () => {
    mockSendQueuedWhatsApp.mockRejectedValueOnce(new Error('send exploded'))

    const response = await GET(requestWith(process.env.CRON_SECRET!))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.sweep).toEqual(SWEEP_RESULT)
    expect(body.whatsapp).toBeNull()
  })

  it('returns the counts-only error shape when the sweep throws, not the default 500', async () => {
    mockRunReminderSweep.mockRejectedValueOnce(new Error('sweep exploded'))

    const response = await GET(requestWith(process.env.CRON_SECRET!))
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(Object.keys(body).sort()).toEqual(['generated', 'removed', 'sweep'])
    expect(body.sweep).toBeNull()
    // Nothing is sent from a queue the sweep failed to bring up to date.
    expect(mockSendQueuedWhatsApp).not.toHaveBeenCalled()
    expect(JSON.stringify(body)).not.toMatch(/\+91|@/)
  })
})
