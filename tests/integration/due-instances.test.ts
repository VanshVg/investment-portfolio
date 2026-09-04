import { beforeAll, describe, expect, it } from 'vitest'
import { anonClient, ensureUser, signedInClient } from '../helpers/db'
import type { SupabaseClient } from '@supabase/supabase-js'

const EMAIL = 'dues-admin@example.test'
const PASSWORD = 'test-password-123'

let client: SupabaseClient
let holdingId: string

describe('due instances', () => {
  beforeAll(async () => {
    const user = await ensureUser(EMAIL, PASSWORD, 'admin')
    client = await signedInClient(EMAIL, PASSWORD)

    const { data: family } = await client
      .from('families')
      .insert({ name: 'Dues fixture', owner_advisor_id: user!.id })
      .select()
      .single()

    const { data: holding } = await client
      .from('holdings')
      .insert({
        family_id: family!.id,
        category: 'life_insurance',
        label: 'Term plan',
        periodic_amount: 45_000,
        anchor_due_date: '2026-03-15',
        next_due_date: '2027-03-15',
        due_frequency: 'annual',
      })
      .select()
      .single()
    holdingId = holding!.id
  })

  it('defaults payment status to unknown', async () => {
    const { data, error } = await client
      .from('due_instances')
      .insert({ holding_id: holdingId, due_date: '2026-03-15', amount_due: 45_000 })
      .select()
      .single()
    expect(error).toBeNull()
    expect(data?.payment_status).toBe('unknown')
  })

  it('refuses a second instance on the same date', async () => {
    const { error } = await client
      .from('due_instances')
      .insert({ holding_id: holdingId, due_date: '2026-03-15', amount_due: 45_000 })
    expect(error).not.toBeNull()
  })

  it('accepts a manual paid tick', async () => {
    const { data, error } = await client
      .from('due_instances')
      .update({ payment_status: 'paid', paid_on: '2026-03-12' })
      .eq('holding_id', holdingId)
      .eq('due_date', '2026-03-15')
      .select()
      .single()
    expect(error).toBeNull()
    expect(data?.payment_status).toBe('paid')
  })

  it('removes instances when the holding is deleted', async () => {
    await client.from('holdings').delete().eq('id', holdingId)
    const { data } = await client.from('due_instances').select('id').eq('holding_id', holdingId)
    expect(data ?? []).toEqual([])
  })

  it('denies anonymous reads', async () => {
    const { data } = await anonClient().from('due_instances').select('id')
    expect(data ?? []).toEqual([])
  })
})
