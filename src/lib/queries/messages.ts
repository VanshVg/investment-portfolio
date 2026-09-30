import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/types.generated'
import type { SkipReason } from '@/lib/whatsapp/recheck'

type Client = SupabaseClient<Database>

export interface MessageRow {
  id: string
  /** When it was sent, or when it was queued for one that was not. */
  at: string
  familyId: string
  familyName: string
  holdingLabel: string
  dueDate: string
  recipient: 'advisor' | 'client'
  mobile: string
  status: string
  /** Meta's reason for a failure, or why a reminder was skipped. */
  detail: string | null
  /** Previewed on the advisor's number in Test mode, not sent to the recipient. */
  test: boolean
}

export interface ReplyRow {
  id: string
  from: string
  body: string
  receivedAt: string
  optOut: boolean
  handled: boolean
  senders: { name: string; familyId: string; familyName: string }[]
}

export const SKIP_REASONS: Record<SkipReason, string> = {
  deleted: 'Deleted',
  reminders_off: 'Reminders switched off',
  resolved: 'Already paid or renewed',
  expired: 'Due date had passed',
  managed_elsewhere: 'Now managed elsewhere',
  member_removed: 'Member removed',
  no_consent: 'No WhatsApp consent',
  no_mobile: 'No mobile number',
  superseded: 'Replaced by a later reminder',
}

const LOG_SELECT = `
  id, created_at, sent_at, test_sent_at, recipient_type, recipient_mobile,
  status, error, skip_reason,
  due_instances!inner ( due_date, holdings!inner ( label, families!inner ( id, name ) ) )`

const RECENT_DAYS = 30
const LIMIT = 200

function toMessageRow(row: Record<string, unknown>): MessageRow {
  const instance = row.due_instances as { due_date: string; holdings: Record<string, unknown> }
  const family = instance.holdings.families as { id: string; name: string }
  const skip = row.skip_reason as SkipReason | null
  return {
    id: row.id as string,
    at: (row.sent_at ?? row.test_sent_at ?? row.created_at) as string,
    familyId: family.id,
    familyName: family.name,
    holdingLabel: instance.holdings.label as string,
    dueDate: instance.due_date,
    recipient: row.recipient_type as 'advisor' | 'client',
    mobile: row.recipient_mobile as string,
    status: row.status as string,
    detail: skip ? (SKIP_REASONS[skip] ?? skip) : ((row.error as string | null) ?? null),
    test: row.status === 'pending' && row.test_sent_at !== null,
  }
}

function since(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

/** Messages that did not go out, most recent first: what the advisor may need to act on. */
export async function listFailedMessages(client: Client): Promise<MessageRow[]> {
  const { data, error } = await client
    .from('reminder_log')
    .select(LOG_SELECT)
    .eq('status', 'failed')
    .gte('created_at', since(RECENT_DAYS))
    .order('created_at', { ascending: false })
    .limit(LIMIT)
  if (error) throw new Error(`listing failed messages failed: ${error.message}`)
  return (data as unknown as Record<string, unknown>[]).map(toMessageRow)
}

/**
 * The last month's reminders that were dealt with — sent, delivered, read or
 * skipped — plus Test-mode previews. Still-queued ones are not messages yet.
 */
export async function listRecentMessages(client: Client): Promise<MessageRow[]> {
  const { data, error } = await client
    .from('reminder_log')
    .select(LOG_SELECT)
    .or('status.in.(sent,delivered,read,skipped),test_sent_at.not.is.null')
    .neq('status', 'failed')
    .gte('created_at', since(RECENT_DAYS))
    .order('created_at', { ascending: false })
    .limit(LIMIT)
  if (error) throw new Error(`listing recent messages failed: ${error.message}`)
  return (data as unknown as Record<string, unknown>[]).map(toMessageRow)
}

/** Clients' replies, the unhandled ones first, with who sent each when the number is known. */
export async function listReplies(client: Client): Promise<ReplyRow[]> {
  const { data, error } = await client
    .from('whatsapp_inbound')
    .select('id, from_mobile, body, received_at, opt_out, handled_at, member_ids')
    .order('handled_at', { ascending: false, nullsFirst: true })
    .order('received_at', { ascending: false })
    .limit(LIMIT)
  if (error) throw new Error(`listing replies failed: ${error.message}`)

  const memberIds = [...new Set((data ?? []).flatMap((row) => row.member_ids))]
  const { data: members, error: membersError } = memberIds.length
    ? await client
        .from('family_members')
        .select('id, name, families!inner ( id, name )')
        .in('id', memberIds)
    : { data: [], error: null }
  if (membersError) throw new Error(`naming reply senders failed: ${membersError.message}`)
  const byId = new Map(
    (members ?? []).map((member) => {
      const family = member.families as unknown as { id: string; name: string }
      return [member.id, { name: member.name, familyId: family.id, familyName: family.name }]
    }),
  )

  return (data ?? []).map((row) => ({
    id: row.id,
    from: row.from_mobile,
    body: row.body,
    receivedAt: row.received_at,
    optOut: row.opt_out,
    handled: row.handled_at !== null,
    senders: row.member_ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])),
  }))
}
