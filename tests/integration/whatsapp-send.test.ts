import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminClient, ensureUser } from '../helpers/db'
import { runSender } from '@/lib/whatsapp/send'
import { createFakeProvider, type SentMessage } from '@/lib/whatsapp/fake'
import type { SendResult } from '@/lib/whatsapp/provider'

/**
 * The sender against the local database, with the fake provider. Every run
 * is limited to this file's own households, so the pending reminders other
 * suites queue in parallel are never touched.
 */
const EMAIL = 'whatsapp-send-admin@example.test'
const PASSWORD = 'test-password-123'
const ADVISOR_MOBILE = '+919812377000'
const CLIENT_MOBILE = '+919812377001'
const TODAY = '2027-03-01'
const DUE = '2027-03-15'
const RENEWALS_URL = 'https://app.test/renewals'

const admin = adminClient()
let advisorId: string
const familyIds: string[] = []

interface Household {
  familyId: string
  memberId: string
  holdingId: string
  dueInstanceId: string
}

async function household(
  name: string,
  options: {
    member?: Record<string, unknown>
    holding?: Record<string, unknown>
    instance?: Record<string, unknown>
  } = {},
): Promise<Household> {
  const { data: family } = await admin
    .from('families')
    .insert({ name, owner_advisor_id: advisorId })
    .select('id')
    .single()
  familyIds.push(family!.id)
  const { data: member } = await admin
    .from('family_members')
    .insert({
      family_id: family!.id,
      name: `${name} member`,
      relation: 'self',
      mobile: CLIENT_MOBILE,
      whatsapp_consent: true,
      ...options.member,
    })
    .select('id')
    .single()
  const { data: holding } = await admin
    .from('holdings')
    .insert({
      family_id: family!.id,
      member_id: member!.id,
      category: 'life_insurance',
      label: `${name} policy`,
      anchor_due_date: DUE,
      next_due_date: DUE,
      ...options.holding,
    })
    .select('id')
    .single()
  // A holding's own schedule may already have produced this instance.
  await admin.from('due_instances').delete().eq('holding_id', holding!.id)
  const { data: instance, error } = await admin
    .from('due_instances')
    .insert({ holding_id: holding!.id, due_date: DUE, amount_due: 12500, ...options.instance })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return {
    familyId: family!.id,
    memberId: member!.id,
    holdingId: holding!.id,
    dueInstanceId: instance!.id,
  }
}

