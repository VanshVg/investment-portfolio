import { beforeAll, describe, expect, it } from 'vitest'
import { adminClient, anonClient, ensureUser, signedInClient } from '../helpers/db'
import type { SupabaseClient } from '@supabase/supabase-js'

const EMAIL = 'reminders-admin@example.test'
const PASSWORD = 'test-password-123'

let client: SupabaseClient
let advisorId: string
let holdingId: string
let dueInstanceId: string

/** A fresh, unreferenced holding — its own family too — for write-denial tests. */
async function newFixtureHolding(label: string) {
  const { data: family, error: familyError } = await client
    .from('families')
    .insert({ name: `Reminder fixture — ${label}`, owner_advisor_id: advisorId })
    .select()
    .single()
  if (familyError) throw new Error(familyError.message)

  const { data: holding, error: holdingError } = await client
    .from('holdings')
    .insert({
      family_id: family!.id,
      category: 'life_insurance',
      label,
      periodic_amount: 45_000,
    })
    .select()
    .single()
  if (holdingError) throw new Error(holdingError.message)

  return holding!
}

describe('reminder rules and log', () => {
  beforeAll(async () => {
    const user = await ensureUser(EMAIL, PASSWORD, 'admin')
    advisorId = user!.id
    client = await signedInClient(EMAIL, PASSWORD)

    const { data: family } = await client
      .from('families')
      .insert({ name: 'Reminder fixture', owner_advisor_id: user!.id })
      .select()
      .single()

    const { data: holding } = await client
      .from('holdings')
      .insert({
        family_id: family!.id,
        category: 'life_insurance',
        label: 'Term plan',
        periodic_amount: 45_000,
        anchor_due_date: '2027-03-15',
        next_due_date: '2027-03-15',
      })
      .select()
      .single()
    holdingId = holding!.id

    const { data: instance } = await client
      .from('due_instances')
      .insert({ holding_id: holdingId, due_date: '2027-03-15', amount_due: 45_000 })
      .select()
      .single()
    dueInstanceId = instance!.id
  })

  it('ships a default rule for every category', async () => {
    const { data } = await client
      .from('reminder_rules')
      .select('category, days_before')
      .not('category', 'is', null)
    const categories = (data ?? []).map((row) => row.category).sort()
    expect(categories).toEqual([
      'fixed_income',
      'general_insurance',
      'life_insurance',
      'mutual_fund',
    ])
    expect(data?.[0]?.days_before).toEqual([30, 15])
  })

  it('accepts a per-holding override', async () => {
    const { error } = await client
      .from('reminder_rules')
      .insert({ holding_id: holdingId, days_before: [45, 20, 7] })
    expect(error).toBeNull()
  })

  it('refuses a rule that is both category-level and holding-level', async () => {
    const { error } = await client
      .from('reminder_rules')
      .insert({ category: 'life_insurance', holding_id: holdingId, days_before: [10] })
    expect(error).not.toBeNull()
  })

  it('refuses a rule that is neither', async () => {
    const { error } = await client.from('reminder_rules').insert({ days_before: [10] })
    expect(error).not.toBeNull()
  })

  it('refuses a second active rule for the same category', async () => {
    const { error } = await client
      .from('reminder_rules')
      .insert({ category: 'life_insurance', days_before: [10] })
    expect(error).not.toBeNull()
  })

  it('records a sent reminder', async () => {
    const { error } = await client.from('reminder_log').insert({
      due_instance_id: dueInstanceId,
      days_before: 30,
      recipient_type: 'advisor',
      recipient_mobile: '+919000000001',
      channel: 'whatsapp',
      status: 'sent',
    })
    expect(error).toBeNull()
  })

  it('refuses a duplicate send to the same recipient for the same window', async () => {
    // The duplicate-send guard lives in the database on purpose: a retried cron
    // run cannot produce a second WhatsApp message to a client.
    const { error } = await client.from('reminder_log').insert({
      due_instance_id: dueInstanceId,
      days_before: 30,
      recipient_type: 'advisor',
      recipient_mobile: '+919000000001',
      channel: 'whatsapp',
      status: 'sent',
    })
    expect(error).not.toBeNull()
  })

  it('allows the same window for a different recipient type', async () => {
    const { error } = await client.from('reminder_log').insert({
      due_instance_id: dueInstanceId,
      days_before: 30,
      recipient_type: 'client',
      recipient_mobile: '+919876543210',
      channel: 'whatsapp',
      status: 'sent',
    })
    expect(error).toBeNull()
  })

  it('denies anonymous reads of reminder rules', async () => {
    const { data } = await anonClient().from('reminder_rules').select('id')
    expect(data ?? []).toEqual([])
  })

  it('denies anonymous reads of the reminder log', async () => {
    const { data } = await anonClient().from('reminder_log').select('id')
    expect(data ?? []).toEqual([])
  })

  it('denies anonymous inserts into reminder_rules', async () => {
    const holding = await newFixtureHolding('Anon rule-insert fixture')

    const { error } = await anonClient()
      .from('reminder_rules')
      .insert({ holding_id: holding.id, days_before: [10] })
    expect(error).not.toBeNull()
  })

  it('denies anonymous deletes of reminder_rules', async () => {
    const holding = await newFixtureHolding('Anon rule-delete fixture')
    const { data: rule, error: ruleError } = await client
      .from('reminder_rules')
      .insert({ holding_id: holding.id, days_before: [10] })
      .select()
      .single()
    if (ruleError) throw new Error(ruleError.message)

    const { error } = await anonClient().from('reminder_rules').delete().eq('id', rule!.id)
    expect(error).toBeNull() // a delete matching no visible rows is not itself an error

    const admin = adminClient()
    const { data } = await admin.from('reminder_rules').select('id').eq('id', rule!.id)
    expect(data).toHaveLength(1)
  })

  it('denies anonymous inserts into reminder_log', async () => {
    const { error } = await anonClient().from('reminder_log').insert({
      due_instance_id: dueInstanceId,
      days_before: 60,
      recipient_type: 'advisor',
      recipient_mobile: '+919000000099',
      channel: 'whatsapp',
      status: 'sent',
    })
    expect(error).not.toBeNull()
  })

  it('denies anonymous deletes of reminder_log', async () => {
    const holding = await newFixtureHolding('Anon log-delete fixture')
    const { data: instance, error: instanceError } = await client
      .from('due_instances')
      .insert({ holding_id: holding.id, due_date: '2027-05-01', amount_due: 45_000 })
      .select()
      .single()
    if (instanceError) throw new Error(instanceError.message)

    const { data: log, error: logError } = await client
      .from('reminder_log')
      .insert({
        due_instance_id: instance!.id,
        days_before: 30,
        recipient_type: 'advisor',
        recipient_mobile: '+919000000098',
        channel: 'whatsapp',
        status: 'sent',
      })
      .select()
      .single()
    if (logError) throw new Error(logError.message)

    const { error } = await anonClient().from('reminder_log').delete().eq('id', log!.id)
    expect(error).toBeNull() // a delete matching no visible rows is not itself an error

    const admin = adminClient()
    const { data } = await admin.from('reminder_log').select('id').eq('id', log!.id)
    expect(data).toHaveLength(1)
  })
})
