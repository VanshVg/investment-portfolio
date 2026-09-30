import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminClient, ensureUser, signedInClient } from '../helpers/db'
import { getWhatsAppMode, saveWhatsAppMode } from '@/lib/whatsapp/settings'

const ADMIN_EMAIL = 'whatsapp-schema-admin@example.test'
const CLIENT_EMAIL = 'whatsapp-schema-client@example.test'
const PASSWORD = 'test-password-123'
const MOBILE = '+919812399001'

const admin = adminClient()
let asAdmin: SupabaseClient
let asClient: SupabaseClient
let familyId: string

async function member(fields: Record<string, unknown>) {
  const { data, error } = await admin
    .from('family_members')
    .insert({ family_id: familyId, name: 'Opt-out probe', relation: 'other', ...fields })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data!.id as string
}

async function events(memberId: string) {
  const { data } = await admin
    .from('consent_events')
    .select('event, source')
    .eq('member_id', memberId)
    .order('recorded_at')
    .order('id')
  return data ?? []
}

beforeAll(async () => {
  const user = await ensureUser(ADMIN_EMAIL, PASSWORD, 'admin')
  await ensureUser(CLIENT_EMAIL, PASSWORD, 'client')
  asAdmin = await signedInClient(ADMIN_EMAIL, PASSWORD)
  asClient = await signedInClient(CLIENT_EMAIL, PASSWORD)
  const { data } = await admin
    .from('families')
    .insert({ name: 'WhatsApp schema fixture', owner_advisor_id: user!.id })
    .select('id')
    .single()
  familyId = data!.id
})

afterAll(async () => {
  await admin.from('families').delete().eq('id', familyId)
  await admin.from('app_settings').update({ whatsapp_mode: 'off' }).eq('id', true)
})

describe('app_settings', () => {
  it('has exactly one row, switched off by default', async () => {
    const { data } = await admin.from('app_settings').select('id, whatsapp_mode')
    expect(data).toEqual([{ id: true, whatsapp_mode: 'off' }])
  })

  it('lets an admin change the mode', async () => {
    const { data, error } = await asAdmin
      .from('app_settings')
      .update({ whatsapp_mode: 'test' })
      .eq('id', true)
      .select('whatsapp_mode')
    expect(error).toBeNull()
    expect(data).toEqual([{ whatsapp_mode: 'test' }])
    await admin.from('app_settings').update({ whatsapp_mode: 'off' }).eq('id', true)
  })

  it('does not let a client-role account read or change it', async () => {
    const { data: read } = await asClient.from('app_settings').select('whatsapp_mode')
    expect(read).toEqual([])
    const { data: written } = await asClient
      .from('app_settings')
      .update({ whatsapp_mode: 'live' })
      .eq('id', true)
      .select('id')
    expect(written ?? []).toEqual([])
  })

  // Saving lives here, not in the settings-action suite: this is the one
  // file that writes the shared row, so no parallel suite can race it.
  it('saves and reads the mode through the settings helpers, as the admin', async () => {
    const { data } = await admin.auth.admin.listUsers()
    const userId = data.users.find((user) => user.email === ADMIN_EMAIL)!.id
    expect(await saveWhatsAppMode(asAdmin, 'live', userId)).toBe(true)
    expect(await getWhatsAppMode(asAdmin)).toBe('live')
    const { data: row } = await admin.from('app_settings').select('updated_by').single()
    expect(row!.updated_by).toBe(userId)
    await admin.from('app_settings').update({ whatsapp_mode: 'off' }).eq('id', true)
  })

  it('reports that a client-role account could not save the mode', async () => {
    const { data } = await admin.auth.admin.listUsers()
    const clientId = data.users.find((user) => user.email === CLIENT_EMAIL)!.id
    expect(await saveWhatsAppMode(asClient, 'live', clientId)).toBe(false)
    expect(await getWhatsAppMode(asClient)).toBe('off')
  })

  it('refuses a second row', async () => {
    const { error } = await admin.from('app_settings').insert({ id: false })
    expect(error).not.toBeNull()
  })
})

describe('withdraw_consent_by_reply', () => {
  it('withdraws consent for live members with that number, as the client’s reply', async () => {
    const live = await member({ mobile: MOBILE, whatsapp_consent: true })
    const removed = await member({
      mobile: MOBILE,
      whatsapp_consent: true,
      deleted_at: new Date().toISOString(),
    })

    const { data, error } = await admin.rpc('withdraw_consent_by_reply', { p_mobile: MOBILE })
    expect(error).toBeNull()
    expect(data).toEqual([live])

    const { data: rows } = await admin
      .from('family_members')
      .select('id, whatsapp_consent')
      .in('id', [live, removed])
    expect(rows).toEqual(
      expect.arrayContaining([
        { id: live, whatsapp_consent: false },
        { id: removed, whatsapp_consent: true },
      ]),
    )
    expect(await events(live)).toEqual([
      { event: 'given', source: 'advisor' },
      { event: 'withdrawn', source: 'client_reply' },
    ])
  })

  it('leaves ordinary consent changes recorded as the advisor’s', async () => {
    const id = await member({ mobile: '+919812399002', whatsapp_consent: true })
    await admin.from('family_members').update({ whatsapp_consent: false }).eq('id', id)
    expect(await events(id)).toEqual([
      { event: 'given', source: 'advisor' },
      { event: 'withdrawn', source: 'advisor' },
    ])
  })

  it('cannot be called by a signed-in user', async () => {
    const { error } = await asAdmin.rpc('withdraw_consent_by_reply', { p_mobile: MOBILE })
    expect(error).not.toBeNull()
  })
})

describe('whatsapp_inbound', () => {
  it('stores a message id once', async () => {
    const row = { from_mobile: MOBILE, body: 'hello', provider_message_id: 'wamid.schema-1' }
    await admin.from('whatsapp_inbound').insert(row)
    const { error } = await admin.from('whatsapp_inbound').insert(row)
    expect(error).not.toBeNull()
    await admin.from('whatsapp_inbound').delete().eq('provider_message_id', 'wamid.schema-1')
  })
})
