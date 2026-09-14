import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/types.generated'
import { addDays } from 'date-fns'
import { fromISODate, toISODate } from '@/lib/domain/dates'
import { firedWindows } from '@/lib/domain/reminder-windows'
import { reminderRecipients } from '@/lib/domain/routing'
import { loadReminderRules, maxWindow, windowsFor } from './rules'
import type { HoldingCategory } from '@/lib/validation/holdings'

export interface SweepResult {
  scanned: number
  queued: number
  skipped: number
  failed: number
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
  const widest = maxWindow(rules)
  if (widest === 0) return { scanned: 0, queued: 0, skipped: 0, failed: 0 }

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
