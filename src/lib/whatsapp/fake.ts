import type { SendResult, WhatsAppProvider } from './provider'

export interface SentMessage {
  to: string
  template?: string
  params?: string[]
  text?: string
}

/**
 * Records what would have been sent, and sends nothing. `respond` lets a test
 * make a particular send fail.
 */
export function createFakeProvider(
  respond: (message: SentMessage) => SendResult | null = () => null,
): WhatsAppProvider & { sent: SentMessage[] } {
  const sent: SentMessage[] = []
  let next = 1

  function record(message: SentMessage): Promise<SendResult> {
    const forced = respond(message)
    if (forced) return Promise.resolve(forced)
    sent.push(message)
    return Promise.resolve({ ok: true, messageId: `wamid.fake-${next++}` })
  }

  return {
    sent,
    sendTemplate: (to, template, params) => record({ to, template, params }),
    sendText: (to, text) => record({ to, text }),
  }
}
