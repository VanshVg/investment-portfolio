import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/types.generated'
import { appUrl, whatsappProvider } from './connection'
import { runSender, type SenderResult } from './send'
import { getWhatsAppMode } from './settings'

/**
 * The daily cron's WhatsApp step. Without the Meta credentials this is Off
 * whatever the saved mode says, and touches nothing.
 */
export async function sendQueuedWhatsApp(
  client: SupabaseClient<Database>,
  today: string,
): Promise<SenderResult> {
  const provider = whatsappProvider()
  if (!provider) return { mode: 'off', sent: 0, skipped: 0, failed: 0, deferred: 0 }

  const mode = await getWhatsAppMode(client)
  return runSender(client, { today, mode, provider, renewalsUrl: appUrl('/renewals') })
}
