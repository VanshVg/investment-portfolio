'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabase/server'
import { holdingInput } from '@/lib/validation/holdings'
import { applyDueDateEdit } from '@/lib/domain/due-dates'
import { fromPostgrestError, fromZodError, type ActionResult } from '@/lib/actions/result'

export async function createHolding(familyId: string, input: unknown): Promise<ActionResult> {
  const parsed = holdingInput.safeParse(input)
  if (!parsed.success) return fromZodError(parsed.error)
  const value = parsed.data

  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('holdings')
    .insert({
      family_id: familyId,
      member_id: value.memberId,
      category: value.category,
      managed_by: value.managedBy,
      label: value.label,
      institution: value.institution,
      principal_amount: value.principalAmount,
      periodic_amount: value.periodicAmount,
      // A new record's first due date is by definition its anchor.
      anchor_due_date: value.nextDueDate,
      next_due_date: value.nextDueDate,
      due_frequency: value.dueFrequency,
      reminders_enabled: value.remindersEnabled,
      details: value.details,
    })
    .select('id')
    .single()

  if (error) return fromPostgrestError(error)

  revalidatePath(`/families/${familyId}`)
  return { ok: true, id: data!.id }
}

export async function updateHolding(
  id: string,
  familyId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = holdingInput.safeParse(input)
  if (!parsed.success) return fromZodError(parsed.error)
  const value = parsed.data

  const supabase = await createServerSupabase()

  // The current schedule is needed to decide whether this is a real date edit.
  const { data: current, error: readError } = await supabase
    .from('holdings')
    .select('anchor_due_date, next_due_date')
    .eq('id', id)
    .single()
  if (readError) return fromPostgrestError(readError)

  const schedule = applyDueDateEdit(
    { anchorDueDate: current!.anchor_due_date, nextDueDate: current!.next_due_date },
    value.nextDueDate,
  )

  const { error } = await supabase
    .from('holdings')
    .update({
      member_id: value.memberId,
      managed_by: value.managedBy,
      label: value.label,
      institution: value.institution,
      principal_amount: value.principalAmount,
      periodic_amount: value.periodicAmount,
      anchor_due_date: schedule.anchorDueDate,
      next_due_date: schedule.nextDueDate,
      due_frequency: value.dueFrequency,
      reminders_enabled: value.remindersEnabled,
      details: value.details,
    })
    .eq('id', id)

  if (error) return fromPostgrestError(error)

  revalidatePath(`/families/${familyId}`)
  return { ok: true, id }
}

export async function deleteHolding(id: string, familyId: string): Promise<ActionResult> {
  const supabase = await createServerSupabase()
  // Cascades to due_instances, reminder_rules and reminder_log for this record.
  const { error } = await supabase.from('holdings').delete().eq('id', id)
  if (error) return fromPostgrestError(error)

  revalidatePath(`/families/${familyId}`)
  return { ok: true, id }
}
