import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/types.generated'
import type { WhatsAppProvider, SendResult } from './provider'
import type { WhatsAppMode } from './settings'
import { recheck, type RowState, type SkipReason } from './recheck'
import { applyCap, collapseCatchUp, CLIENT_CAP_PER_RUN } from './plan'
import {
  advisorSummaryParams,
  clientReminderParams,
  TEMPLATES,
  type SummaryItem,
} from './messages'

export interface SenderResult {
  mode: WhatsAppMode
  /** Messages that went out. */
  sent: number
  /** Queued reminders that were no longer valid, with the reason recorded on each. */
  skipped: number
  /** Messages that failed, including ones interrupted mid-send by an earlier run. */
  failed: number
  /** Valid client reminders left for the next run by the per-run cap. */
  deferred: number
}

export interface SenderOptions {
  today: string
  mode: WhatsAppMode
  provider: WhatsAppProvider
  /** The Renewals page, linked from the advisor's summary. */
  renewalsUrl: string
  /** Limits the run to these households. The daily run passes nothing and covers all. */
  familyIds?: string[]
  now?: Date
}

/** Retried on later runs up to this many attempts in all, then left failed for the advisor. */
const MAX_ATTEMPTS = 3
const RETRY = 'pending' as const
const FAILED = 'failed' as const
/** A claim older than this belongs to a run that died mid-send. */
const STUCK_AFTER_MS = 60 * 60 * 1000

const PENDING_SELECT = `
  id, due_instance_id, days_before, recipient_type, recipient_mobile, attempts,
  due_instances!inner (
    due_date, amount_due, payment_status, off_schedule,
    holdings!inner (
      label, managed_by, reminders_enabled, next_due_date, deleted_at, family_id,
      families!inner ( name, deleted_at, profiles:owner_advisor_id ( full_name, mobile ) ),
      family_members ( name, mobile, whatsapp_consent, deleted_at )
    )
  )`

interface Loaded {
  id: string
  dueInstanceId: string
  daysBefore: number
  recipientType: 'advisor' | 'client'
  recipientMobile: string
  attempts: number
  familyName: string
  holdingLabel: string
  dueDate: string
  amountDue: number | null
  memberName: string | null
  advisorName: string
  state: RowState
}

interface Valid extends Loaded {
  mobile: string
}

type Client = SupabaseClient<Database>

/**
 * Sends the queued reminders (Milestone 4). Runs after the daily sweep.
 *
 * Every queued row is re-checked against current data first (T7), catch-up
 * is collapsed to one reminder per due date and recipient, client messages
 * are capped per run, and the advisor's rows go out as one summary.
 *
 * Live sends to the recipients and records each outcome on its row. Test
 * sends the very same messages to the advisor's own number instead and only
 * stamps `test_sent_at`, so switching to Live later still reaches clients.
 * Off does nothing at all.
 */