async function queue(
  dueInstanceId: string,
  daysBefore: number,
  recipientType: 'advisor' | 'client',
  extra: Record<string, unknown> = {},
): Promise<string> {
  const { data, error } = await admin
    .from('reminder_log')
    .insert({
      due_instance_id: dueInstanceId,
      days_before: daysBefore,
      recipient_type: recipientType,
      recipient_mobile: recipientType === 'advisor' ? ADVISOR_MOBILE : CLIENT_MOBILE,
      ...extra,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data!.id
}

async function logRow(id: string) {
  const { data } = await admin.from('reminder_log').select('*').eq('id', id).single()
  return data!
}

function run(
  mode: 'off' | 'test' | 'live',
  only: Household[],
  respond?: (message: SentMessage) => SendResult | null,
) {
  const provider = createFakeProvider(respond)
  const result = runSender(admin, {
    today: TODAY,
    mode,
    provider,
    renewalsUrl: RENEWALS_URL,
    familyIds: only.map((h) => h.familyId),
  })
  return { provider, result }
}

beforeAll(async () => {
  const user = await ensureUser(EMAIL, PASSWORD, 'admin')
  advisorId = user!.id
  await admin
    .from('profiles')
    .update({ mobile: ADVISOR_MOBILE, full_name: 'Test Advisor' })
    .eq('id', advisorId)
})

afterAll(async () => {
  if (familyIds.length > 0) await admin.from('families').delete().in('id', familyIds)
})

describe('runSender, live', () => {
  it('sends a client reminder with the template’s parameters and records it as sent', async () => {
    const h = await household('WA live send')
    const id = await queue(h.dueInstanceId, 15, 'client')

    const { provider, result } = run('live', [h])
    expect(await result).toMatchObject({ mode: 'live', sent: 1, failed: 0 })

    expect(provider.sent).toEqual([
      {
        to: CLIENT_MOBILE,
        template: 'policy_due_reminder',
        params: [
          'WA live send member',
          'Test Advisor',
          'WA live send policy',
          '15-03-2027',
          '₹12,500',
        ],
      },
    ])
    const row = await logRow(id)
    expect(row.status).toBe('sent')
    expect(row.provider_message_id).toBe('wamid.fake-1')
    expect(row.sent_at).not.toBeNull()
    expect(row.attempts).toBe(1)
  })

  it('records why each invalid reminder was skipped, and sends none of them', async () => {
    const cases: [string, Parameters<typeof household>[1], string][] = [
      ['WA skip consent', { member: { whatsapp_consent: false } }, 'no_consent'],
      ['WA skip external', { holding: { managed_by: 'external' } }, 'managed_elsewhere'],
      ['WA skip off', { holding: { reminders_enabled: false } }, 'reminders_off'],
      ['WA skip paid', { instance: { payment_status: 'paid' } }, 'resolved'],
      ['WA skip removed', { member: { deleted_at: new Date().toISOString() } }, 'member_removed'],
      [
        'WA skip expired',
        { instance: { due_date: '2027-02-20' }, holding: { next_due_date: '2027-02-20' } },
        'expired',
      ],
    ]
    for (const [name, options, reason] of cases) {
      const h = await household(name, options)
      const id = await queue(h.dueInstanceId, 15, 'client')
      const { provider, result } = run('live', [h])
      expect(await result, name).toMatchObject({ sent: 0, skipped: 1 })
      expect(provider.sent, name).toEqual([])
      expect(await logRow(id), name).toMatchObject({ status: 'skipped', skip_reason: reason })
    }
  })

  it('sends to a consented client’s new number and records it', async () => {
    const h = await household('WA new number', { member: { mobile: '+919812377009' } })
    const id = await queue(h.dueInstanceId, 15, 'client')

    const { provider, result } = run('live', [h])
    await result
    expect(provider.sent[0].to).toBe('+919812377009')
    expect((await logRow(id)).recipient_mobile).toBe('+919812377009')
  })

  it('sends one reminder when several windows are pending, superseding the rest', async () => {
    const h = await household('WA catch-up')
    const older = await queue(h.dueInstanceId, 30, 'client')
    const latest = await queue(h.dueInstanceId, 15, 'client')

    const { provider, result } = run('live', [h])
    expect(await result).toMatchObject({ sent: 1, skipped: 1 })
    expect(provider.sent).toHaveLength(1)
    expect(await logRow(latest)).toMatchObject({ status: 'sent' })
    expect(await logRow(older)).toMatchObject({ status: 'skipped', skip_reason: 'superseded' })
  })

  it('returns a temporary failure to the queue, and gives up on the third attempt', async () => {
    const h = await household('WA retry')
    const id = await queue(h.dueInstanceId, 15, 'client')
    const busy = () => ({ ok: false as const, retryable: true, error: 'busy' })

    for (const attempt of [1, 2]) {
      const { result } = run('live', [h], busy)
      expect(await result).toMatchObject({ sent: 0, failed: 1 })
      expect(await logRow(id)).toMatchObject({
        status: 'pending',
        attempts: attempt,
        error: 'busy',
      })
    }
    const { result } = run('live', [h], busy)
    await result
    expect(await logRow(id)).toMatchObject({ status: 'failed', attempts: 3, error: 'busy' })
  })

  it('fails a permanent rejection at once, with Meta’s reason', async () => {
    const h = await household('WA rejected')
    const id = await queue(h.dueInstanceId, 15, 'client')
    const { result } = run('live', [h], () => ({
      ok: false,
      retryable: false,
      error: 'Recipient not on WhatsApp',
    }))
    expect(await result).toMatchObject({ failed: 1 })
    expect(await logRow(id)).toMatchObject({
      status: 'failed',
      attempts: 1,
      error: 'Recipient not on WhatsApp',
    })
  })

  it('does not send a reminder another run has already claimed', async () => {
    const h = await household('WA claimed')
    const id = await queue(h.dueInstanceId, 15, 'client', {
      status: 'sending',
      claimed_at: new Date().toISOString(),
    })
    const { provider, result } = run('live', [h])
    await result
    expect(provider.sent).toEqual([])
    expect((await logRow(id)).status).toBe('sending')
  })

  it('fails a reminder left mid-send by a run that died, without sending it again', async () => {
    const h = await household('WA stuck')
    const id = await queue(h.dueInstanceId, 15, 'client', {
      status: 'sending',
      claimed_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    })
    const { provider, result } = run('live', [h])
    expect(await result).toMatchObject({ failed: 1 })
    expect(provider.sent).toEqual([])
    const row = await logRow(id)
    expect(row.status).toBe('failed')
    expect(row.error).toMatch(/interrupted/i)
  })

  it('sends the advisor one summary covering every advisor reminder', async () => {
    const a = await household('WA summary A')
    const b = await household('WA summary B', {
      instance: { due_date: '2027-03-10' },
      holding: { anchor_due_date: '2027-03-10', next_due_date: '2027-03-10' },
    })
    const rowA = await queue(a.dueInstanceId, 15, 'advisor')
    const rowB = await queue(b.dueInstanceId, 15, 'advisor')

    const { provider, result } = run('live', [a, b])
    expect(await result).toMatchObject({ sent: 1 })
    expect(provider.sent).toEqual([
      {
        to: ADVISOR_MOBILE,
        template: 'advisor_daily_summary',
        params: [
          '2',
          'WA summary B – WA summary B policy (10-03-2027); ' +
            'WA summary A – WA summary A policy (15-03-2027)',
          '0',
          RENEWALS_URL,
        ],
      },
    ])
    for (const id of [rowA, rowB]) {
      expect(await logRow(id)).toMatchObject({
        status: 'sent',
        summary_message_id: 'wamid.fake-1',
      })
    }
  })

  it('counts overdue unpaid due dates in the summary', async () => {
    const h = await household('WA overdue')
    await admin
      .from('due_instances')
      .insert({ holding_id: h.holdingId, due_date: '2027-02-01', payment_status: 'unpaid' })
    await admin.from('holdings').update({ next_due_date: '2027-02-01' }).eq('id', h.holdingId)
    await queue(h.dueInstanceId, 15, 'advisor')

    const { provider, result } = run('live', [h])
    await result
    expect(provider.sent[0].params?.[2]).toBe('1')
  })
})

describe('runSender, test mode', () => {
  it('sends the real client message to the advisor, and leaves the reminder pending', async () => {
    const h = await household('WA test preview')
    const id = await queue(h.dueInstanceId, 15, 'client')

    const { provider, result } = run('test', [h])
    expect(await result).toMatchObject({ mode: 'test', sent: 1 })
    expect(provider.sent).toEqual([
      expect.objectContaining({ to: ADVISOR_MOBILE, template: 'policy_due_reminder' }),
    ])
    const row = await logRow(id)
    expect(row.status).toBe('pending')
    expect(row.test_sent_at).not.toBeNull()
    expect(row.sent_at).toBeNull()

    // Previewed once only.
    const second = run('test', [h])
    await second.result
    expect(second.provider.sent).toEqual([])

    // Live later sends it to the client for real.
    const live = run('live', [h])
    await live.result
    expect(live.provider.sent[0].to).toBe(CLIENT_MOBILE)
    expect((await logRow(id)).status).toBe('sent')
  })

  it('sends nothing and changes nothing when the advisor has no number', async () => {
    const h = await household('WA test no advisor number')
    const id = await queue(h.dueInstanceId, 15, 'client')
    await admin.from('profiles').update({ mobile: null }).eq('id', advisorId)
    try {
      const { provider, result } = run('test', [h])
      await result
      expect(provider.sent).toEqual([])
      expect(await logRow(id)).toMatchObject({ status: 'pending', test_sent_at: null })
    } finally {
      await admin.from('profiles').update({ mobile: ADVISOR_MOBILE }).eq('id', advisorId)
    }
  })
})

describe('runSender, off', () => {
  it('sends and changes nothing', async () => {
    const h = await household('WA off')
    const id = await queue(h.dueInstanceId, 15, 'client')
    const { provider, result } = run('off', [h])
    expect(await result).toEqual({ mode: 'off', sent: 0, skipped: 0, failed: 0, deferred: 0 })
    expect(provider.sent).toEqual([])
    expect((await logRow(id)).status).toBe('pending')
  })
})
