import Link from 'next/link'
import { Logo } from '@/components/ui/Logo'
import { PrimaryNav } from '@/components/ui/PrimaryNav'
import { BRAND } from '@/config/brand'
import { createServerSupabase } from '@/lib/supabase/server'
import { signOut } from './actions'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen">
      <header className="bg-gradient-to-b from-navy to-navy-deep px-5 py-6 text-white">
        <div className="mx-auto flex max-w-[940px] flex-wrap items-end justify-between gap-4">
          {/* The masthead is the way home from anywhere, as it is on most
              sites. Home is the families list. Named after the brand, not
              "families": Playwright matches names by substring, and a second
              link containing "families" would collide with the family page's
              own "← All families". */}
          <Link
            href="/families"
            aria-label={`${BRAND.name} home`}
            className="rounded-[3px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c9b77e]"
          >
            <Logo />
          </Link>
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

      <PrimaryNav />

      <main className="mx-auto max-w-[980px] px-5 pb-16">{children}</main>
    </div>
  )
}
