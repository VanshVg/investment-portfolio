import 'server-only'
import { timingSafeEqual } from 'node:crypto'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { whatsappConfig } from '@/lib/whatsapp/config'
import { whatsappProvider } from '@/lib/whatsapp/connection'
import { parseWebhook, verifySignature } from '@/lib/whatsapp/webhook'
import { applyEvents } from '@/lib/whatsapp/inbound'

// Meta's calls must reach the handler every time, never a cached answer.
export const dynamic = 'force-dynamic'

const NOT_FOUND = () => new Response('Not found', { status: 404 })

function same(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

/** Meta's one-time handshake when the webhook is registered. */
export async function GET(request: Request): Promise<Response> {
  const config = whatsappConfig()
  if (!config) return NOT_FOUND()

  const params = new URL(request.url).searchParams
  const challenge = params.get('hub.challenge')
  if (
    params.get('hub.mode') === 'subscribe' &&
    same(params.get('hub.verify_token') ?? '', config.verifyToken) &&
    challenge
  ) {
    return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }
  return new Response('Forbidden', { status: 403 })
}

/**
 * Delivery statuses and replies. Reachable without a session (the session
 * gate exempts this path), so nothing happens until the signature proves the
 * call came from Meta. Answers carry no data, and logs only ids.
 */
export async function POST(request: Request): Promise<Response> {
  const config = whatsappConfig()
  const provider = whatsappProvider()
  if (!config || !provider) return NOT_FOUND()

  // The signature covers the exact bytes received, so it is checked before parsing.
  const rawBody = await request.text()
  if (!verifySignature(rawBody, request.headers.get('x-hub-signature-256'), config.appSecret)) {
    return new Response('Unauthorized', { status: 401 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  try {
    await applyEvents(createAdminSupabase(), parseWebhook(payload), provider)
  } catch (cause) {
    // A 500 makes Meta retry, which is right for a database hiccup; every
    // step above is safe to repeat.
    console.error('whatsapp webhook failed', cause instanceof Error ? cause.message : cause)
    return new Response('Error', { status: 500 })
  }
  return new Response('OK', { status: 200 })
}
