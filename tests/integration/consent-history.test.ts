import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminClient, ensureUser, signedInClient } from '../helpers/db'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * DPDP s.6: the fiduciary must be able to demonstrate that consent was
 * obtained. `whatsapp_consent_at` only ever holds the current consent's time
 * and is cleared on withdrawal, so on its own it destroyed exactly that
 * evidence. `consent_events` is the append-only history beside it.
 */
const EMAIL = 'consent-history-admin@example.test'
const PASSWORD = 'test-password-123'

let client: SupabaseClient
let advisorId: string
let familyId: string

async function newMember(fields: Record<string, unknown>) {
  const { data, error } = await client
    .from('family_members')
    .insert({ family_id: familyId, name: 'Member', relation: 'other', ...fields })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data!
}

async function eventsFor(memberId: string) {
  const { data, error } = await client
    .from('consent_events')
    .select('event, mobile, recorded_at, recorded_by')
    .eq('member_id', memberId)
    .order('recorded_at', { ascending: true })
    .order('id', { ascending: true })
  if (error) throw new Error(error.message)
  return data!
}

async function update(memberId: string, patch: Record<string, unknown>) {
  const { data, error } = await client
    .from('family_members')
    .update(patch)
    .eq('id', memberId)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data!
}

beforeAll(async () => {
  const user = await ensureUser(EMAIL, PASSWORD, 'admin')
  advisorId = user!.id
  client = await signedInClient(EMAIL, PASSWORD)
  const { data, error } = await client
    .from('families')
    .insert({ name: 'Consent history fixture', owner_advisor_id: advisorId })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  familyId = data!.id
})

afterAll(async () => {
  if (familyId) await adminClient().from('families').delete().eq('id', familyId)
})

describe('consent history', () => {
  it('records consent given at creation, with the number and who recorded it', async () => {
    const member = await newMember({ mobile: '+919876511001', whatsapp_consent: true })
    const events = await eventsFor(member.id)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      event: 'given',
      mobile: '+919876511001',
      recorded_by: advisorId,
    })
  })

  it('records nothing for a member who never consented', async () => {
    const member = await newMember({ mobile: '+919876511002', whatsapp_consent: false })
    expect(await eventsFor(member.id)).toEqual([])
  })

  it('keeps the record of consent when it is withdrawn, and adds the withdrawal', async () => {
    const member = await newMember({ mobile: '+919876511003', whatsapp_consent: true })
    const withdrawn = await update(member.id, { whatsapp_consent: false })

    // The column still means "current consent", so it clears...
    expect(withdrawn.whatsapp_consent_at).toBeNull()
    // ...but the evidence that consent was given survives in the history.
    expect((await eventsFor(member.id)).map((e) => e.event)).toEqual(['given', 'withdrawn'])
  })

  it('records consent given again after a withdrawal as a new event', async () => {
    const member = await newMember({ mobile: '+919876511004', whatsapp_consent: true })
    await update(member.id, { whatsapp_consent: false })
    await update(member.id, { whatsapp_consent: true })
    expect((await eventsFor(member.id)).map((e) => e.event)).toEqual([
      'given',
      'withdrawn',
      'given',
    ])
  })

  it('keeps consent across a number change (D3) and records which number it now covers', async () => {
    const member = await newMember({ mobile: '+919876511005', whatsapp_consent: true })
    const changed = await update(member.id, { mobile: '+919876511006' })

    expect(changed.whatsapp_consent).toBe(true)
    const events = await eventsFor(member.id)
    expect(events.map((e) => [e.event, e.mobile])).toEqual([
      ['given', '+919876511005'],
      ['mobile_changed', '+919876511006'],
    ])
  })

  it('records nothing for an update that touches neither consent nor number', async () => {
    const member = await newMember({ mobile: '+919876511007', whatsapp_consent: true })
    await update(member.id, { name: 'Renamed' })
    expect(await eventsFor(member.id)).toHaveLength(1)
  })

  it('owns the consent time: a value supplied on a consented row is ignored', async () => {
    const member = await newMember({ mobile: '+919876511008', whatsapp_consent: true })
    const forged = await update(member.id, {
      whatsapp_consent: true,
      whatsapp_consent_at: '2001-01-01T00:00:00Z',
    })
    expect(forged.whatsapp_consent_at).toBe(member.whatsapp_consent_at)
  })

  it('is append-only: the advisor can read the history but not change or remove it', async () => {
    const member = await newMember({ mobile: '+919876511009', whatsapp_consent: true })

    const { data: edited } = await client
      .from('consent_events')
      .update({ event: 'withdrawn' })
      .eq('member_id', member.id)
      .select('id')
    expect(edited ?? []).toEqual([])

    const { data: removed } = await client
      .from('consent_events')
      .delete()
      .eq('member_id', member.id)
      .select('id')
    expect(removed ?? []).toEqual([])

    expect((await eventsFor(member.id)).map((e) => e.event)).toEqual(['given'])
  })
})
