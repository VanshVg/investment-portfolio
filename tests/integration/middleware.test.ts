import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Exercises the real session gate, not a stand-in for it. The cron route's
// own test imports GET directly and never touches this middleware at all, so
// only a test that calls updateSession itself can prove the nightly job
// reaches the handler in production, where Vercel Cron sends nothing but an
// Authorization header and no session cookie.
describe('updateSession', () => {
  it('does not redirect an unauthenticated cron request', async () => {
    const request = new NextRequest('http://localhost/api/cron/reminders', {
      headers: { authorization: 'Bearer whatever-the-caller-sent' },
    })
    const response = await updateSession(request)
    expect(response.status).not.toBe(307)
  })

  it('still redirects an unauthenticated request to an ordinary private route', async () => {
    const request = new NextRequest('http://localhost/families')
    const response = await updateSession(request)
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/login')
  })
})
