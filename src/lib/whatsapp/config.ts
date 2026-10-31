import 'server-only'

export interface WhatsAppConfig {
  accessToken: string
  phoneNumberId: string
  /** Signs Meta's webhook calls; checked on every one. */
  appSecret: string
  /** Echoed by Meta once, when the webhook is registered. */
  verifyToken: string
  apiVersion: string
  language: string
}

/**
 * The Meta credentials, or null when any required one is missing. Null is
 * the shipped state: the app is not connected, the mode cannot leave Off,
 * nothing is sent and the webhook answers 404.
 */
export function whatsappConfig(): WhatsAppConfig | null {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const appSecret = process.env.WHATSAPP_APP_SECRET
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN
  if (!accessToken || !phoneNumberId || !appSecret || !verifyToken) return null
  return {
    accessToken,
    phoneNumberId,
    appSecret,
    verifyToken,
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v23.0',
    language: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en',
  }
}

export function isConnected(): boolean {
  return whatsappConfig() !== null
}
