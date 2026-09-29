'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabase/server'
import { memberInput } from '@/lib/validation/members'
import { fromPostgrestError, fromZodError, fromEmptyWrite, type ActionResult } from '@/lib/actions/result'
import { householdIsLive } from './household'

export async function createMember(familyId: string, input: unknown): Promise<ActionResult> {
  const parsed = memberInput.safeParse(input)
  if (!parsed.success) return fromZodError(parsed.error)

  const supabase = await createServerSupabase()
  const deletedHousehold = await householdIsLive(supabase, familyId)
  if (deletedHousehold) return deletedHousehold

  const { data, error } = await supabase
    .from('family_members')
    .insert({
      family_id: familyId,
      name: parsed.data.name,
      relation: parsed.data.relation,
      mobile: parsed.data.mobile,
      whatsapp_consent: parsed.data.whatsappConsent,
    })
    .select('id')
    .single()

  if (error) return fromPostgrestError(error)

  revalidatePath(`/families/${familyId}`)
  return { ok: true, id: data!.id }
}

export async function updateMember(
  id: string,
  familyId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = memberInput.safeParse(input)
  if (!parsed.success) return fromZodError(parsed.error)

  const supabase = await createServerSupabase()
  // whatsapp_consent_at is stamped by the stamp_consent_time trigger, not here —
  // the timestamp is DPDP evidence and must come from the database clock.
  // RLS applies its USING clause to UPDATE as a row filter, not an error, so
  // `.select('id')` is required to tell "updated" from "RLS silently kept
  // the row unchanged" — an empty error-free result is the latter.
  const { data, error } = await supabase
    .from('family_members')
    .update({
      name: parsed.data.name,
      relation: parsed.data.relation,
      mobile: parsed.data.mobile,
      whatsapp_consent: parsed.data.whatsappConsent,
    })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id')

  if (error) return fromPostgrestError(error)
  if (!data || data.length === 0) return fromEmptyWrite()

  revalidatePath(`/families/${familyId}`)
  return { ok: true, id }
}

export async function deleteMember(id: string, familyId: string): Promise<ActionResult> {
  const supabase = await createServerSupabase()
  // A soft delete (decision D2): the member is hidden and can be restored.
  // Their holdings stay attributed to them and stay on the ledger; reminders
  // for those go to the advisor only, since a removed member is never
  // messaged (see runReminderSweep). The UI states that before confirming.
  // `.select('id')` tells a real delete from RLS silently keeping the row.
  const { data, error } = await supabase
    .from('family_members')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id')
  if (error) return fromPostgrestError(error)
  if (!data || data.length === 0) return fromEmptyWrite()

  revalidatePath(`/families/${familyId}`)
  revalidatePath('/deleted')
  return { ok: true, id }
}
