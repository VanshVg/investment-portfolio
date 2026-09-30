import 'server-only'
import type { WhatsAppConfig } from './config'
import type { SendResult, WhatsAppProvider } from './provider'

/**
 * Meta's WhatsApp Cloud API. `fetchImpl` is a seam for tests; nothing in the
 * test suite reaches Meta.
 */
export function createMetaProvider(
  config: WhatsAppConfig,
  fetchImpl: typeof fetch = fetch,
): WhatsAppProvider {
  const url = `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`

  async function post(to: string, message: Record<string, unknown>): Promise<SendResult> {
    let response: Response
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
        // Meta takes the number without its leading +.
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: to.replace(/^\+/, ''),
          ...message,
        }),
      })
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause)
      return { ok: false, retryable: true, error: `Network error: ${reason}` }
    }

    const body = (await response.json().catch(() => null)) as {
      messages?: { id?: string }[]
      error?: { message?: string }
    } | null

    const messageId = body?.messages?.[0]?.id
    if (response.ok && messageId) return { ok: true, messageId }

    return {
      ok: false,
      retryable: response.status === 429 || response.status >= 500,
      error: body?.error?.message ?? `HTTP ${response.status}`,
    }
  }

  return {
    sendTemplate(to, template, params) {
      return post(to, {
        type: 'template',
        template: {
          name: template,
          language: { code: config.language },
          ...(params.length > 0 && {
            components: [
              { type: 'body', parameters: params.map((text) => ({ type: 'text', text })) },
            ],
          }),
        },
      })
    },
    sendText(to, body) {
      return post(to, { type: 'text', text: { body } })
    },
  }
}
