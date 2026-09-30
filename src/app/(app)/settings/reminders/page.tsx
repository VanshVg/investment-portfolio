import { createServerSupabase } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/PageHeader'
import { AdvisorMobileForm } from './_components/AdvisorMobileForm'
import { PasswordForm } from './_components/PasswordForm'
import { ReminderRulesSection } from './_components/ReminderRulesSection'
import { updateAdvisorMobile, updateReminderRule } from './actions'
import { changePassword } from './password-actions'

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

  return (
    <div>
      <PageHeader
        title="Settings"
        description="How far ahead each category's renewal reminders fire, the number they reach you on, and your password."
      />

      <AdvisorMobileForm mobile={profile?.mobile ?? null} updateAdvisorMobile={updateAdvisorMobile} />

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
