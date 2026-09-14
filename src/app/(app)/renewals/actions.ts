'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { fromEmptyWrite, fromPostgrestError, fromZodError, type ActionResult } from '@/lib/actions/result'
import { toISODate } from '@/lib/domain/dates'

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
