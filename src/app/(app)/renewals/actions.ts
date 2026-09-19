'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { fromEmptyWrite, fromPostgrestError, fromZodError, type ActionResult } from '@/lib/actions/result'
import { fromISODate, toISODate } from '@/lib/domain/dates'
import { nextDueDateAfter, type DueFrequency } from '@/lib/domain/due-dates'
import { ensureDueInstances } from '@/lib/reminders/ensure-due-instances'
import { horizonFrom } from '@/lib/reminders/horizon'

const paymentStatusInput = z.enum(['paid', 'unpaid', 'unknown'])

/**
 * The primary payment-recording path, not a fallback: no insurer exposes a
 * payment-status API to an independent advisor, so a manual tick is how this
 * gets recorded for the life of the product, not just until something better
 * comes along.
 */
export async function setPaymentStatus(
  dueInstanceId: string,
  status: unknown,
): Promise<ActionResult> {
  const parsed = paymentStatusInput.safeParse(status)
  if (!parsed.success) return fromZodError(parsed.error)

  const supabase = await createServerSupabase()

  // paid_on only means something while the status is 'paid'. Leaving a stale
  // date behind would make an unpaid instance look settled in any later export.
  const { data, error } = await supabase
    .from('due_instances')
    .update({
      payment_status: parsed.data,
      paid_on: parsed.data === 'paid' ? toISODate(new Date()) : null,
    })
    .eq('id', dueInstanceId)
    .select('id')

  if (error) return fromPostgrestError(error)
  if (!data || data.length === 0) return fromEmptyWrite()

  revalidatePath('/renewals')
  return { ok: true, id: dueInstanceId }
}

const NOT_RENEWABLE: ActionResult = {
  ok: false,
  formError: 'This record has a single maturity date and does not renew. Record the payment instead.',
}

/**
 * One action for what is really one event: the advisor learns a premium was
 * paid and the policy rolled over at the same moment.
 *
 * Advances along the existing grid via nextDueDateAfter and deliberately does
 * not touch anchor_due_date — that is what separates a renewal from a manual
 * date correction, which re-anchors. See applyDueDateEdit.
 */
export async function markRenewed(dueInstanceId: string): Promise<ActionResult> {
  const supabase = await createServerSupabase()

  const { data: instance, error: readError } = await supabase
    .from('due_instances')
    .select('id, due_date, holdings!inner ( id, anchor_due_date, next_due_date, due_frequency )')
    .eq('id', dueInstanceId)
    .maybeSingle()
  if (readError) return fromPostgrestError(readError)
  if (!instance) return fromEmptyWrite()

  // The nested-join shape is wider than the generated row types express, so
  // it is narrowed here rather than fought with at the query builder — the
  // same approach listRenewals takes against the same join.
  type JoinedRow = Record<string, unknown>
  const row = instance as JoinedRow
  const holding = row.holdings as {
    id: string
    anchor_due_date: string | null
    next_due_date: string | null
    due_frequency: DueFrequency
  }
  if (holding.due_frequency === 'one_time') return NOT_RENEWABLE

  const anchor = fromISODate(holding.anchor_due_date ?? (row.due_date as string))
  const current = fromISODate(row.due_date as string)
  if (!anchor || !current) return NOT_RENEWABLE

  const next = nextDueDateAfter(anchor, holding.due_frequency, current)
  if (!next) return NOT_RENEWABLE

  const { data: ticked, error: tickError } = await supabase
    .from('due_instances')
    .update({ payment_status: 'paid', paid_on: toISODate(new Date()) })
    .eq('id', dueInstanceId)
    .select('id')
  if (tickError) return fromPostgrestError(tickError)
  if (!ticked || ticked.length === 0) return fromEmptyWrite()

  const { data: advanced, error: advanceError } = await supabase
    .from('holdings')
    .update({ next_due_date: toISODate(next) })
    .eq('id', holding.id)
    .select('id')
  if (advanceError) return fromPostgrestError(advanceError)
  if (!advanced || advanced.length === 0) return fromEmptyWrite()

  // The following due date should exist before the page re-renders, so the row
  // the advisor just cleared is replaced by the next one rather than vanishing.
  try {
    await ensureDueInstances(supabase, holding.id, horizonFrom(toISODate(new Date())))
  } catch (cause) {
    console.error(`due-instance refresh failed after renewing holding ${holding.id}`, cause)
  }

  revalidatePath('/renewals')
  revalidatePath('/families')
  return { ok: true, id: dueInstanceId }
}
