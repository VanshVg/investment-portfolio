'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabase/server'
import {
  fromEmptyWrite,
  fromPostgrestError,
  fromZodError,
  type ActionResult,
} from '@/lib/actions/result'
import { advisorMobileInput, reminderRuleInput } from '@/lib/validation/reminders'

/**
 * Updates one reminder rule's cadence by id. The same shape works whether the
 * row is a category default (the only ones this page's UI edits today) or a
 * holding-scoped override (schema-supported, resolved by the engine, but
 * deliberately given no control of its own — see the design doc) — nothing
 * here needs to know which kind of row it was handed.
 */
export async function updateReminderRule(id: string, input: unknown): Promise<ActionResult> {
  const parsed = reminderRuleInput.safeParse(input)
  if (!parsed.success) return fromZodError(parsed.error)

  const supabase = await createServerSupabase()

  const { data, error } = await supabase
    .from('reminder_rules')
    .update({ days_before: parsed.data.daysBefore, is_active: parsed.data.isActive })
    .eq('id', id)
    .select('id')

  if (error) return fromPostgrestError(error)
  if (!data || data.length === 0) return fromEmptyWrite()

  revalidatePath('/settings/reminders')
  return { ok: true, id }
}

/**
 * Writes only the signed-in advisor's own profile row. The target id comes
 * from the session, never from `input` — `advisorMobileInput` has no `id`
 * field, so nothing the caller supplies can name a row to write, and
 * `.eq('id', user.id)` is the only place a row is ever selected.
 *
 * Without a mobile number here, `reminderRecipients` (src/lib/domain/
 * routing.ts) resolves an externally managed holding to zero recipients:
 * the whole cross-sell path the routing rule exists for goes silent.
 */
export async function updateAdvisorMobile(input: unknown): Promise<ActionResult> {
  const parsed = advisorMobileInput.safeParse(input)
  if (!parsed.success) return fromZodError(parsed.error)

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, formError: 'Your session has expired. Sign in again.' }
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({ mobile: parsed.data.mobile })
    .eq('id', user.id)
    .select('id')

  if (error) return fromPostgrestError(error)
  if (!data || data.length === 0) return fromEmptyWrite()

  revalidatePath('/settings/reminders')
  return { ok: true, id: user.id }
}
