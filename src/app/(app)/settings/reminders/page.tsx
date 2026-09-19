import { createServerSupabase } from '@/lib/supabase/server'
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
    <div className="pt-7">
      <h1 className="font-serif text-[20px] font-semibold text-navy">Reminder settings</h1>
      <p className="mt-1 text-[12.5px] text-ink-soft">
        How far ahead each category&apos;s renewal reminders fire, and the number they reach you
        on.
      </p>

      <div className="mt-4">
        <AdvisorMobileForm mobile={profile?.mobile ?? null} updateAdvisorMobile={updateAdvisorMobile} />
      </div>

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
