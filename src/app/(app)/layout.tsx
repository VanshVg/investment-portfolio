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
      <header className="bg-gradient-to-b from-navy to-navy-deep px-5 py-4 text-white sm:py-6">
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
          {/* On a phone the logo takes the whole width, so the account
              details get a strip of their own beneath it: email on the left,
              a Sign out button big enough to tap on the right. From `sm` up
              they sit stacked in the masthead's right-hand corner. */}
          <div className="flex w-full items-center justify-between gap-3 border-t border-white/10 pt-3 font-mono text-[11.5px] leading-relaxed text-[#aeb8cc] sm:block sm:w-auto sm:border-0 sm:pt-0 sm:text-right">
            <p className="min-w-0 truncate">{user?.email}</p>
            <form action={signOut} className="shrink-0">
              <button
                type="submit"
                className="rounded border border-white/25 px-3 py-1.5 hover:bg-white/10 hover:text-white sm:mt-1 sm:border-0 sm:p-0 sm:underline sm:hover:bg-transparent"
              >
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
