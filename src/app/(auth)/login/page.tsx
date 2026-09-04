import { BRAND } from '@/config/brand'
import { LoginForm } from './LoginForm'

export const metadata = { title: `Sign in — ${BRAND.name}` }

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-[380px]">
        <div className="mb-6 text-center">
          <div
            aria-hidden
            className="mx-auto mb-3 flex h-[38px] w-[38px] items-center justify-center rounded-[3px] border-[1.5px] border-navy font-serif text-lg font-semibold text-navy"
          >
            {BRAND.mark}
          </div>
          <h1 className="font-serif text-2xl font-semibold text-navy">{BRAND.name}</h1>
          <p className="mt-1 text-[12.5px] text-ink-soft">{BRAND.tagline}</p>
        </div>

        <div className="rounded-md border border-line bg-paper-raised p-6">
          <LoginForm />
        </div>
      </div>
    </main>
  )
}
