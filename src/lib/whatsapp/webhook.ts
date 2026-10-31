import { createHmac, timingSafeEqual } from 'node:crypto'

export type WebhookEvent =
  | {
      kind: 'status'
      messageId: string
      status: 'sent' | 'delivered' | 'read' | 'failed'
      at: Date
      error?: string
    }
  | { kind: 'message'; messageId: string; from: string; body: string; at: Date }

/**
 * Whether Meta sent this body: `X-Hub-Signature-256` is `sha256=` and the
 * HMAC-SHA256 of the raw body under the app secret. Compared in constant
 * time. The body must be the exact bytes received, before any parsing.
 */
export function verifySignature(rawBody: string, header: string | null, appSecret: string) {
  if (!header?.startsWith('sha256=')) return false
  const given = Buffer.from(header.slice('sha256='.length), 'hex')
  const expected = createHmac('sha256', appSecret).update(rawBody).digest()
  return given.length === expected.length && timingSafeEqual(given, expected)
}

const STATUSES = new Set(['sent', 'delivered', 'read', 'failed'])

/**
 * The events in one webhook call, in Meta's documented shape
 * (entry → changes → value → statuses / messages). Anything unrecognised is
 * dropped rather than thrown on: Meta retries a call that fails, and an
 * event this app has no use for would then be retried for days.
 */
export function parseWebhook(payload: unknown): WebhookEvent[] {
  const events: WebhookEvent[] = []
  const root = payload as { object?: string; entry?: unknown[] } | null
  if (root?.object !== 'whatsapp_business_account' || !Array.isArray(root.entry)) return events

  for (const entry of root.entry as { changes?: unknown[] }[]) {
    for (const change of (entry?.changes ?? []) as { field?: string; value?: Value }[]) {
      if (change?.field !== 'messages' || !change.value) continue

      for (const status of change.value.statuses ?? []) {
        if (!status?.id || !STATUSES.has(status.status ?? '')) continue
        const error = status.errors?.[0]
        events.push({
          kind: 'status',
          messageId: status.id,
          status: status.status as 'sent' | 'delivered' | 'read' | 'failed',
          at: fromUnix(status.timestamp),
          ...(error && { error: error.title ?? error.message ?? `Error ${error.code}` }),
        })
      }

      for (const message of change.value.messages ?? []) {
        if (!message?.id || !message.from) continue
        events.push({
          kind: 'message',
          messageId: message.id,
          from: `+${message.from.replace(/^\+/, '')}`,
          body:
            message.type === 'text'
              ? (message.text?.body ?? '')
              : `[${message.type ?? 'message'}]`,
          at: fromUnix(message.timestamp),
        })
      }
    }
  }
  return events
}

interface Value {
  statuses?: {
    id?: string
    status?: string
    timestamp?: string
    errors?: { code?: number; title?: string; message?: string }[]
  }[]
  messages?: {
    id?: string
    from?: string
    timestamp?: string
    type?: string
    text?: { body?: string }
  }[]
}

function fromUnix(seconds: string | undefined): Date {
  const value = Number(seconds)
  return Number.isFinite(value) && value > 0 ? new Date(value * 1000) : new Date()
}

const OPT_OUT_PHRASES = new Set(['stop', 'unsubscribe', 'opt out', 'optout', 'stop all'])

/**
 * A reply that is, in its entirety, a request to stop — not any message that
 * mentions stopping. "Stop the policy?" is a question for the advisor, and
 * reading it as a withdrawal would silently cut the client off.
 */
export function isOptOut(text: string): boolean {
  const normalised = text
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim()
  return OPT_OUT_PHRASES.has(normalised)
}
