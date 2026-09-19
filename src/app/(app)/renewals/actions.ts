'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { fromEmptyWrite, fromPostgrestError, fromZodError, type ActionResult } from '@/lib/actions/result'
import { fromISODate, toISODate, todayInIndia } from '@/lib/domain/dates'
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
      paid_on: parsed.data === 'paid' ? todayInIndia() : null,
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
 * The one partial state this action can leave behind: the holding rolled
 * forward but the tick did not save. Named explicitly, rather than routed
 * through `fromPostgrestError`/`fromEmptyWrite`, because a generic "could not
 * save" would hide the fact that the renewal itself already went through and
 * only the payment tick needs a manual retry.
 */
const RENEWED_BUT_NOT_TICKED: ActionResult = {
  ok: false,
  formError:
    'The due date has moved to the next renewal, but the payment could not be marked as paid. Set it to Paid from the Paid column.',
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
    .select(
      'id, due_date, holdings!inner ( id, family_id, anchor_due_date, next_due_date, due_frequency )',
    )
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
    family_id: string
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

  // Both the renewals listing and this holding's own family ledger page
  // render this due date, and the ledger page revalidation must key off the
  // holding just read above -- markRenewed has no route param to take it
  // from, unlike every write in holding-actions.ts. Shared by both the
  // success path and the advanced-but-not-ticked partial-failure path below,
  // since the due date has already moved on both.
  const revalidateAfterRenewal = () => {
    revalidatePath('/renewals')
    revalidatePath(`/families/${holding.family_id}`)
  }

  // Advance first, tick second. These are two writes with no shared
  // transaction, so one of them can succeed while the other fails; this
  // order picks which partial state that leaves behind. Advance-then-tick
  // means the only reachable partial state is "rolled forward, not yet
  // ticked" -- the old instance is still visible as Unknown and the advisor
  // can set it by hand. The reverse order would leave a due date marked paid
  // that never moved, which nothing on screen flags as wrong. Retrying is
  // safe either way this fails: the advance recomputes the same `next` from
  // the unchanged `due_date` and anchor, so a repeat write sets the same
  // value again and then the tick completes.
  const { data: advanced, error: advanceError } = await supabase
    .from('holdings')
    .update({ next_due_date: toISODate(next) })
    .eq('id', holding.id)
    .select('id')
  if (advanceError) return fromPostgrestError(advanceError)
  if (!advanced || advanced.length === 0) return fromEmptyWrite()

  const { data: ticked, error: tickError } = await supabase
    .from('due_instances')
    .update({ payment_status: 'paid', paid_on: todayInIndia() })
    .eq('id', dueInstanceId)
    .select('id')
  if (tickError) {
    revalidateAfterRenewal()
    return RENEWED_BUT_NOT_TICKED
  }
  if (!ticked || ticked.length === 0) {
    revalidateAfterRenewal()
    return RENEWED_BUT_NOT_TICKED
  }

  // The following due date should exist before the page re-renders, so the row
  // the advisor just cleared is replaced by the next one rather than vanishing.
  try {
    await ensureDueInstances(supabase, holding.id, horizonFrom(todayInIndia()))
  } catch (cause) {
    console.error(`due-instance refresh failed after renewing holding ${holding.id}`, cause)
  }

  revalidateAfterRenewal()
  return { ok: true, id: dueInstanceId }
}
