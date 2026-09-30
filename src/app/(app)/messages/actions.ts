'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabase/server'
import { fromEmptyWrite, fromPostgrestError, type ActionResult } from '@/lib/actions/result'

/** The advisor has dealt with a reply. Only an unhandled one can be marked. */
export async function markReplyHandled(id: string): Promise<ActionResult> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, formError: 'Your session has expired. Sign in again.' }

  const { data, error } = await supabase
    .from('whatsapp_inbound')
    .update({ handled_at: new Date().toISOString(), handled_by: user.id })
    .eq('id', id)
    .is('handled_at', null)
    .select('id')
  if (error) return fromPostgrestError(error)
  if (!data || data.length === 0) return fromEmptyWrite()

  revalidatePath('/messages')
  return { ok: true, id }
}
