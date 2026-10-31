'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/actions/result'
import { whatsappProvider } from '@/lib/whatsapp/connection'
import { saveWhatsAppMode, WHATSAPP_MODES, type WhatsAppMode } from '@/lib/whatsapp/settings'
import { TEMPLATES, TEST_TEMPLATE_LANGUAGE } from '@/lib/whatsapp/messages'

const SESSION_EXPIRED: ActionResult = {
  ok: false,
  formError: 'Your session has expired. Sign in again.',
}
const NOT_CONNECTED: ActionResult = {
  ok: false,
  formError: 'WhatsApp is not connected yet. Add the Meta keys in Vercel first.',
}

/** The signed-in advisor and their own number, from the session only. */
async function advisor() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('mobile')
    .eq('id', user.id)
    .maybeSingle()
  return { supabase, userId: user.id, mobile: profile?.mobile ?? null }
}

/**
 * Switches WhatsApp between Off, Test and Live. Off is always allowed, so the
 * advisor can stop sending at once whatever else is wrong.
 */
export async function setWhatsAppMode(input: unknown): Promise<ActionResult> {
  if (!WHATSAPP_MODES.includes(input as WhatsAppMode)) {
    return { ok: false, formError: 'Choose Off, Test or Live.' }
  }
  const mode = input as WhatsAppMode

  const session = await advisor()
  if (!session) return SESSION_EXPIRED
  if (mode !== 'off' && !whatsappProvider()) return NOT_CONNECTED
  if (mode === 'test' && !session.mobile) {
    return {
      ok: false,
      formError: 'Add your mobile number above first: Test mode sends every message to it.',
    }
  }

  if (!(await saveWhatsAppMode(session.supabase, mode, session.userId))) {
    return { ok: false, formError: 'Could not save the WhatsApp setting. Try again.' }
  }
  revalidatePath('/settings/reminders')
  return { ok: true, id: mode }
}

/** Meta's own hello_world to the advisor's number: proves the keys and the number work. */
export async function sendTestMessage(): Promise<ActionResult> {
  const session = await advisor()
  if (!session) return SESSION_EXPIRED
  const provider = whatsappProvider()
  if (!provider) return NOT_CONNECTED
  if (!session.mobile) {
    return { ok: false, formError: 'Add your mobile number above first.' }
  }

  const result = await provider.sendTemplate(
    session.mobile,
    TEMPLATES.test,
    [],
    TEST_TEMPLATE_LANGUAGE,
  )
  if (!result.ok) {
    return { ok: false, formError: `WhatsApp refused the test message: ${result.error}` }
  }
  return { ok: true, id: result.messageId }
}
