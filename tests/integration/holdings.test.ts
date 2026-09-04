import { beforeAll, describe, expect, it } from 'vitest'
import { adminClient, anonClient, ensureUser, signedInClient } from '../helpers/db'
import type { SupabaseClient } from '@supabase/supabase-js'

const EMAIL = 'holdings-admin@example.test'
const PASSWORD = 'test-password-123'

let client: SupabaseClient
let familyId: string
let memberId: string

describe('holdings', () => {
  beforeAll(async () => {
    const user = await ensureUser(EMAIL, PASSWORD, 'admin')
    client = await signedInClient(EMAIL, PASSWORD)

    const { data: family } = await client
      .from('families')
      .insert({ name: 'Holdings fixture', owner_advisor_id: user!.id })
      .select()
      .single()
    familyId = family!.id

    const { data: member } = await client
      .from('family_members')
      .insert({ family_id: familyId, name: 'Rajeshkumar Patel', relation: 'self' })
      .select()
      .single()
    memberId = member!.id
  })

  it('stores all four categories in one table', async () => {
    // `defaultToNull: false` is required here: this batch mixes rows that set
    // `managed_by` with rows that omit it (relying on the column default).
    // supabase-js's default behaviour (`defaultToNull: true`) unions the keys
    // across all objects in the array and sends an explicit `null` for any key
    // missing from a given row, which bypasses the DB `default 'self'` and
    // trips the not-null constraint. Passing `false` sends
    // `Prefer: missing=default` so Postgres applies the column default instead.
    const { error } = await client.from('holdings').insert(
      [
        {
          family_id: familyId,
          member_id: memberId,
          category: 'life_insurance',
          label: 'LIC Jeevan Umang',
          principal_amount: 5_000_000,
          periodic_amount: 45_000,
          anchor_due_date: '2027-03-15',
          next_due_date: '2027-03-15',
          due_frequency: 'annual',
          details: { policy_number: 'LIC-889231' },
        },
        {
          family_id: familyId,
          category: 'general_insurance',
          label: 'Optima Secure Health Floater',
          managed_by: 'self',
          principal_amount: 1_000_000,
          periodic_amount: 22_000,
          anchor_due_date: '2027-05-15',
          next_due_date: '2027-05-15',
          details: {
            sub_category: 'health',
            insured_asset: 'Entire family',
            policy_type: 'Floater',
          },
        },
        {
          family_id: familyId,
          member_id: memberId,
          category: 'mutual_fund',
          label: 'Retirement corpus',
          periodic_amount: 15_000,
          principal_amount: 1_500_000,
          due_frequency: 'monthly',
          details: { target_goal: 6_000_000 },
        },
        {
          family_id: familyId,
          member_id: memberId,
          category: 'fixed_income',
          label: 'SBI fixed deposit',
          managed_by: 'external',
          principal_amount: 1_000_000,
          anchor_due_date: '2027-10-01',
          next_due_date: '2027-10-01',
          due_frequency: 'one_time',
          details: { asset_type: 'Bank fixed deposit', interest_rate: 6.5 },
        },
      ],
      { defaultToNull: false },
    )
    expect(error).toBeNull()
  })

  // Scoped by family_id (not just category/label) so this suite stays
  // idempotent when `npm test` runs again without a `db:reset` in between —
  // each run's beforeAll creates a fresh family, so an unscoped query would
  // start matching rows from earlier runs too and break `.single()`.
  it('allows a family-level holding with no member, for a floater', async () => {
    const { data } = await client
      .from('holdings')
      .select('id, member_id')
      .eq('family_id', familyId)
      .eq('category', 'general_insurance')
      .single()
    expect(data?.member_id).toBeNull()
  })

  it('defaults to managed by the advisor with reminders on', async () => {
    const { data } = await client
      .from('holdings')
      .select('managed_by, reminders_enabled')
      .eq('family_id', familyId)
      .eq('label', 'LIC Jeevan Umang')
      .single()
    expect(data?.managed_by).toBe('self')
    expect(data?.reminders_enabled).toBe(true)
  })

  it('keeps a holding when its member is removed', async () => {
    await client.from('family_members').delete().eq('id', memberId)
    const { data } = await client
      .from('holdings')
      .select('id, member_id')
      .eq('family_id', familyId)
      .eq('label', 'LIC Jeevan Umang')
      .single()
    expect(data).not.toBeNull()
    expect(data?.member_id).toBeNull()
  })

  it('denies anonymous reads', async () => {
    const { data } = await anonClient().from('holdings').select('id')
    expect(data ?? []).toEqual([])
  })

  it('denies anonymous inserts', async () => {
    const { error } = await anonClient().from('holdings').insert({
      family_id: familyId,
      category: 'mutual_fund',
      label: 'Anonymous Insert Attempt',
    })
    expect(error).not.toBeNull()
  })

  it('denies anonymous deletes', async () => {
    const { data: holding, error: createError } = await client
      .from('holdings')
      .insert({ family_id: familyId, category: 'mutual_fund', label: 'Anon delete target' })
      .select()
      .single()
    if (createError) throw new Error(createError.message)

    const { error } = await anonClient().from('holdings').delete().eq('id', holding!.id)
    expect(error).toBeNull() // a delete matching no visible rows is not itself an error

    const admin = adminClient()
    const { data } = await admin.from('holdings').select('id').eq('id', holding!.id)
    expect(data).toHaveLength(1)
  })
})
