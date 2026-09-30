'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabase/server'
import { familyInput } from '@/lib/validation/families'
import { fromPostgrestError, fromZodError, fromEmptyWrite, type ActionResult } from '@/lib/actions/result'

export async function createFamily(input: unknown): Promise<ActionResult> {
  const parsed = familyInput.safeParse(input)
  if (!parsed.success) return fromZodError(parsed.error)

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, formError: 'Your session has expired. Sign in again.' }

  const { data, error } = await supabase
    .from('families')
    .insert({
      name: parsed.data.name,
      head_name: parsed.data.headName,
      head_mobile: parsed.data.headMobile,
      notes: parsed.data.notes,
      goal_horizon_years: parsed.data.goalHorizonYears,
      assumed_cagr: parsed.data.assumedCagr,
      owner_advisor_id: user.id,
    })
    .select('id')
    .single()

  if (error) return fromPostgrestError(error)

  revalidatePath('/families')
  return { ok: true, id: data!.id }
}

export async function updateFamily(id: string, input: unknown): Promise<ActionResult> {
  const parsed = familyInput.safeParse(input)
  if (!parsed.success) return fromZodError(parsed.error)

  const supabase = await createServerSupabase()
  // RLS applies the USING clause to UPDATE as a row filter, not an error, so
  // `.select('id')` is required to tell "updated" from "RLS silently kept
  // the row unchanged" — an empty error-free result is the latter.
  const { data, error } = await supabase
    .from('families')
    .update({
      name: parsed.data.name,
      head_name: parsed.data.headName,
      head_mobile: parsed.data.headMobile,
      notes: parsed.data.notes,
      goal_horizon_years: parsed.data.goalHorizonYears,
      assumed_cagr: parsed.data.assumedCagr,
    })
    .eq('id', id)
    // A household deleted in another tab is not edited back into view.
    .is('deleted_at', null)
    .select('id')

  if (error) return fromPostgrestError(error)
  if (!data || data.length === 0) return fromEmptyWrite()

  revalidatePath('/families')
  revalidatePath(`/families/${id}`)
  return { ok: true, id }
}

export async function deleteFamily(id: string): Promise<ActionResult> {
  const supabase = await createServerSupabase()
  // A soft delete (decision D2): the household is stamped and hidden, never
  // destroyed, and can be restored by hand in the database (see
  // docs/deployment.md) — the advisor has no restore screen. Its members and
  // holdings are left untouched — every read hides them through the family —
  // so a restore brings back exactly what was there. The reminder sweep skips
  // it from the next run.
  // RLS applies its USING clause to UPDATE as a row filter, not an error, so
  // `.select('id')` is required to tell a real delete from RLS silently
  // keeping the row; the deleted_at filter makes a second delete a no-op
  // that reports itself rather than re-stamping the time.
  const { data, error } = await supabase
    .from('families')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id')
  if (error) return fromPostgrestError(error)
  if (!data || data.length === 0) return fromEmptyWrite()

  revalidatePath('/families')
  revalidatePath('/renewals')
  return { ok: true, id }
}
