import { beforeAll, describe, expect, it } from 'vitest'
import { ensureUser, signedInClient } from '../helpers/db'
import { getFamily, listFamilies, listHoldings, listMembers } from '@/lib/queries/families'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/types.generated'

const EMAIL = 'queries-admin@example.test'
const PASSWORD = 'test-password-123'

let client: SupabaseClient<Database>
let advisorId: string
let familyId: string

describe('family queries', () => {
  beforeAll(async () => {
    const user = await ensureUser(EMAIL, PASSWORD, 'admin')
    advisorId = user!.id
    client = (await signedInClient(EMAIL, PASSWORD)) as SupabaseClient<Database>

    const { data, error } = await client
      .from('families')
      .insert({ name: 'Query Fixture Household', owner_advisor_id: advisorId, head_name: 'Rakesh' })
      .select()
      .single()
    if (error) throw new Error(error.message)
    familyId = data!.id

    await client
      .from('family_members')
      .insert({ family_id: familyId, name: 'Rakesh', relation: 'self' })

    await client.from('holdings').insert([
      {
        family_id: familyId,
        category: 'life_insurance',
        label: 'HDFC Click2Protect',
        next_due_date: '2027-03-12',
        reminders_enabled: true,
      },
      {
        family_id: familyId,
        category: 'fixed_income',
        label: 'SBI FD',
        next_due_date: '2026-11-01',
        reminders_enabled: false,
      },
    ])
  })

  it('summarises a family with counts and the earliest reminding due date', async () => {
    const rows = await listFamilies(client, { search: 'Query Fixture' })
    const row = rows.find((r) => r.id === familyId)
    expect(row).toBeDefined()
    expect(row!.memberCount).toBe(1)
    expect(row!.holdingCount).toBe(2)
    // The FD is earlier but has reminders disabled, so it must not win.
    expect(row!.nextDueDate).toBe('2027-03-12')
  })

  it('returns null for a family that does not exist', async () => {
    expect(await getFamily(client, '00000000-0000-0000-0000-000000000000')).toBeNull()
  })

  it('returns null for a malformed id rather than throwing', async () => {
    // A stale bookmark or a hand-edited URL must land on the not-found page,
    // not the generic error page with a retry that can never succeed.
    expect(await getFamily(client, 'not-a-uuid')).toBeNull()
  })

  it('reads one family with its numeric fields as numbers', async () => {
    const family = await getFamily(client, familyId)
    expect(family!.name).toBe('Query Fixture Household')
    expect(family!.goalHorizonYears).toBe(8)
    expect(family!.assumedCagr).toBe(12)
  })

  it('lists members of a family', async () => {
    const members = await listMembers(client, familyId)
    expect(members.map((m) => m.name)).toContain('Rakesh')
  })

  it('returns every category in one call', async () => {
    const holdings = await listHoldings(client, familyId)
    expect(holdings.map((h) => h.category).sort()).toEqual(['fixed_income', 'life_insurance'])
  })

  it('does not break when the search term contains PostgREST filter syntax', async () => {
    // A comma or parenthesis would otherwise be parsed as filter grammar.
    await expect(listFamilies(client, { search: 'Patel, (Ahmedabad)' })).resolves.toBeInstanceOf(Array)
  })
})
