import 'server-only'
import { whatsappConfig } from './config'
import { createMetaProvider } from './meta'
import type { WhatsAppProvider } from './provider'

/** The Meta provider, or null when the credentials are not configured. */
export function whatsappProvider(): WhatsAppProvider | null {
  const config = whatsappConfig()
  return config ? createMetaProvider(config) : null
}

/** An absolute link into the deployed app, for messages sent outside it. */
export function appUrl(path: string): string {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL
  return host ? `https://${host}${path}` : `http://localhost:3000${path}`
}
