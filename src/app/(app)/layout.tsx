import { Logo } from '@/components/ui/Logo'
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

      <main className="mx-auto max-w-[980px] px-5 pb-16">{children}</main>
    </div>
  )
}
