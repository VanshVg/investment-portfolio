import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminClient, ensureUser } from '../helpers/db'
import { GET } from '@/app/api/cron/reminders/route'
import type { SupabaseClient } from '@supabase/supabase-js'

const EMAIL = 'cron-reminders-admin@example.test'
const PASSWORD = 'test-password-123'

// This handler is the one route in the app that holds a client bypassing
// row-level security. The service-role client here stands in only for
// reading back what the route did, matching how the other reminder-engine
// integration suites use it.
const admin: SupabaseClient = adminClient()

// Every family this suite creates, so afterAll can cascade it away (holdings
// and due instances go with it) without touching any other suite's fixtures
// or the seeded reminder rules.
const familyIds: string[] = []

// A holding with a real schedule but no due_instances generated for it yet.
// Nothing in this suite ever calls ensureDueInstances/reconcileDueInstances
// directly — the only thing that can make its due_instances count move off
// zero is the route itself doing its reconciliation pass. That is what makes
// the count usable as proof that a rejected request touched nothing.
let holdingId: string

function requestWith(secret: string): Request {
  return new Request('http://localhost/api/cron/reminders', {
    headers: { authorization: `Bearer ${secret}` },
  })
}

async function countDueInstances(): Promise<number> {
  const { count, error } = await admin
    .from('due_instances')
    .select('id', { count: 'exact', head: true })
    .eq('holding_id', holdingId)
  if (error) throw new Error(error.message)
  return count ?? 0
}

// Cascades away the fixture family. Must not mask a real cleanup failure, so
// an empty or partial delete throws rather than passing silently — and must
// never touch the seeded reminder rules or any family another suite created.
afterAll(async () => {
  if (familyIds.length === 0) return
  const { data, error } = await admin
    .from('families')
    .delete()
    .in('id', familyIds)
    .select('id')
  if (error) throw new Error(`fixture cleanup failed: ${error.message}`)
  if (!data || data.length !== familyIds.length) {
    throw new Error(
      `fixture cleanup deleted ${data?.length ?? 0} of ${familyIds.length} families`,
    )
  }
})

describe('GET /api/cron/reminders', () => {
  beforeAll(async () => {
    const advisor = await ensureUser(EMAIL, PASSWORD, 'admin')

    const { data: family, error: familyError } = await admin
      .from('families')
      .insert({
        name: 'Cron fixture — reconciliation probe',
        owner_advisor_id: advisor!.id,
      })
      .select()
      .single()
    if (familyError) throw new Error(familyError.message)
    familyIds.push(family!.id)

    const { data: holding, error: holdingError } = await admin
      .from('holdings')
      .insert({
        family_id: family!.id,
        category: 'life_insurance',
        label: 'Cron fixture plan',
        periodic_amount: 12_000,
        anchor_due_date: '2026-11-01',
        next_due_date: '2026-11-01',
        due_frequency: 'annual',
      })
      .select()
      .single()
    if (holdingError) throw new Error(holdingError.message)
    holdingId = holding!.id
  })

  it('rejects a request with no secret', async () => {
    const response = await GET(
      new Request('http://localhost/api/cron/reminders'),
    )
    expect(response.status).toBe(401)
  })

  it('rejects a request with the wrong secret', async () => {
    const response = await GET(requestWith('wrong-secret'))
    expect(response.status).toBe(401)
  })

  it('does no work when rejecting', async () => {
    const before = await countDueInstances()
    // Sanity on the fixture itself: nothing has reconciled this holding yet,
    // so there is somewhere for the count to move to if work happened.
    expect(before).toBe(0)

    await GET(new Request('http://localhost/api/cron/reminders'))
    await GET(requestWith('wrong-secret'))

    expect(await countDueInstances()).toBe(before)
  })

  it('returns counts and no client data', async () => {
    // This route reconciles every holding in the database, not just this
    // suite's own fixture — that is its actual job, and it is what proves
    // the "no work when rejecting" test above meant something. But it means
    // an authenticated call here also materializes legitimate future due
    // dates for every other suite's (and the seeded sample data's) holdings,
    // which is a real, permanent write this test did not otherwise ask for.
    // Snapshot before, and undo everything the call created outside this
    // suite's own fixture afterwards, so this test does not leave every
    // other holding in the database — seeded or fixture — in a different
    // state than it found it.
    const { data: dueBefore, error: dueBeforeError } = await admin
      .from('due_instances')
      .select('id, holding_id')
    if (dueBeforeError) throw new Error(dueBeforeError.message)
    const dueBeforeIds = new Set((dueBefore ?? []).map((row) => row.id))

    const { data: logBefore, error: logBeforeError } = await admin
      .from('reminder_log')
      .select('id')
    if (logBeforeError) throw new Error(logBeforeError.message)
    const logBeforeIds = new Set((logBefore ?? []).map((row) => row.id))

    const response = await GET(requestWith(process.env.CRON_SECRET!))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(Object.keys(body).sort()).toEqual(['generated', 'removed', 'sweep'])
    expect(JSON.stringify(body)).not.toMatch(/\+91|@/) // no mobiles, no emails

    // Confirms the counter the previous test relied on is not inert: an
    // authenticated run does reconcile this same fixture holding into
    // existence, which is what makes that test's zero-movement meaningful
    // rather than a fixture that was never going to move either way.
    expect(await countDueInstances()).toBeGreaterThan(0)

    const { data: dueAfter, error: dueAfterError } = await admin
      .from('due_instances')
      .select('id, holding_id')
    if (dueAfterError) throw new Error(dueAfterError.message)
    const holdingById = new Map(
      (dueAfter ?? []).map((row) => [row.id, row.holding_id]),
    )

    // Reminder_log rows the sweep queued against a due instance that already
    // existed before this call (so restoring due_instances alone would not
    // remove them) but that belongs to a holding this suite does not own.
    const { data: logAfter, error: logAfterError } = await admin
      .from('reminder_log')
      .select('id, due_instance_id')
    if (logAfterError) throw new Error(logAfterError.message)
    const foreignLogIds = (logAfter ?? [])
      .filter((row) => !logBeforeIds.has(row.id))
      .filter((row) => holdingById.get(row.due_instance_id) !== holdingId)
      .map((row) => row.id)
    if (foreignLogIds.length > 0) {
      const { data: removedLogs, error: removeLogError } = await admin
        .from('reminder_log')
        .delete()
        .in('id', foreignLogIds)
        .select('id')
      if (removeLogError)
        throw new Error(
          `restoring reminder_log failed: ${removeLogError.message}`,
        )
      if (!removedLogs || removedLogs.length !== foreignLogIds.length) {
        throw new Error(
          `restoring reminder_log removed ${removedLogs?.length ?? 0} of ${foreignLogIds.length}`,
        )
      }
    }

    // New due_instances rows for holdings other than this suite's own
    // fixture. Deleting these also takes any reminder_log row queued against
    // one of them with it, by cascade.
    const foreignDueIds = (dueAfter ?? [])
      .filter(
        (row) => !dueBeforeIds.has(row.id) && row.holding_id !== holdingId,
      )
      .map((row) => row.id)
    if (foreignDueIds.length > 0) {
      const { data: removedDue, error: removeDueError } = await admin
        .from('due_instances')
        .delete()
        .in('id', foreignDueIds)
        .select('id')
      if (removeDueError)
        throw new Error(
          `restoring due_instances failed: ${removeDueError.message}`,
        )
      if (!removedDue || removedDue.length !== foreignDueIds.length) {
        throw new Error(
          `restoring due_instances removed ${removedDue?.length ?? 0} of ${foreignDueIds.length}`,
        )
      }
    }
  })
})
