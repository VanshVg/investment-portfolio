import { beforeAll, describe, expect, it } from 'vitest'
import { anonClient, ensureUser, signedInClient } from '../helpers/db'
import type { SupabaseClient } from '@supabase/supabase-js'

const EMAIL = 'families-admin@example.test'
const PASSWORD = 'test-password-123'

let client: SupabaseClient
let advisorId: string

async function newFamily(name: string) {
  const { data, error } = await client
    .from('families')
    .insert({ name, owner_advisor_id: advisorId })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

describe('families and members', () => {
  beforeAll(async () => {
    const user = await ensureUser(EMAIL, PASSWORD, 'admin')
    advisorId = user!.id
    client = await signedInClient(EMAIL, PASSWORD)
  })

  it('carries the prototype goal-gap defaults', async () => {
    const family = await newFamily('Patel — defaults')
    expect(family.goal_horizon_years).toBe(8)
    expect(Number(family.assumed_cagr)).toBe(12)
  })

  it('defaults WhatsApp consent to false', async () => {
    const family = await newFamily('Patel — consent default')
    const { data, error } = await client
      .from('family_members')
      .insert({ family_id: family.id, name: 'Sunitaben Patel', relation: 'spouse' })
      .select()
      .single()
    expect(error).toBeNull()
    expect(data?.whatsapp_consent).toBe(false)
  })

  it('refuses consent without a mobile number to send to', async () => {
    const family = await newFamily('Patel — consent guard')
    const { error } = await client.from('family_members').insert({
      family_id: family.id,
      name: 'Aarav Patel',
      relation: 'son',
      whatsapp_consent: true,
    })
    expect(error).not.toBeNull()
  })

  it('accepts consent when a mobile number is present', async () => {
    const family = await newFamily('Patel — consent ok')
    const { error } = await client.from('family_members').insert({
      family_id: family.id,
      name: 'Rajeshkumar Patel',
      relation: 'self',
      mobile: '+919876543210',
      whatsapp_consent: true,
    })
    expect(error).toBeNull()
  })

  it('stamps whatsapp_consent_at when consent is granted with a mobile number', async () => {
    const family = await newFamily('Patel — consent stamp')
    const { data, error } = await client
      .from('family_members')
      .insert({
        family_id: family.id,
        name: 'Kiranben Patel',
        relation: 'mother',
        mobile: '+919876500001',
        whatsapp_consent: true,
      })
      .select()
      .single()
    expect(error).toBeNull()
    expect(data?.whatsapp_consent_at).not.toBeNull()
  })

  it('clears whatsapp_consent_at when consent is withdrawn', async () => {
    const family = await newFamily('Patel — consent withdrawn')
    const { data: created } = await client
      .from('family_members')
      .insert({
        family_id: family.id,
        name: 'Dineshbhai Patel',
        relation: 'father',
        mobile: '+919876500002',
        whatsapp_consent: true,
      })
      .select()
      .single()
    expect(created?.whatsapp_consent_at).not.toBeNull()

    const { data: updated, error } = await client
      .from('family_members')
      .update({ whatsapp_consent: false })
      .eq('id', created!.id)
      .select()
      .single()
    expect(error).toBeNull()
    expect(updated?.whatsapp_consent_at).toBeNull()
  })

  it('leaves whatsapp_consent_at unchanged on an unrelated update', async () => {
    const family = await newFamily('Patel — consent unchanged')
    const { data: created } = await client
      .from('family_members')
      .insert({
        family_id: family.id,
        name: 'Meeraben Patel',
        relation: 'daughter',
        mobile: '+919876500003',
        whatsapp_consent: true,
      })
      .select()
      .single()
    const originalConsentAt = created?.whatsapp_consent_at
    expect(originalConsentAt).not.toBeNull()

    const { data: updated, error } = await client
      .from('family_members')
      .update({ name: 'Meeraben Patel Shah' })
      .eq('id', created!.id)
      .select()
      .single()
    expect(error).toBeNull()
    expect(updated?.whatsapp_consent_at).toBe(originalConsentAt)
  })

  it('removes members when their family is deleted', async () => {
    const family = await newFamily('Patel — cascade')
    await client
      .from('family_members')
      .insert({ family_id: family.id, name: 'Temporary', relation: 'other' })

    await client.from('families').delete().eq('id', family.id)

    const { data } = await client.from('family_members').select('id').eq('family_id', family.id)
    expect(data).toEqual([])
  })

  it('denies anonymous reads', async () => {
    const { data } = await anonClient().from('families').select('id')
    expect(data ?? []).toEqual([])
  })
})
