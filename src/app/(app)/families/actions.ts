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
    .select('id')

  if (error) return fromPostgrestError(error)
  if (!data || data.length === 0) return fromEmptyWrite()

  revalidatePath('/families')
  revalidatePath(`/families/${id}`)
  return { ok: true, id }
}

export async function deleteFamily(id: string): Promise<ActionResult> {
  const supabase = await createServerSupabase()
  // Cascades to members, holdings, due instances, reminder rules and the
  // reminder log. This is the DPDP erasure path, so it is a hard delete.
  // RLS applies its USING clause to DELETE as a row filter, not an error, so
  // a blocked delete comes back as `{ error: null }` with the row intact —
  // `.select('id')` is required to tell that apart from an actual delete,
  // which matters enormously on the path that is supposed to prove erasure.
  const { data, error } = await supabase.from('families').delete().eq('id', id).select('id')
  if (error) return fromPostgrestError(error)
  if (!data || data.length === 0) return fromEmptyWrite()

  revalidatePath('/families')
  return { ok: true, id }
}
