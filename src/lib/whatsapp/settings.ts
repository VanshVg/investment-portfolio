import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/types.generated'

export type WhatsAppMode = Database['public']['Enums']['whatsapp_mode']

export const WHATSAPP_MODES: WhatsAppMode[] = ['off', 'test', 'live']

/** The saved mode, or 'off' when it cannot be read: failing closed is the safe way to fail. */
export async function getWhatsAppMode(client: SupabaseClient<Database>): Promise<WhatsAppMode> {
  const { data, error } = await client
    .from('app_settings')
    .select('whatsapp_mode')
    .eq('id', true)
    .maybeSingle()
  if (error || !data) return 'off'
  return data.whatsapp_mode
}

/** Whether the save took: an account without the admin role is refused by RLS, silently. */
export async function saveWhatsAppMode(
  client: SupabaseClient<Database>,
  mode: WhatsAppMode,
  userId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from('app_settings')
    .update({ whatsapp_mode: mode, updated_at: new Date().toISOString(), updated_by: userId })
    .eq('id', true)
    .select('id')
  return !error && (data?.length ?? 0) > 0
}
