import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminClient, ensureUser, signedInClient } from '../helpers/db'
import { listFailedMessages, listRecentMessages, listReplies } from '@/lib/queries/messages'

const EMAIL = 'messages-page-admin@example.test'
const PASSWORD = 'test-password-123'
const MOBILE = '+919812355001'

const { revalidatePath, mockCreateServerSupabase } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  mockCreateServerSupabase: vi.fn(),
}))
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }))
vi.mock('next/cache', () => ({ revalidatePath }))
vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: mockCreateServerSupabase }))
mockCreateServerSupabase.mockImplementation(() => signedInClient(EMAIL, PASSWORD))

const { markReplyHandled } = await import('@/app/(app)/messages/actions')

const admin = adminClient()
let client: SupabaseClient
let familyId: string
let memberId: string
const ids: Record<string, string> = {}

async function log(key: string, fields: Record<string, unknown>) {
  const { data, error } = await admin
    .from('reminder_log')
    .insert({
      due_instance_id: ids.instance,
      days_before: Object.keys(ids).length + 100,
      recipient_type: 'client',
      recipient_mobile: MOBILE,
      ...fields,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  ids[key] = data!.id
}

async function inbound(key: string, fields: Record<string, unknown>) {
  const { data, error } = await admin
    .from('whatsapp_inbound')
    .insert({
      from_mobile: MOBILE,
      body: key,
      provider_message_id: `wamid.msgpage-${key}`,
      ...fields,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  ids[key] = data!.id
}

beforeAll(async () => {
  const user = await ensureUser(EMAIL, PASSWORD, 'admin')
  client = await signedInClient(EMAIL, PASSWORD)
  const { data: family } = await admin
    .from('families')
    .insert({ name: 'Messages page fixture', owner_advisor_id: user!.id })
    .select('id')
    .single()
  familyId = family!.id
  const { data: member } = await admin
    .from('family_members')
    .insert({ family_id: familyId, name: 'Meera Shah', relation: 'self', mobile: MOBILE })
    .select('id')
    .single()
  memberId = member!.id
  const { data: holding } = await admin
    .from('holdings')
    .insert({ family_id: familyId, category: 'life_insurance', label: 'Star Health' })
    .select('id')
    .single()
  const { data: instance } = await admin
    .from('due_instances')
    .insert({ holding_id: holding!.id, due_date: '2027-05-01' })
    .select('id')
    .single()
  ids.instance = instance!.id

  await log('failed', { status: 'failed', error: 'Recipient not on WhatsApp', attempts: 1 })
  const now = new Date().toISOString()
  await log('sent', { status: 'sent', sent_at: now, provider_message_id: 'w1' })
  await log('skipped', { status: 'skipped', skip_reason: 'no_consent' })
  await log('pending', { status: 'pending' })
  await log('previewed', { status: 'pending', test_sent_at: new Date().toISOString() })

  await inbound('question', { member_ids: [memberId] })
  await inbound('optout', { member_ids: [memberId], opt_out: true })
  await inbound('stranger', { from_mobile: '+919812355999' })
  await inbound('done', { handled_at: new Date().toISOString() })
})

afterAll(async () => {
  await admin.from('whatsapp_inbound').delete().like('provider_message_id', 'wamid.msgpage-%')
  await admin.from('families').delete().eq('id', familyId)
})

describe('Messages page queries', () => {
  it('lists failures with the household, the policy and Meta’s reason', async () => {
    const { rows } = await listFailedMessages(client, { page: 1, pageSize: 200 })
    expect(rows.find((row) => row.id === ids.failed)).toMatchObject({
      familyId,
      familyName: 'Messages page fixture',
      holdingLabel: 'Star Health',
      recipient: 'client',
      detail: 'Recipient not on WhatsApp',
    })
    expect(rows.map((row) => row.id)).not.toContain(ids.sent)
  })

  it('lists recent sends, skips with their reason, and test previews, not the queue', async () => {
    const { rows } = await listRecentMessages(client, { page: 1, pageSize: 200 })
    const mine = new Map(rows.map((row) => [row.id, row]))
    expect(mine.get(ids.sent)).toMatchObject({ status: 'sent', test: false })
    expect(mine.get(ids.skipped)).toMatchObject({
      status: 'skipped',
      detail: 'No WhatsApp consent',
    })
    expect(mine.get(ids.previewed)).toMatchObject({ test: true })
    expect(mine.has(ids.pending)).toBe(false)
  })

  it('lists replies unhandled first, naming the member and household it matches', async () => {
    const { rows: all } = await listReplies(client, { page: 1, pageSize: 200 })
    const rows = all.filter((row) =>
      [ids.question, ids.optout, ids.stranger, ids.done].includes(row.id),
    )
    expect(rows.at(-1)!.id).toBe(ids.done)
    const question = rows.find((row) => row.id === ids.question)!
    expect(question).toMatchObject({
      body: 'question',
      handled: false,
      optOut: false,
      senders: [{ name: 'Meera Shah', familyId, familyName: 'Messages page fixture' }],
    })
    expect(rows.find((row) => row.id === ids.optout)).toMatchObject({ optOut: true })
    expect(rows.find((row) => row.id === ids.stranger)).toMatchObject({ senders: [] })
  })
})

describe('Messages page paging', () => {
  // Other suites write messages in parallel, so totals are not asserted
  // exactly; what must hold is that pages are disjoint and complete.
  it.each([
    ['failed', listFailedMessages],
    ['recent', listRecentMessages],
    ['replies', listReplies],
  ] as const)('pages the %s list without repeating or losing a row', async (_, list) => {
    const first = await list(client, { page: 1, pageSize: 1 })
    expect(first.rows).toHaveLength(1)
    expect(first).toMatchObject({ page: 1, pageSize: 1 })
    expect(first.total).toBeGreaterThanOrEqual(1)

    const everything = await list(client, { page: 1, pageSize: 1000 })
    const second = await list(client, { page: 2, pageSize: 1 })
    if (everything.total > 1) {
      expect(second.rows[0].id).toBe(everything.rows[1].id)
      expect(second.rows[0].id).not.toBe(first.rows[0].id)
    }
  })

  it('serves the last page for a page past the end', async () => {
    const { total } = await listReplies(client, { page: 1, pageSize: 1000 })
    const result = await listReplies(client, { page: 100_000, pageSize: 2 })
    expect(result.page).toBe(Math.max(1, Math.ceil(total / 2)))
    expect(result.rows.length).toBeGreaterThan(0)
  })
})

describe('markReplyHandled', () => {
  it('marks a reply handled once, by the signed-in advisor', async () => {
    expect(await markReplyHandled(ids.question)).toEqual({ ok: true, id: ids.question })
    const { data } = await admin
      .from('whatsapp_inbound')
      .select('handled_at, handled_by')
      .eq('id', ids.question)
      .single()
    expect(data!.handled_at).not.toBeNull()
    expect(data!.handled_by).not.toBeNull()
    expect(revalidatePath).toHaveBeenCalledWith('/messages')

    expect((await markReplyHandled(ids.question)).ok).toBe(false)
  })
})
