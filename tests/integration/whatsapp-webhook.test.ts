import { createHmac } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { adminClient, ensureUser } from '../helpers/db'
import { createFakeProvider } from '@/lib/whatsapp/fake'

const { fake } = vi.hoisted(() => ({ fake: { provider: null as unknown } }))
// The confirmation to an opt-out is sent through the fake: nothing here reaches Meta.
vi.mock('@/lib/whatsapp/connection', () => ({
  whatsappProvider: () => fake.provider,
  appUrl: (path: string) => `http://localhost:3000${path}`,
}))

const { GET, POST } = await import('@/app/api/whatsapp/webhook/route')

const EMAIL = 'whatsapp-webhook-admin@example.test'
const PASSWORD = 'test-password-123'
const SECRET = 'webhook-test-secret'
const VERIFY = 'webhook-verify-token'
const MEMBER_MOBILE = '+919812388001'

const admin = adminClient()
let advisorId: string
let familyId: string
let memberId: string
let dueInstanceId: string

function connect() {
  vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'token')
  vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '123')
  vi.stubEnv('WHATSAPP_APP_SECRET', SECRET)
  vi.stubEnv('WHATSAPP_VERIFY_TOKEN', VERIFY)
}

function post(payload: unknown, secret = SECRET) {
  const body = JSON.stringify(payload)
  const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
  return POST(
    new Request('http://localhost/api/whatsapp/webhook', {
      method: 'POST',
      headers: { 'x-hub-signature-256': signature, 'content-type': 'application/json' },
      body,
    }),
  )
}

const envelope = (value: Record<string, unknown>) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: 'waba', changes: [{ field: 'messages', value }] }],
})

const status = (id: string, value: string, extra: Record<string, unknown> = {}) =>
  envelope({ statuses: [{ id, status: value, timestamp: '1788000000', ...extra }] })

const reply = (id: string, body: string, from = MEMBER_MOBILE.slice(1)) =>
  envelope({
    messages: [{ from, id, timestamp: '1788000000', type: 'text', text: { body } }],
  })

