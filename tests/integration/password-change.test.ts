import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { anonClient, ensureUser, signedInClient } from '../helpers/db'

const EMAIL = 'password-change-admin@example.test'
const ORIGINAL = 'original-password-123'
const NEW = 'replacement-password-456'

const { mockCreateServerSupabase } = vi.hoisted(() => ({ mockCreateServerSupabase: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }))
vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: mockCreateServerSupabase }))

const { changePassword } = await import('@/app/(app)/settings/reminders/password-actions')

/** Whether this email and password can sign in right now. */
async function canSignIn(password: string): Promise<boolean> {
  const { error } = await anonClient().auth.signInWithPassword({ email: EMAIL, password })
  return error === null
}

describe('changePassword', () => {
  beforeEach(async () => {
    // Every test starts signed in with the original password.
    await ensureUser(EMAIL, ORIGINAL, 'admin')
    mockCreateServerSupabase.mockImplementation(() => signedInClient(EMAIL, ORIGINAL))
  })

  afterAll(async () => {
    await ensureUser(EMAIL, ORIGINAL, 'admin')
  })

  it('changes the password when the current one is right', async () => {
    const result = await changePassword({
      currentPassword: ORIGINAL,
      newPassword: NEW,
      confirmPassword: NEW,
    })
    expect(result.ok).toBe(true)
    expect(await canSignIn(NEW)).toBe(true)
    expect(await canSignIn(ORIGINAL)).toBe(false)
  })

  it('refuses a wrong current password and changes nothing', async () => {
    const result = await changePassword({
      currentPassword: 'not-the-password-000',
      newPassword: NEW,
      confirmPassword: NEW,
    })
    expect(result).toEqual({
      ok: false,
      fieldErrors: { currentPassword: 'Current password is incorrect.' },
    })
    expect(await canSignIn(ORIGINAL)).toBe(true)
    expect(await canSignIn(NEW)).toBe(false)
  })

  it('reports validation problems against their fields without calling the server', async () => {
    const result = await changePassword({
      currentPassword: ORIGINAL,
      newPassword: 'short',
      confirmPassword: 'short',
    })
    expect(result).toMatchObject({ ok: false, fieldErrors: { newPassword: expect.any(String) } })
    expect(await canSignIn(ORIGINAL)).toBe(true)
  })

  it('asks for a fresh sign-in when there is no session', async () => {
    mockCreateServerSupabase.mockImplementation(() => anonClient())
    const result = await changePassword({
      currentPassword: ORIGINAL,
      newPassword: NEW,
      confirmPassword: NEW,
    })
    expect(result).toEqual({ ok: false, formError: 'Your session has expired. Sign in again.' })
    expect(await canSignIn(ORIGINAL)).toBe(true)
  })
})