export async function runSender(client: Client, options: SenderOptions): Promise<SenderResult> {
  const result: SenderResult = { mode: options.mode, sent: 0, skipped: 0, failed: 0, deferred: 0 }
  if (options.mode === 'off') return result

  const now = options.now ?? new Date()
  const live = options.mode === 'live'

  if (live) result.failed += await failStuckRows(client, options.familyIds, now)

  const rows = await loadPending(client, options, live)

  // Re-check every row against current data.
  const valid: Valid[] = []
  for (const row of rows) {
    // Test mode previews on the advisor's number; without one it does
    // nothing, and leaves the row exactly as it found it.
    if (!live && !row.state.advisorMobile) continue
    const decision = recheck(row.state, options.today)
    if (decision.action === 'skip') {
      await markSkipped(client, [row.id], decision.reason)
      result.skipped += 1
    } else {
      valid.push({ ...row, mobile: decision.mobile })
    }
  }

  const { keep, superseded } = collapseCatchUp(valid)
  if (superseded.length > 0) {
    await markSkipped(client, superseded.map((row) => row.id), 'superseded')
    result.skipped += superseded.length
  }

  const clientRows = keep.filter((row) => row.recipientType === 'client')
  const advisorRows = keep.filter((row) => row.recipientType === 'advisor')

  const { now: sendNow, deferred } = applyCap(clientRows, CLIENT_CAP_PER_RUN)
  result.deferred = deferred.length

  for (const row of sendNow) {
    const params = clientReminderParams({
      memberName: row.memberName ?? '',
      advisorName: row.advisorName,
      holdingLabel: row.holdingLabel,
      dueDate: row.dueDate,
      amountDue: row.amountDue,
    })

    if (!live) {
      const outcome = await options.provider.sendTemplate(
        row.state.advisorMobile!,
        TEMPLATES.clientReminder,
        params,
      )
      if (outcome.ok) await stampTestSent(client, [row.id], now)
      count(result, outcome)
      continue
    }

    if (!(await claim(client, [row.id], now)).length) continue
    const outcome = await options.provider.sendTemplate(
      row.mobile,
      TEMPLATES.clientReminder,
      params,
    )
    await recordOutcome(client, [row], outcome, now, { recipient_mobile: row.mobile })
    count(result, outcome)
  }

  // One summary per advisor number (in practice, one advisor).
  const byAdvisor = new Map<string, Valid[]>()
  for (const row of advisorRows) {
    byAdvisor.set(row.mobile, [...(byAdvisor.get(row.mobile) ?? []), row])
  }

  if (byAdvisor.size > 0) {
    const overdueCount = await countOverdue(client, options.today, options.familyIds)
    for (const [mobile, group] of byAdvisor) {
      const covered = live ? await claimRows(client, group, now) : group
      if (covered.length === 0) continue

      const items: SummaryItem[] = covered.map((row) => ({
        familyName: row.familyName,
        holdingLabel: row.holdingLabel,
        dueDate: row.dueDate,
      }))
      const outcome = await options.provider.sendTemplate(
        mobile,
        TEMPLATES.advisorSummary,
        advisorSummaryParams({ items, overdueCount, renewalsUrl: options.renewalsUrl }),
      )
      if (live) {
        await recordOutcome(client, covered, outcome, now, {}, true)
      } else if (outcome.ok) {
        await stampTestSent(client, covered.map((row) => row.id), now)
      }
      count(result, outcome)
    }
  }

  return result
}

function count(result: SenderResult, outcome: SendResult) {
  if (outcome.ok) result.sent += 1
  else result.failed += 1
}

/**
 * A row still `sending` long after it was claimed belongs to a run that died
 * mid-send. The message may or may not have gone, so it is never sent again
 * automatically: it is failed, where the advisor will see it.
 */
async function failStuckRows(client: Client, familyIds: string[] | undefined, now: Date) {
  const cutoff = new Date(now.getTime() - STUCK_AFTER_MS).toISOString()
  let query = client
    .from('reminder_log')
    .select('id, due_instances!inner ( holdings!inner ( family_id ) )')
    .eq('status', 'sending')
    .lt('claimed_at', cutoff)
  if (familyIds) query = query.in('due_instances.holdings.family_id', familyIds)
  const { data, error } = await query
  if (error) throw new Error(`reading interrupted sends failed: ${error.message}`)
  const ids = (data ?? []).map((row) => row.id)
  if (ids.length === 0) return 0

  const { data: failed, error: updateError } = await client
    .from('reminder_log')
    .update({
      status: 'failed',
      error: 'Interrupted while sending — not resent, to avoid sending it twice.',
    })
    .in('id', ids)
    .eq('status', 'sending')
    .select('id')
  if (updateError) throw new Error(`failing interrupted sends failed: ${updateError.message}`)
  return failed?.length ?? 0
}

async function loadPending(client: Client, options: SenderOptions, live: boolean) {
  let query = client
    .from('reminder_log')
    .select(PENDING_SELECT)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
  // A reminder previewed once in Test mode is not previewed again.
  if (!live) query = query.is('test_sent_at', null)
  if (options.familyIds) query = query.in('due_instances.holdings.family_id', options.familyIds)
  const { data, error } = await query
  if (error) throw new Error(`reading queued reminders failed: ${error.message}`)

  // The nested embed is wider than the generated types express, as in the sweep.
  type Row = Record<string, unknown>
  return ((data ?? []) as unknown as Row[]).map((row): Loaded => {
    const instance = row.due_instances as Row
    const holding = instance.holdings as Row
    const family = holding.families as Row
    const advisor = family.profiles as { full_name: string; mobile: string | null } | null
    const member = holding.family_members as {
      name: string
      mobile: string | null
      whatsapp_consent: boolean
      deleted_at: string | null
    } | null

    return {
      id: row.id as string,
      dueInstanceId: row.due_instance_id as string,
      daysBefore: row.days_before as number,
      recipientType: row.recipient_type as 'advisor' | 'client',
      recipientMobile: row.recipient_mobile as string,
      attempts: row.attempts as number,
      familyName: family.name as string,
      holdingLabel: holding.label as string,
      dueDate: instance.due_date as string,
      amountDue: instance.amount_due === null ? null : Number(instance.amount_due),
      memberName: member?.name ?? null,
      advisorName: advisor?.full_name ?? '',
      state: {
        recipientType: row.recipient_type as 'advisor' | 'client',
        recipientMobile: row.recipient_mobile as string,
        dueDate: instance.due_date as string,
        paymentStatus: instance.payment_status as string,
        offSchedule: instance.off_schedule as boolean,
        holdingDeleted: holding.deleted_at !== null,
        familyDeleted: family.deleted_at !== null,
        remindersEnabled: holding.reminders_enabled as boolean,
        managedBy: holding.managed_by as 'self' | 'external',
        nextDueDate: holding.next_due_date as string | null,
        member: member
          ? {
              deleted: member.deleted_at !== null,
              consent: member.whatsapp_consent,
              mobile: member.mobile,
            }
          : null,
        advisorMobile: advisor?.mobile ?? null,
      },
    }
  })
}

