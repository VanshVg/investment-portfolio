import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminClient, signedInClient } from '../helpers/db'
import { listRenewals } from '@/lib/queries/renewals'
import type { SupabaseClient } from '@supabase/supabase-js'

const EMAIL = process.env.SEED_ADMIN_EMAIL!
const PASSWORD = process.env.SEED_ADMIN_PASSWORD!
const FAMILY_NAME = 'Patel — Rajeshkumar'

let client: SupabaseClient
let familyId: string
let advisorId: string

describe('renewal listing', () => {
  beforeAll(async () => {
    client = await signedInClient(EMAIL, PASSWORD)

    // Scoped to the seeded family by name so these assertions describe only
    // the sample data, regardless of what other suites leave lying around in
    // the same date window or what order vitest runs the files in.
    const { data: family, error } = await client
      .from('families')
      .select('id, owner_advisor_id')
      .eq('name', FAMILY_NAME)
      .single()
    if (error || !family) {
      throw new Error(
        `Seeded family "${FAMILY_NAME}" not found — run \`npm run db:seed\` before the test suite.`,
      )
    }
    familyId = family.id
    advisorId = family.owner_advisor_id
  })

  // The six due instances the seed script inserts directly are a floor, not
  // an exact total: reconciliation now runs on every holding save and in the
  // nightly job, and materialises every occurrence of a recurring holding
  // through a 13-month horizon (see reconcileDueInstances) — so this shared,
  // never-reset family can legitimately end up with more than six once a
  // reconciliation pass has touched it, and the count will only grow over
  // calendar time as the horizon slides forward. Assertions here check
  // relationships and membership (present, ordered, the specific seeded rows
  // among them), never a hardcoded total.
  const SEEDED_LABELS = [
    'LIC Jeevan Umang / Term Plan',
    'Child Education Plan',
    'Optima Secure Health Floater',
    'Hyundai Creta GJ-16-XX-1234',
    'Bank fixed deposit',
    'Corporate bonds / NCDs',
  ]

  it('lists at least every seeded due date across all categories, oldest first', async () => {
    const { rows } = await listRenewals(client, { from: '2026-01-01', to: '2028-12-31', familyId })
    expect(rows.length).toBeGreaterThanOrEqual(6)

    const dates = rows.map((row) => row.dueDate)
    expect(dates).toEqual([...dates].sort())
    expect(dates[0]).toBe('2026-09-20')

    const labels = new Set(rows.map((row) => row.label))
    for (const label of SEEDED_LABELS) expect(labels.has(label)).toBe(true)
  })

  it('filters by date range', async () => {
    const { rows } = await listRenewals(client, { from: '2026-01-01', to: '2026-12-31', familyId })
    const dates = rows.map((row) => row.dueDate)
    // Every seeded holding's own next occurrence beyond these three lands in
    // 2027 or later (annual/quarterly steps carried from a 2026 anchor never
    // produce a second occurrence inside the same calendar year), so this
    // window's membership is stable even as reconciliation adds future rows
    // elsewhere — but the bound is asserted directly rather than assumed.
    expect(rows.every((row) => row.dueDate >= '2026-01-01' && row.dueDate <= '2026-12-31')).toBe(
      true,
    )
    expect(dates).toEqual(expect.arrayContaining(['2026-09-20', '2026-11-20', '2026-12-31']))
  })

  it('filters to externally managed holdings, the cross-sell list', async () => {
    const { rows } = await listRenewals(client, {
      from: '2026-01-01',
      to: '2028-12-31',
      managedBy: 'external',
      familyId,
    })
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((row) => row.managedBy === 'external')).toBe(true)
    // A Set, not a sorted array: reconciliation can add a second future due
    // instance under the same externally managed holding, which would make
    // an exact-array comparison flaky on nothing but instance count.
    const labels = new Set(rows.map((row) => row.label))
    expect(labels).toEqual(new Set(['Bank fixed deposit', 'Child Education Plan']))
  })

  it('filters to a single family member', async () => {
    const { rows: all } = await listRenewals(client, { from: '2026-01-01', to: '2028-12-31', familyId })
    const son = all.find((row) => row.memberName === 'Aarav Patel')!
    const { rows } = await listRenewals(client, {
      from: '2026-01-01',
      to: '2028-12-31',
      memberId: son.memberId!,
      familyId,
    })
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((row) => row.label === 'Child Education Plan')).toBe(true)
    expect(rows.every((row) => row.memberId === son.memberId)).toBe(true)
  })

  it('carries the fields the listing page needs', async () => {
    const { rows } = await listRenewals(client, { from: '2026-11-01', to: '2026-11-30', familyId })
    expect(rows[0]).toMatchObject({
      label: 'Hyundai Creta GJ-16-XX-1234',
      category: 'general_insurance',
      managedBy: 'self',
      // due_frequency is set once at creation and never auto-advanced, so
      // this is stable across reconciliation passes, unlike offSchedule and
      // firedWindows below, which the reminder engine can legitimately flip
      // on this same shared, never-reset fixture over calendar time — those
      // two are covered instead on the fully isolated fixture below.
      dueFrequency: 'annual',
      paymentStatus: 'unknown',
      familyName: 'Patel — Rajeshkumar',
      memberName: 'Rajeshkumar Patel',
    })
  })

  describe('truncation guard', () => {
    it('is false when every matching row was returned', async () => {
      const { truncated } = await listRenewals(client, {
        from: '2026-01-01',
        to: '2028-12-31',
        familyId,
      })
      expect(truncated).toBe(false)
    })

    it('is true when the row cap returns fewer rows than actually matched', async () => {
      // Forcing the real 1000-row PostgREST cap would mean seeding 1000 due
      // instances. Capping `maxRows` down below the 6 seeded for this family
      // exercises the exact same "count exceeds returned rows" branch
      // without the database bloat.
      const { rows, truncated } = await listRenewals(
        client,
        { from: '2026-01-01', to: '2028-12-31', familyId },
        { maxRows: 2 },
      )
      expect(rows.length).toBe(2)
      expect(truncated).toBe(true)
    })
  })

  // A fully isolated fixture, created and torn down by this block alone, so
  // pagination, firedWindows and offSchedule can be pinned to exact,
  // deterministic values instead of the "at least" relationships the shared
  // seeded family needs above.
  describe('pagination and reminder state, on an isolated fixture', () => {
    const admin = adminClient()
    const fixtureFamilyIds: string[] = []

    let fixtureFamilyId: string
    // Two of these share a due date on purpose: ties on a due date are the
    // normal case (a household with several policies renewing the same
    // week), not an edge case, and a missing (due_date, id) tiebreak is
    // exactly what lets a row land on two pages, or none.
    let pagInstanceIds: string[] = []
    let firedInstanceId: string
    let offScheduleInstanceId: string

    const PAGE_FROM = '2029-03-01'
    const PAGE_TO = '2029-03-31'
    const FIXTURE_FROM = '2029-01-01'
    const FIXTURE_TO = '2029-12-31'

    async function insertFixtureHolding(label: string, dueFrequency: string): Promise<string> {
      const { data, error } = await admin
        .from('holdings')
        .insert({
          family_id: fixtureFamilyId,
          category: 'life_insurance',
          label,
          due_frequency: dueFrequency,
        })
        .select('id')
        .single()
      if (error) throw new Error(`fixture holding insert failed: ${error.message}`)
      return data!.id as string
    }

    async function insertFixtureInstance(
      holdingId: string,
      dueDate: string,
      overrides: Record<string, unknown> = {},
    ): Promise<string> {
      const { data, error } = await admin
        .from('due_instances')
        .insert({ holding_id: holdingId, due_date: dueDate, ...overrides })
        .select('id')
        .single()
      if (error) throw new Error(`fixture instance insert failed: ${error.message}`)
      return data!.id as string
    }

    beforeAll(async () => {
      const { data: family, error } = await admin
        .from('families')
        .insert({ name: 'Renewals query fixture', owner_advisor_id: advisorId })
        .select('id')
        .single()
      if (error) throw new Error(`fixture family insert failed: ${error.message}`)
      fixtureFamilyId = family!.id as string
      fixtureFamilyIds.push(fixtureFamilyId)

      const pagHoldingA = await insertFixtureHolding('Pagination fixture A', 'monthly')
      const pagHoldingB = await insertFixtureHolding('Pagination fixture B', 'annual')
      const pagHoldingC = await insertFixtureHolding('Pagination fixture C', 'annual')
      const pagHoldingD = await insertFixtureHolding('Pagination fixture D', 'annual')
      pagInstanceIds = [
        await insertFixtureInstance(pagHoldingA, '2029-03-10'),
        await insertFixtureInstance(pagHoldingB, '2029-03-10'),
        await insertFixtureInstance(pagHoldingC, '2029-03-11'),
        await insertFixtureInstance(pagHoldingD, '2029-03-12'),
      ]

      // One instance reminded at two windows, each to both recipients — the
      // shape a real send produces — so firedWindows can be pinned to report
      // distinct windows, not one entry per recipient.
      const firedHoldingId = await insertFixtureHolding('Fired windows fixture', 'one_time')
      firedInstanceId = await insertFixtureInstance(firedHoldingId, '2029-04-15')
      const { error: logError } = await admin.from('reminder_log').insert([
        {
          due_instance_id: firedInstanceId,
          days_before: 30,
          recipient_type: 'advisor',
          recipient_mobile: '+919000000001',
          status: 'sent',
        },
        {
          due_instance_id: firedInstanceId,
          days_before: 30,
          recipient_type: 'client',
          recipient_mobile: '+919000000002',
          status: 'sent',
        },
        {
          due_instance_id: firedInstanceId,
          days_before: 15,
          recipient_type: 'advisor',
          recipient_mobile: '+919000000001',
          status: 'pending',
        },
      ])
      if (logError) throw new Error(`fixture reminder_log insert failed: ${logError.message}`)

      // One instance flagged off_schedule directly — the state
      // reconcileDueInstances leaves on a row it keeps for its evidence but
      // whose date no longer sits on the holding's schedule.
      const offHoldingId = await insertFixtureHolding('Off-schedule fixture', 'quarterly')
      offScheduleInstanceId = await insertFixtureInstance(offHoldingId, '2029-05-15', {
        off_schedule: true,
      })
    })

    // Cascades away the fixture family (holdings, due_instances and
    // reminder_log go with it) without touching the shared seeded family or
    // any other suite's fixtures. Guarded so a setup failure (no id ever
    // pushed) can't throw here and mask the real failure that happened
    // earlier; an empty or partial delete throws rather than passing
    // silently.
    afterAll(async () => {
      if (fixtureFamilyIds.length === 0) return
      const { data, error } = await admin
        .from('families')
        .delete()
        .in('id', fixtureFamilyIds)
        .select('id')
      if (error) throw new Error(`fixture cleanup failed: ${error.message}`)
      if (!data || data.length !== fixtureFamilyIds.length) {
        throw new Error(
          `fixture cleanup deleted ${data?.length ?? 0} of ${fixtureFamilyIds.length} families`,
        )
      }
    })

    async function rowFor(dueInstanceId: string) {
      const { rows } = await listRenewals(client, {
        from: FIXTURE_FROM,
        to: FIXTURE_TO,
        familyId: fixtureFamilyId,
        pageSize: 100,
      })
      const row = rows.find((r) => r.dueInstanceId === dueInstanceId)
      if (!row) throw new Error(`fixture row ${dueInstanceId} not found in listing`)
      return row
    }

    it('returns a stable page ordered by date then id, with no row on two pages', async () => {
      const page1 = await listRenewals(client, {
        from: PAGE_FROM,
        to: PAGE_TO,
        familyId: fixtureFamilyId,
        page: 1,
        pageSize: 2,
      })
      const page2 = await listRenewals(client, {
        from: PAGE_FROM,
        to: PAGE_TO,
        familyId: fixtureFamilyId,
        page: 2,
        pageSize: 2,
      })

      expect(page1.rows).toHaveLength(2)
      expect(page2.rows).toHaveLength(2)

      const combined = [...page1.rows, ...page2.rows]
      const ids = combined.map((r) => r.dueInstanceId)
      // Stronger than "no duplicate": the two pages together must be exactly
      // the four fixture rows, no more and no fewer — a row silently dropped
      // between pages would pass a bare "no duplicate" check.
      expect(new Set(ids)).toEqual(new Set(pagInstanceIds))

      const dates = combined.map((r) => r.dueDate)
      expect(dates.slice(0, 2).sort()).toEqual(['2029-03-10', '2029-03-10'])
      expect(dates[2]).toBe('2029-03-11')
      expect(dates[3]).toBe('2029-03-12')
    })

    it('reports the total independently of the page size', async () => {
      const small = await listRenewals(client, {
        from: PAGE_FROM,
        to: PAGE_TO,
        familyId: fixtureFamilyId,
        pageSize: 1,
      })
      const large = await listRenewals(client, {
        from: PAGE_FROM,
        to: PAGE_TO,
        familyId: fixtureFamilyId,
        pageSize: 100,
      })
      // A total that were actually just rows.length would move with pageSize
      // — comparing two different page sizes catches that in a way a single
      // call comparing total against its own rows.length cannot.
      expect(small.rows).toHaveLength(1)
      expect(large.rows).toHaveLength(4)
      expect(small.total).toBe(4)
      expect(small.total).toBe(large.total)
    })

    it('defaults to page 1', async () => {
      const result = await listRenewals(client, {
        from: PAGE_FROM,
        to: PAGE_TO,
        familyId: fixtureFamilyId,
      })
      expect(result.page).toBe(1)
    })

    it('carries dueFrequency, so a one_time holding can be told apart from a recurring one', async () => {
      const recurring = await rowFor(pagInstanceIds[0])
      expect(recurring.dueFrequency).toBe('monthly')

      const oneTime = await rowFor(firedInstanceId)
      expect(oneTime.dueFrequency).toBe('one_time')
    })

    it('reports which reminder windows have been queued for a row, distinct per window not per recipient', async () => {
      const row = await rowFor(firedInstanceId)
      expect(row.firedWindows).toEqual([30, 15])
    })

    it('reports an off-schedule instance as such', async () => {
      const row = await rowFor(offScheduleInstanceId)
      expect(row.offSchedule).toBe(true)
    })

    it('reports an on-schedule instance as such', async () => {
      const row = await rowFor(pagInstanceIds[0])
      expect(row.offSchedule).toBe(false)
    })
  })
})
