import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/types.generated'
import { addDays } from 'date-fns'
import { fromISODate, toISODate } from '@/lib/domain/dates'
import { firedWindows } from '@/lib/domain/reminder-windows'
import { reminderRecipients } from '@/lib/domain/routing'
import { loadReminderRules, maxWindow, windowsFor, type RuleSet } from './rules'
import type { HoldingCategory } from '@/lib/validation/holdings'

export interface SweepResult {
  scanned: number
  queued: number
  skipped: number
  failed: number
}

/**
 * Whether at least one active rule exists anywhere — a category default or a
 * holding override. `maxWindow`'s own 0 is ambiguous by design (it is a
 * width, not a presence flag): it means either "no active rule exists at
 * all" or "every active rule is legitimately {0}", which the schema allows —
 * `reminder_rules_days_before_non_negative` permits 0, meaning "remind on
 * the due date itself". Those two situations must not behave the same way:
 * the first has nothing to scan for, ever; the second still has today's due
 * instances to find. Exported so the distinction can be pinned directly,
 * without depending on live table state to exercise it.
 */
export function hasActiveRules(rules: RuleSet): boolean {
  return rules.byCategory.size > 0 || rules.byHolding.size > 0
}

/**
 * Queues every reminder that has come due, and sends nothing.
 *
 * Rows land in reminder_log with status 'pending'. Milestone 4 adds a sender
 * that drains them; until then the log is the only evidence the engine ran.
 *
 * Safe to run repeatedly and safe to miss a day. firedWindows keeps a window
 * firing until its due date passes, and reminder_log's unique constraint on
 * (due_instance_id, days_before, recipient_type) rejects the second attempt at
 * the database rather than in application logic — so catch-up cannot become a
 * duplicate message to a client.
 */
export async function runReminderSweep(
  client: SupabaseClient<Database>,
  today: string,
): Promise<SweepResult> {
  const todayDate = fromISODate(today)
  if (!todayDate) throw new Error(`runReminderSweep: expected yyyy-mm-dd, received "${today}"`)

  const rules = await loadReminderRules(client)
  // Short-circuit only when there is truly nothing configured — not when the
  // widest configured window happens to be 0. A widest of 0 with rules
  // present means every active rule is a same-day reminder, and today's due
  // instances still need to be scanned; addDays(today, 0) below already
  // does the right thing for that case (a horizon of exactly today).
  if (!hasActiveRules(rules)) return { scanned: 0, queued: 0, skipped: 0, failed: 0 }

  const widest = maxWindow(rules)
  const horizon = toISODate(addDays(todayDate, widest))

  // The nested embed (due_instances -> holdings -> families -> profiles via
  // owner_advisor_id) resolves under PostgREST here: owner_advisor_id is the
  // only foreign key from families to profiles, so the `profiles:owner_advisor_id`
  // alias is unambiguous and PostgREST follows it without extra hinting.
  // Verified directly against the local stack before relying on it — if a
  // later migration adds a second FK between these tables this will need the
  // in-memory join the brief describes as a fallback.
  const { data: instances, error } = await client
    .from('due_instances')
    .select(
      `id, due_date,
       holdings!inner (
         id, category, managed_by, reminders_enabled, member_id,
         families!inner ( id, owner_advisor_id, profiles:owner_advisor_id ( mobile ) ),
         family_members ( mobile, whatsapp_consent )
       )`,
    )
    .gte('due_date', today)
    .lte('due_date', horizon)
    .eq('holdings.reminders_enabled', true)
    // A paid instance needs no reminder, and an off-schedule one is kept only
    // as evidence after the schedule moved; it is not a date anything is due
    // on. Unpaid and unknown instances are exactly what reminders are for.
    .neq('payment_status', 'paid')
    .eq('off_schedule', false)
  if (error) throw new Error(`runReminderSweep: reading due instances failed: ${error.message}`)

  const result: SweepResult = { scanned: 0, queued: 0, skipped: 0, failed: 0 }

  // The nested-join shape is wider than the generated row types express, so
  // the rows are narrowed here rather than fought with at the query builder
  // — the same approach src/lib/queries/renewals.ts takes for the same kind
  // of embed.
  type JoinedRow = Record<string, unknown>

  for (const instance of (instances ?? []) as unknown as JoinedRow[]) {
    result.scanned += 1
    // One bad row must not stop reminders for every other client.
    try {
      const holding = instance.holdings as JoinedRow
      const family = holding.families as JoinedRow
      const advisor = family.profiles as { mobile: string | null } | null
      const member = holding.family_members as
        | { mobile: string | null; whatsapp_consent: boolean }
        | null

      const dueDate = fromISODate(instance.due_date as string)!
      const windows = firedWindows(
        dueDate,
        windowsFor(rules, {
          category: holding.category as HoldingCategory,
          holdingId: holding.id as string,
        }),
        todayDate,
      )
      if (windows.length === 0) {
        result.skipped += 1
        continue
      }

      const recipients = reminderRecipients({
        managedBy: holding.managed_by as 'self' | 'external',
        advisorMobile: advisor?.mobile ?? null,
        member: member
          ? { mobile: member.mobile, whatsappConsent: member.whatsapp_consent }
          : null,
      })
      if (recipients.length === 0) {
        // Nothing written. The absence of a log row is the honest record that
        // no message was ever queued.
        result.skipped += 1
        continue
      }

      const dueInstanceId = instance.id as string
      const rows = windows.flatMap((days_before) =>
        recipients.map((recipient) => ({
          due_instance_id: dueInstanceId,
          days_before,
          recipient_type: recipient.type,
          recipient_mobile: recipient.mobile,
          status: 'pending' as const,
        })),
      )

      // ignoreDuplicates makes the unique constraint the deduplicator rather
      // than a pre-read, which would race against a concurrent run.
      const { data: queued, error: insertError } = await client
        .from('reminder_log')
        .upsert(rows, {
          onConflict: 'due_instance_id,days_before,recipient_type',
          ignoreDuplicates: true,
        })
        .select('id')
      if (insertError) throw new Error(insertError.message)
      result.queued += queued?.length ?? 0
    } catch (cause) {
      result.failed += 1
      console.error(`reminder sweep failed for due instance ${String(instance.id)}`, cause)
    }
  }

  return result
}
