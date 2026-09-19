import Link from 'next/link'
import { Logo } from '@/components/ui/Logo'
import { createServerSupabase } from '@/lib/supabase/server'
import { signOut } from './actions'

// The application's primary navigation. Built as a list so adding a section
// is a one-line addition here, not a rework of the header markup.
const NAV_ITEMS: { href: string; label: string }[] = [
  { href: '/renewals', label: 'Renewals' },
  { href: '/settings/reminders', label: 'Settings' },
]

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen">
      <header className="bg-gradient-to-b from-navy to-navy-deep px-5 py-6 text-white">
        <div className="mx-auto flex max-w-[940px] flex-wrap items-end justify-between gap-4">
          <Logo />
          <div className="text-right font-mono text-[11.5px] leading-relaxed text-[#aeb8cc]">
            <p>{user?.email}</p>
            <form action={signOut}>
              <button type="submit" className="mt-1 underline hover:text-white">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <nav
        aria-label="Primary"
        className="border-b border-line bg-paper-raised px-5 py-2"
      >
        <div className="mx-auto flex max-w-[980px] gap-4">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-[12.5px] text-ink-soft hover:text-navy"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-[980px] px-5 pb-16">{children}</main>
    </div>
  )
}
