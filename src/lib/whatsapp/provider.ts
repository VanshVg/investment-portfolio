export type SendResult =
  | { ok: true; messageId: string }
  | {
      ok: false
      /** Worth trying again on a later run: rate limiting, Meta's own errors, the network. */
      retryable: boolean
      error: string
    }

/**
 * How the app sends a WhatsApp message. Meta's Cloud API is the real one;
 * the fake stands in everywhere else. Numbers are E.164 with the `+`.
 */
export interface WhatsAppProvider {
  /**
   * A pre-approved template: the only kind of message a business may start a
   * conversation with. `language` overrides the configured one.
   */
  sendTemplate(
    to: string,
    template: string,
    params: string[],
    language?: string,
  ): Promise<SendResult>
  /** Free-form text, allowed only within 24 hours of the recipient's last message. */
  sendText(to: string, body: string): Promise<SendResult>
}
