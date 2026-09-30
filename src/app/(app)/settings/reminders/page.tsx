import { createServerSupabase } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/PageHeader'
import { AdvisorMobileForm } from './_components/AdvisorMobileForm'
import { PasswordForm } from './_components/PasswordForm'
import { ReminderRulesSection } from './_components/ReminderRulesSection'
import { updateAdvisorMobile, updateReminderRule } from './actions'
import { changePassword } from './password-actions'
import { WhatsAppSection } from './_components/WhatsAppSection'
import { sendTestMessage, setWhatsAppMode } from './whatsapp-actions'
import { whatsappConfig } from '@/lib/whatsapp/config'
import { getWhatsAppMode } from '@/lib/whatsapp/settings'

export default async function ReminderSettingsPage() {
  const supabase = await createServerSupabase()

  const [
    {
      data: { user },
    },
    { data: rules, error: rulesError },
  ] = await Promise.all([
    supabase.auth.getUser(),
    // Category defaults only — a holding-scoped override has no row here to
    // render, deliberately (see ReminderRulesSection).
    supabase
      .from('reminder_rules')
      .select('id, category, days_before, is_active')
      .not('category', 'is', null)
      .order('category'),
  ])
  if (rulesError) throw new Error(`Failed to load reminder rules: ${rulesError.message}`)

  const { data: profile } = user
    ? await supabase.from('profiles').select('mobile').eq('id', user.id).maybeSingle()
    : { data: null }
  const whatsapp = whatsappConfig()
  const whatsappMode = await getWhatsAppMode(supabase)

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Your number, WhatsApp, how far ahead each category's reminders fire, and your password."
      />

      <AdvisorMobileForm mobile={profile?.mobile ?? null} updateAdvisorMobile={updateAdvisorMobile} />

      <WhatsAppSection
        connected={whatsapp !== null}
        numberHint={whatsapp ? whatsapp.phoneNumberId.slice(-4) : null}
        mode={whatsappMode}
        advisorHasMobile={Boolean(profile?.mobile)}
        setWhatsAppMode={setWhatsAppMode}
        sendTestMessage={sendTestMessage}
      />

      <ReminderRulesSection
        rules={(rules ?? []).map((rule) => ({
          id: rule.id,
          category: rule.category!,
          daysBefore: rule.days_before,
          isActive: rule.is_active,
        }))}
        updateReminderRule={updateReminderRule}
      />

      <PasswordForm changePassword={changePassword} />
    </div>
  )
}
