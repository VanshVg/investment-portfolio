'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabase/server'
import { holdingInput } from '@/lib/validation/holdings'
import { applyDueDateEdit } from '@/lib/domain/due-dates'
import { fromPostgrestError, fromZodError, fromEmptyWrite, type ActionResult } from '@/lib/actions/result'
import { householdIsLive } from './household'
import { reconcileDueInstances } from '@/lib/reminders/reconcile'
import { horizonFrom } from '@/lib/reminders/horizon'
import { todayInIndia } from '@/lib/domain/dates'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/types.generated'

/**
 * Regenerates a holding's due instances after a successful write.
 *
 * Deliberately cannot fail the action. The holding is the advisor's actual
 * data and it is already saved; reporting failure here would claim a write did
 * not happen when it did. Stale instances are self-correcting — the daily job
 * runs the same reconciliation for every holding.
 */
async function refreshSchedule(
  supabase: SupabaseClient<Database>,
  holdingId: string,
): Promise<void> {
  try {
    await reconcileDueInstances(supabase, holdingId, horizonFrom(todayInIndia()))
  } catch (cause) {
    console.error(`due-instance refresh failed for holding ${holdingId}`, cause)
  }
}

const MEMBER_NOT_IN_FAMILY_ERROR: ActionResult = {
  ok: false,
  fieldErrors: { memberId: 'That family member does not belong to this household.' },
}

const MEMBER_REMOVED_ERROR: ActionResult = {
  ok: false,
  fieldErrors: { memberId: 'That family member has been removed. Choose someone else.' },
}

/**
 * `member_id` only has a foreign key to `family_members`, which checks that
 * the row exists, not that it belongs to this household — so without this
 * check a member id borrowed from a different family would be accepted.
 *
 * A removed member (decision D2) cannot be newly given a holding. A holding
 * already attributed to them keeps that attribution through an edit
 * (`currentMemberId`), so saving some other field does not force the advisor
 * to reassign it.
 */
async function memberBelongsToFamily(
  supabase: SupabaseClient<Database>,
  memberId: string,
  familyId: string,
  currentMemberId: string | null = null,
): Promise<ActionResult | null> {
  const { data, error } = await supabase
    .from('family_members')
    .select('id, deleted_at')
    .eq('id', memberId)
    .eq('family_id', familyId)
    .maybeSingle()
  if (error) return fromPostgrestError(error)
  if (!data) return MEMBER_NOT_IN_FAMILY_ERROR
  if (data.deleted_at !== null && memberId !== currentMemberId) return MEMBER_REMOVED_ERROR
  return null
}

export async function createHolding(familyId: string, input: unknown): Promise<ActionResult> {
  const parsed = holdingInput.safeParse(input)
  if (!parsed.success) return fromZodError(parsed.error)
  const value = parsed.data

  const supabase = await createServerSupabase()

  const deletedHousehold = await householdIsLive(supabase, familyId)
  if (deletedHousehold) return deletedHousehold

  if (value.memberId !== null) {
    const membershipError = await memberBelongsToFamily(supabase, value.memberId, familyId)
    if (membershipError) return membershipError
  }

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

  await refreshSchedule(supabase, data!.id)

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

  // The current schedule is needed to decide whether this is a real date edit,
  // and the current category is needed below to guard against `details` meant
  // for a different category ending up on this row (category itself is never
  // written by this action, so the column can never actually change).
  const { data: current, error: readError } = await supabase
    .from('holdings')
    .select('anchor_due_date, next_due_date, category, member_id')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (readError) return fromPostgrestError(readError)
  // Deleted in another tab since the form opened: say so rather than
  // writing to a row the advisor can no longer see.
  if (!current) return fromEmptyWrite()

  if (current.category !== value.category) {
    return {
      ok: false,
      formError: 'The category on this record cannot be changed here. Refresh the page and try again.',
    }
  }

  if (value.memberId !== null) {
    const membershipError = await memberBelongsToFamily(
      supabase,
      value.memberId,
      familyId,
      current.member_id,
    )
    if (membershipError) return membershipError
  }

  const schedule = applyDueDateEdit(
    { anchorDueDate: current.anchor_due_date, nextDueDate: current.next_due_date },
    value.nextDueDate,
  )

  // The category pre-read above already proves this row is readable under RLS,
  // but a SELECT policy passing says nothing about the UPDATE policy: they are
  // separate grants in Postgres and can diverge. `.select('id')` makes that
  // check explicit here instead of relying on the pre-read as an accident.
  const { data: updated, error } = await supabase
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
    .is('deleted_at', null)
    .select('id')

  if (error) return fromPostgrestError(error)
  if (!updated || updated.length === 0) return fromEmptyWrite()

  await refreshSchedule(supabase, id)

  revalidatePath(`/families/${familyId}`)
  return { ok: true, id }
}

export async function deleteHolding(id: string, familyId: string): Promise<ActionResult> {
  const supabase = await createServerSupabase()
  // A soft delete (decision D2): hidden from every listing and from the
  // reminder sweep, restorable from Deleted items. Its due instances and
  // reminder log are kept, so a restore brings its schedule back with it.
  // RLS applies its USING clause to UPDATE as a row filter, not an error, so
  // `.select('id')` is required to tell "deleted" from "RLS silently kept
  // the row" — an empty error-free result is the latter.
  const { data: deleted, error } = await supabase
    .from('holdings')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id')
  if (error) return fromPostgrestError(error)
  if (!deleted || deleted.length === 0) return fromEmptyWrite()

  revalidatePath(`/families/${familyId}`)
  revalidatePath('/renewals')
  revalidatePath('/deleted')
  return { ok: true, id }
}