async function sentRow(fields: Record<string, unknown>) {
  const { data, error } = await admin
    .from('reminder_log')
    .insert({
      due_instance_id: dueInstanceId,
      days_before: Math.floor(Math.random() * 1_000_000) + 1000,
      recipient_type: 'client',
      recipient_mobile: MEMBER_MOBILE,
      status: 'sent',
      ...fields,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data!.id as string
}

async function row(id: string) {
  const { data } = await admin.from('reminder_log').select('*').eq('id', id).single()
  return data!
}

beforeAll(async () => {
  const user = await ensureUser(EMAIL, PASSWORD, 'admin')
  advisorId = user!.id
  await admin.from('profiles').update({ full_name: 'Webhook Advisor' }).eq('id', advisorId)
  const { data: family } = await admin
    .from('families')
    .insert({ name: 'WhatsApp webhook fixture', owner_advisor_id: advisorId })
    .select('id')
    .single()
  familyId = family!.id
  const { data: member } = await admin
    .from('family_members')
    .insert({
      family_id: familyId,
      name: 'Webhook member',
      relation: 'self',
      mobile: MEMBER_MOBILE,
      whatsapp_consent: true,
    })
    .select('id')
    .single()
  memberId = member!.id
  const { data: holding } = await admin
    .from('holdings')
    .insert({ family_id: familyId, category: 'life_insurance', label: 'Webhook policy' })
    .select('id')
    .single()
  const { data: instance } = await admin
    .from('due_instances')
    .insert({ holding_id: holding!.id, due_date: '2027-06-01' })
    .select('id')
    .single()
  dueInstanceId = instance!.id
})

beforeEach(() => {
  vi.unstubAllEnvs()
  fake.provider = createFakeProvider()
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await admin.from('whatsapp_inbound').delete().like('provider_message_id', 'wamid.hook-%')
  await admin.from('families').delete().eq('id', familyId)
})

describe('GET /api/whatsapp/webhook (Meta’s verification handshake)', () => {
  const handshake = (token: string) =>
    GET(
      new Request(
        'http://localhost/api/whatsapp/webhook?hub.mode=subscribe' +
          `&hub.verify_token=${token}&hub.challenge=12345`,
      ),
    )

  it('echoes the challenge for the right verify token', async () => {
    connect()
    const response = await handshake(VERIFY)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('12345')
  })

  it('refuses the wrong token', async () => {
    connect()
    expect((await handshake('wrong')).status).toBe(403)
  })

  it('does not exist until the credentials are configured', async () => {
    expect((await handshake(VERIFY)).status).toBe(404)
  })
})

describe('POST /api/whatsapp/webhook', () => {
  it('does not exist until the credentials are configured', async () => {
    expect((await post(status('wamid.hook-x', 'delivered'))).status).toBe(404)
  })

  it('rejects a call not signed with the app secret, and changes nothing', async () => {
    connect()
    const id = await sentRow({ provider_message_id: 'wamid.hook-unsigned' })
    const response = await post(status('wamid.hook-unsigned', 'delivered'), 'not-the-secret')
    expect(response.status).toBe(401)
    expect((await row(id)).status).toBe('sent')
  })

  it('moves a message to delivered, then read', async () => {
    connect()
    const id = await sentRow({ provider_message_id: 'wamid.hook-1' })

    expect((await post(status('wamid.hook-1', 'delivered'))).status).toBe(200)
    expect(await row(id)).toMatchObject({ status: 'delivered' })
    expect((await row(id)).delivered_at).not.toBeNull()

    await post(status('wamid.hook-1', 'read'))
    expect(await row(id)).toMatchObject({ status: 'read' })
    expect((await row(id)).read_at).not.toBeNull()
  })

  it('never moves a message backwards when updates arrive out of order', async () => {
    connect()
    const id = await sentRow({ provider_message_id: 'wamid.hook-2' })
    await post(status('wamid.hook-2', 'read'))
    await post(status('wamid.hook-2', 'delivered'))
    expect((await row(id)).status).toBe('read')
  })

  it('records a failed delivery with Meta’s reason', async () => {
    connect()
    const id = await sentRow({ provider_message_id: 'wamid.hook-3' })
    const errors = [{ code: 131026, title: 'Undeliverable' }]
    await post(status('wamid.hook-3', 'failed', { errors }))
    expect(await row(id)).toMatchObject({ status: 'failed', error: 'Undeliverable' })
  })

  it('updates every advisor reminder a summary message covered', async () => {
    connect()
    const a = await sentRow({ recipient_type: 'advisor', summary_message_id: 'wamid.hook-sum' })
    const b = await sentRow({ recipient_type: 'advisor', summary_message_id: 'wamid.hook-sum' })
    await post(status('wamid.hook-sum', 'delivered'))
    expect((await row(a)).status).toBe('delivered')
    expect((await row(b)).status).toBe('delivered')
  })

  it('stores a reply once, however often Meta delivers it, matched to the member', async () => {
    connect()
    await post(reply('wamid.hook-in1', 'When is it due?'))
    await post(reply('wamid.hook-in1', 'When is it due?'))
    const { data } = await admin
      .from('whatsapp_inbound')
      .select('from_mobile, body, member_ids, opt_out')
      .eq('provider_message_id', 'wamid.hook-in1')
    expect(data).toEqual([
      {
        from_mobile: MEMBER_MOBILE,
        body: 'When is it due?',
        member_ids: [memberId],
        opt_out: false,
      },
    ])
  })

  it('opts the member out on STOP, as the client’s own withdrawal, and confirms once', async () => {
    connect()
    const provider = fake.provider as ReturnType<typeof createFakeProvider>

    await post(reply('wamid.hook-stop', 'STOP'))
    await post(reply('wamid.hook-stop', 'STOP'))

    const { data: member } = await admin
      .from('family_members')
      .select('whatsapp_consent')
      .eq('id', memberId)
      .single()
    expect(member!.whatsapp_consent).toBe(false)

    const { data: events } = await admin
      .from('consent_events')
      .select('event, source')
      .eq('member_id', memberId)
      .order('recorded_at')
      .order('id')
    expect(events!.at(-1)).toEqual({ event: 'withdrawn', source: 'client_reply' })

    expect(provider.sent).toEqual([
      {
        to: MEMBER_MOBILE,
        text:
          "You won't receive further reminders from Webhook Advisor. " +
          'Reply START if you change your mind.',
      },
    ])

    const { data: stored } = await admin
      .from('whatsapp_inbound')
      .select('opt_out')
      .eq('provider_message_id', 'wamid.hook-stop')
      .single()
    expect(stored!.opt_out).toBe(true)
  })

  it('stores a reply from an unknown number with no member', async () => {
    connect()
    await post(reply('wamid.hook-stranger', 'Hi', '919812388999'))
    const { data } = await admin
      .from('whatsapp_inbound')
      .select('member_ids')
      .eq('provider_message_id', 'wamid.hook-stranger')
      .single()
    expect(data!.member_ids).toEqual([])
  })
})
