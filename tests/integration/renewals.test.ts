import { beforeAll, describe, expect, it } from 'vitest'
import { signedInClient } from '../helpers/db'
import { listRenewals } from '@/lib/queries/renewals'
import type { SupabaseClient } from '@supabase/supabase-js'

const EMAIL = process.env.SEED_ADMIN_EMAIL!
const PASSWORD = process.env.SEED_ADMIN_PASSWORD!
const FAMILY_NAME = 'Patel — Rajeshkumar'

let client: SupabaseClient
let familyId: string

describe('renewal listing', () => {
  beforeAll(async () => {
    client = await signedInClient(EMAIL, PASSWORD)

    // Scoped to the seeded family by name so these assertions describe only
    // the sample data, regardless of what other suites leave lying around in
    // the same date window or what order vitest runs the files in.
    const { data: family, error } = await client
      .from('families')
      .select('id')
      .eq('name', FAMILY_NAME)
      .single()
    if (error || !family) {
      throw new Error(
        `Seeded family "${FAMILY_NAME}" not found — run \`npm run db:seed\` before the test suite.`,
      )
    }
    familyId = family.id
  })

  it('lists every seeded due date across all categories, oldest first', async () => {
    const { rows } = await listRenewals(client, { from: '2026-01-01', to: '2028-12-31', familyId })
    expect(rows.length).toBe(6)

    const dates = rows.map((row) => row.dueDate)
    expect(dates).toEqual([...dates].sort())
    expect(dates[0]).toBe('2026-09-20')
  })

  it('filters by date range', async () => {
    const { rows } = await listRenewals(client, { from: '2026-01-01', to: '2026-12-31', familyId })
    expect(rows.map((row) => row.dueDate)).toEqual(['2026-09-20', '2026-11-20', '2026-12-31'])
  })

  it('filters to externally managed holdings, the cross-sell list', async () => {
    const { rows } = await listRenewals(client, {
      from: '2026-01-01',
      to: '2028-12-31',
      managedBy: 'external',
      familyId,
    })
    expect(rows.every((row) => row.managedBy === 'external')).toBe(true)
    expect(rows.map((row) => row.label).sort()).toEqual([
      'Bank fixed deposit',
      'Child Education Plan',
    ])
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
    expect(rows.map((row) => row.label)).toEqual(['Child Education Plan'])
  })

  it('carries the fields the listing page needs', async () => {
    const { rows } = await listRenewals(client, { from: '2026-11-01', to: '2026-11-30', familyId })
    expect(rows[0]).toMatchObject({
      label: 'Hyundai Creta GJ-16-XX-1234',
      category: 'general_insurance',
      managedBy: 'self',
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
})