async function markSkipped(client: Client, ids: string[], reason: SkipReason) {
  const { error } = await client
    .from('reminder_log')
    .update({ status: 'skipped', skip_reason: reason })
    .in('id', ids)
    .eq('status', 'pending')
    .select('id')
  if (error) throw new Error(`recording skipped reminders failed: ${error.message}`)
}

async function stampTestSent(client: Client, ids: string[], now: Date) {
  const { error } = await client
    .from('reminder_log')
    .update({ test_sent_at: now.toISOString() })
    .in('id', ids)
    .select('id')
  if (error) throw new Error(`recording test previews failed: ${error.message}`)
}

/**
 * Takes rows for this run. The status condition is what stops two runs
 * sending the same reminder: only one of them can move a row out of pending.
 */
async function claim(client: Client, ids: string[], now: Date): Promise<string[]> {
  const { data, error } = await client
    .from('reminder_log')
    .update({ status: 'sending', claimed_at: now.toISOString() })
    .in('id', ids)
    .eq('status', 'pending')
    .select('id')
  if (error) throw new Error(`claiming reminders failed: ${error.message}`)
  return (data ?? []).map((row) => row.id)
}

async function claimRows(client: Client, rows: Valid[], now: Date): Promise<Valid[]> {
  const claimed = new Set(await claim(client, rows.map((row) => row.id), now))
  return rows.filter((row) => claimed.has(row.id))
}

async function recordOutcome(
  client: Client,
  rows: Loaded[],
  outcome: SendResult,
  now: Date,
  extra: { recipient_mobile?: string },
  summary = false,
) {
  for (const row of rows) {
    const attempts = row.attempts + 1
    const update = outcome.ok
      ? {
          status: 'sent' as const,
          sent_at: now.toISOString(),
          attempts,
          error: null,
          ...(summary
            ? { summary_message_id: outcome.messageId }
            : { provider_message_id: outcome.messageId }),
          ...extra,
        }
      : {
          // A temporary failure goes back to the queue for the next run,
          // until the attempts run out.
          status: outcome.retryable && attempts < MAX_ATTEMPTS ? RETRY : FAILED,
          claimed_at: null,
          attempts,
          error: outcome.error,
        }
    const { error } = await client
      .from('reminder_log')
      .update(update)
      .eq('id', row.id)
      .eq('status', 'sending')
      .select('id')
    if (error) throw new Error(`recording a send failed: ${error.message}`)
  }
}

/**
 * Unpaid due dates already past, across live households: the same scope as
 * the renewals page's Overdue section. A date the holding has been renewed
 * past is not overdue, whatever its tick says.
 */
async function countOverdue(client: Client, today: string, familyIds?: string[]) {
  let query = client
    .from('due_instances')
    .select('due_date, holdings!inner ( next_due_date, family_id, families!inner ( id ) )')
    .is('holdings.deleted_at', null)
    .is('holdings.families.deleted_at', null)
    .lt('due_date', today)
    .neq('payment_status', 'paid')
    .eq('off_schedule', false)
  if (familyIds) query = query.in('holdings.family_id', familyIds)
  const { data, error } = await query
  if (error) throw new Error(`counting overdue due dates failed: ${error.message}`)
  return (data ?? []).filter((row) => {
    const next = (row.holdings as unknown as { next_due_date: string | null }).next_due_date
    return !(next && row.due_date < next)
  }).length
}
