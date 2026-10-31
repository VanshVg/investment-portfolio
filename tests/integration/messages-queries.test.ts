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
  // Other suites write messages in parallel, and these lists are unfiltered,
  // so every assertion here has to come out of a SINGLE query. Comparing rows
  // across two queries cannot work however it is written: all three lists are
  // ordered newest-first, so one row inserted between the calls shifts every
  // offset, and page 2 of the second call is not the row page 2 of the first
  // would have been. An earlier version compared `page: 2` against index 1 of
  // a separate full listing and failed perhaps one run in two — not for the
  // reason it named, since paging was never wrong.
  //
  // The slice arithmetic itself is pinned deterministically, without a
  // database, in tests/unit/paging/paging.test.ts — ranges, totals, the empty
  // list and past-the-end. What is left for this layer is what that cannot
  // reach: that each query orders and ranges correctly in real SQL, and that
  // the page it reports is the page it was asked for.
  it.each([
    ['failed', listFailedMessages],
    ['recent', listRecentMessages],
    ['replies', listReplies],
  ] as const)('pages the %s list without repeating or losing a row', async (_, list) => {
    // One snapshot. Within it the rows must be distinct and account for the
    // total exactly. A repeated id means the query's joins fanned one message
    // into several rows; a total that disagrees with the rows means the exact
    // count and the select are not counting the same set, which is what
    // happens when a filter reaches one and not the other. The unit tests
    // cannot see either — they stub the query and test the arithmetic around
    // it, so the SQL is exactly the part they do not run.
    const everything = await list(client, { page: 1, pageSize: 1000 })
    const ids = everything.rows.map((row) => row.id)
    expect(everything.total).toBeGreaterThanOrEqual(1)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toHaveLength(Math.min(everything.total, 1000))

    // And the request is honoured rather than ignored: asking for one row
    // returns one row, labelled as the page that was asked for.
    const second = await list(client, { page: 2, pageSize: 1 })
    expect(second).toMatchObject({ pageSize: 1 })
    expect(second.rows.length).toBeLessThanOrEqual(1)
    expect(second.page).toBe(second.total > 1 ? 2 : 1)
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
