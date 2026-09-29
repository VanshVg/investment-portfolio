import { createServerSupabase } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/PageHeader'
import { AdvisorMobileForm } from './_components/AdvisorMobileForm'
import { ReminderRulesSection } from './_components/ReminderRulesSection'
import { updateAdvisorMobile, updateReminderRule } from './actions'

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
        title="Reminder settings"
        description="How far ahead each category's renewal reminders fire, and the number they reach you on."
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
    </div>
  )
}
