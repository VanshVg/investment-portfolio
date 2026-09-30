import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/types.generated'
import type { WhatsAppProvider } from './provider'
import { isOptOut, type WebhookEvent } from './webhook'
import { optOutConfirmation } from './messages'

type Client = SupabaseClient<Database>

/**
 * Statuses only move forward: Meta does not promise to deliver them in
 * order, and a late "delivered" must not undo a "read". A failure is only
 * believed of a message not yet known to have arrived.
 */
const MOVES = {
  delivered: { from: ['sent'], at: 'delivered_at' },
  read: { from: ['sent', 'delivered'], at: 'read_at' },
  failed: { from: ['sending', 'sent'], at: null },
} as const

/** Applies one webhook call's events. Safe to receive the same call twice. */
export async function applyEvents(
  client: Client,
  events: WebhookEvent[],
  provider: WhatsAppProvider,
): Promise<void> {
  for (const event of events) {
    if (event.kind === 'status') await applyStatus(client, event)
    else await storeMessage(client, event, provider)
  }
}

async function applyStatus(client: Client, event: Extract<WebhookEvent, { kind: 'status' }>) {
  // 'sent' is what the app already recorded when Meta accepted the message.
  if (event.status === 'sent') return
  const move = MOVES[event.status]
  const update = {
    status: event.status,
    ...(move.at && { [move.at]: event.at.toISOString() }),
    ...(event.status === 'failed' && { error: event.error ?? 'Not delivered' }),
  }
  // A client reminder carries its own message id; the advisor's rows share
  // the id of the summary that covered them.
  for (const column of ['provider_message_id', 'summary_message_id'] as const) {
    const { error } = await client
      .from('reminder_log')
      .update(update)
      .eq(column, event.messageId)
      .in('status', [...move.from])
      .select('id')
    if (error) throw new Error(`applying a delivery status failed: ${error.message}`)
  }
}

async function storeMessage(
  client: Client,
  event: Extract<WebhookEvent, { kind: 'message' }>,
  provider: WhatsAppProvider,
) {
  const { data: members, error: membersError } = await client
    .from('family_members')
    .select('id, families!inner ( profiles:owner_advisor_id ( full_name ) )')
    .eq('mobile', event.from)
    .is('deleted_at', null)
  if (membersError) throw new Error(`matching a reply failed: ${membersError.message}`)

  const optOut = isOptOut(event.body)
  const { data: stored, error } = await client
    .from('whatsapp_inbound')
    .upsert(
      {
        from_mobile: event.from,
        body: event.body,
        provider_message_id: event.messageId,
        received_at: event.at.toISOString(),
        member_ids: (members ?? []).map((member) => member.id),
        opt_out: optOut,
      },
      { onConflict: 'provider_message_id', ignoreDuplicates: true },
    )
    .select('id')
  if (error) throw new Error(`storing a reply failed: ${error.message}`)

  // Already stored: this is Meta delivering the same message again, and the
  // opt-out and its confirmation already happened the first time.
  if (!stored || stored.length === 0) return
  if (!optOut || !members || members.length === 0) return

  const { error: withdrawError } = await client.rpc('withdraw_consent_by_reply', {
    p_mobile: event.from,
  })
  if (withdrawError) throw new Error(`recording an opt-out failed: ${withdrawError.message}`)

  const family = members[0].families as unknown as { profiles: { full_name: string } | null }
  // Free text is allowed here: the client's own message opened a 24-hour window.
  const advisorName = family.profiles?.full_name ?? 'your advisor'
  await provider.sendText(event.from, optOutConfirmation(advisorName))
}
