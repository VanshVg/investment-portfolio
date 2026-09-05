'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabase/server'
import { memberInput } from '@/lib/validation/members'
import { fromPostgrestError, fromZodError, type ActionResult } from '@/lib/actions/result'

export async function createMember(familyId: string, input: unknown): Promise<ActionResult> {
  const parsed = memberInput.safeParse(input)
  if (!parsed.success) return fromZodError(parsed.error)

  const supabase = await createServerSupabase()
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
  const { error } = await supabase
    .from('family_members')
    .update({
      name: parsed.data.name,
      relation: parsed.data.relation,
      mobile: parsed.data.mobile,
      whatsapp_consent: parsed.data.whatsappConsent,
    })
    .eq('id', id)

  if (error) return fromPostgrestError(error)

  revalidatePath(`/families/${familyId}`)
  return { ok: true, id }
}

export async function deleteMember(id: string, familyId: string): Promise<ActionResult> {
  const supabase = await createServerSupabase()
  // holdings.member_id is ON DELETE SET NULL: their records survive as
  // household-level entries. The UI states that count before confirming.
  const { error } = await supabase.from('family_members').delete().eq('id', id)
  if (error) return fromPostgrestError(error)

  revalidatePath(`/families/${familyId}`)
  return { ok: true, id }
}
