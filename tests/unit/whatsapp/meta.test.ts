import { describe, expect, it, vi } from 'vitest'
import { createMetaProvider } from '@/lib/whatsapp/meta'
import type { WhatsAppConfig } from '@/lib/whatsapp/config'

const CONFIG: WhatsAppConfig = {
  accessToken: 'secret-token',
  phoneNumberId: '1234567890',
  appSecret: 'app-secret',
  verifyToken: 'verify',
  apiVersion: 'v23.0',
  language: 'en',
}

type Call = [string, RequestInit]

function bodyOf(fetchImpl: ReturnType<typeof vi.fn>) {
  return JSON.parse((fetchImpl.mock.calls[0] as unknown as Call)[1].body as string)
}

function respond(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }))
}

describe('Meta provider', () => {
  it('posts a template message to the Cloud API with the body parameters', async () => {
    const fetchImpl = respond(200, { messages: [{ id: 'wamid.1' }] })
    const provider = createMetaProvider(CONFIG, fetchImpl)

    const result = await provider.sendTemplate('+919876543210', 'policy_due_reminder', ['A', 'B'])

    expect(result).toEqual({ ok: true, messageId: 'wamid.1' })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as Call
    expect(url).toBe('https://graph.facebook.com/v23.0/1234567890/messages')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer secret-token',
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(init.body as string)).toEqual({
      messaging_product: 'whatsapp',
      to: '919876543210',
      type: 'template',
      template: {
        name: 'policy_due_reminder',
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: 'A' },
              { type: 'text', text: 'B' },
            ],
          },
        ],
      },
    })
  })

  it('sends a template without parameters with no components', async () => {
    const fetchImpl = respond(200, { messages: [{ id: 'wamid.2' }] })
    const provider = createMetaProvider(CONFIG, fetchImpl)
    await provider.sendTemplate('+919876543210', 'hello_world', [])
    const body = bodyOf(fetchImpl)
    expect(body.template).toEqual({ name: 'hello_world', language: { code: 'en' } })
  })

  it('sends in a different language when asked, as Meta’s own hello_world needs', async () => {
    const fetchImpl = respond(200, { messages: [{ id: 'wamid.4' }] })
    const provider = createMetaProvider(CONFIG, fetchImpl)
    await provider.sendTemplate('+919876543210', 'hello_world', [], 'en_US')
    expect(bodyOf(fetchImpl).template.language).toEqual({ code: 'en_US' })
  })

  it('sends a plain text message', async () => {
    const fetchImpl = respond(200, { messages: [{ id: 'wamid.3' }] })
    const provider = createMetaProvider(CONFIG, fetchImpl)
    const result = await provider.sendText('+919876543210', 'Done.')
    expect(result).toEqual({ ok: true, messageId: 'wamid.3' })
    const body = bodyOf(fetchImpl)
    expect(body).toEqual({
      messaging_product: 'whatsapp',
      to: '919876543210',
      type: 'text',
      text: { body: 'Done.' },
    })
  })

  it('treats rate limiting and server errors as worth retrying', async () => {
    for (const status of [429, 500, 503]) {
      const provider = createMetaProvider(CONFIG, respond(status, { error: { message: 'busy' } }))
      expect(await provider.sendTemplate('+919876543210', 't', [])).toEqual({
        ok: false,
        retryable: true,
        error: 'busy',
      })
    }
  })

  it('reports any other rejection with Meta’s own message, not to be retried', async () => {
    const provider = createMetaProvider(
      CONFIG,
      respond(400, {
        error: { message: 'Recipient phone number not in allowed list', code: 131030 },
      }),
    )
    expect(await provider.sendTemplate('+919876543210', 't', [])).toEqual({
      ok: false,
      retryable: false,
      error: 'Recipient phone number not in allowed list',
    })
  })

  it('treats a network failure as worth retrying, without echoing the token', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('connect ECONNRESET')
    })
    const provider = createMetaProvider(CONFIG, fetchImpl)
    const result = await provider.sendTemplate('+919876543210', 't', [])
    expect(result).toEqual({
      ok: false,
      retryable: true,
      error: 'Network error: connect ECONNRESET',
    })
    expect(JSON.stringify(result)).not.toContain('secret-token')
  })
})
