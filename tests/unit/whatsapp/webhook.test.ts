import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { isOptOut, parseWebhook, verifySignature } from '@/lib/whatsapp/webhook'

const SECRET = 'app-secret'
const sign = (body: string, secret = SECRET) =>
  `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`

describe('verifySignature', () => {
  const body = '{"object":"whatsapp_business_account"}'

  it('accepts Meta’s signature of the exact body', () => {
    expect(verifySignature(body, sign(body), SECRET)).toBe(true)
  })

  it('rejects a body changed after signing', () => {
    expect(verifySignature(body + ' ', sign(body), SECRET)).toBe(false)
  })

  it('rejects a signature made with another secret', () => {
    expect(verifySignature(body, sign(body, 'other'), SECRET)).toBe(false)
  })

  it('rejects a missing or malformed header', () => {
    expect(verifySignature(body, null, SECRET)).toBe(false)
    expect(verifySignature(body, 'sha256=nothex', SECRET)).toBe(false)
    expect(verifySignature(body, sign(body).replace('sha256=', 'sha1='), SECRET)).toBe(false)
  })
})

const envelope = (value: Record<string, unknown>) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: 'waba', changes: [{ field: 'messages', value }] }],
})

describe('parseWebhook', () => {
  it('reads delivery statuses, with the time and any error', () => {
    const events = parseWebhook(
      envelope({
        statuses: [
          {
            id: 'wamid.1',
            status: 'delivered',
            timestamp: '1788000000',
            recipient_id: '919800000001',
          },
          {
            id: 'wamid.2',
            status: 'failed',
            timestamp: '1788000060',
            errors: [{ code: 131026, title: 'Message undeliverable' }],
          },
        ],
      }),
    )
    expect(events).toEqual([
      {
        kind: 'status',
        messageId: 'wamid.1',
        status: 'delivered',
        at: new Date(1788000000 * 1000),
      },
      {
        kind: 'status',
        messageId: 'wamid.2',
        status: 'failed',
        at: new Date(1788000060 * 1000),
        error: 'Message undeliverable',
      },
    ])
  })

  it('reads a text reply, with the sender’s number in E.164', () => {
    expect(
      parseWebhook(
        envelope({
          messages: [
            {
              from: '919800000001',
              id: 'wamid.in1',
              timestamp: '1788000000',
              type: 'text',
              text: { body: 'Thanks!' },
            },
          ],
        }),
      ),
    ).toEqual([
      {
        kind: 'message',
        messageId: 'wamid.in1',
        from: '+919800000001',
        body: 'Thanks!',
        at: new Date(1788000000 * 1000),
      },
    ])
  })

  it('records a non-text reply by its kind', () => {
    const [event] = parseWebhook(
      envelope({
        messages: [
          { from: '919800000001', id: 'wamid.in2', timestamp: '1788000000', type: 'image' },
        ],
      }),
    )
    expect(event).toMatchObject({ kind: 'message', body: '[image]' })
  })

  it('ignores anything it does not recognise', () => {
    expect(parseWebhook(null)).toEqual([])
    expect(parseWebhook({ object: 'page' })).toEqual([])
    const unknownStatus = envelope({ statuses: [{ id: 'x', status: 'deleted', timestamp: '1' }] })
    expect(parseWebhook(unknownStatus)).toEqual([])
    const otherField = {
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ field: 'x' }] }],
    }
    expect(parseWebhook(otherField)).toEqual([])
  })
})

describe('isOptOut', () => {
  it.each(['STOP', 'stop', ' Stop. ', 'Unsubscribe', 'opt out', 'OPT-OUT', 'optout', 'stop all!'])(
    'treats %j as an opt-out',
    (text) => expect(isOptOut(text)).toBe(true),
  )

  it.each(['stop the policy?', 'cancel', 'please stop sending the other one', 'START', ''])(
    'does not treat %j as an opt-out',
    (text) => expect(isOptOut(text)).toBe(false),
  )
})
