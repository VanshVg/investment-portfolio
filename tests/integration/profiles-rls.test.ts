import { beforeAll, describe, expect, it } from 'vitest'
import { adminClient, anonClient, ensureUser, signedInClient } from '../helpers/db'

const EMAIL = 'rls-admin@example.test'
const PASSWORD = 'test-password-123'

describe('profiles row-level security', () => {
  beforeAll(async () => {
    await ensureUser(EMAIL, PASSWORD, 'admin')
  })

  it('creates a profile row automatically for a new user', async () => {
    const client = await signedInClient(EMAIL, PASSWORD)
    const { data, error } = await client.from('profiles').select('id, role, full_name').single()
    expect(error).toBeNull()
    expect(data?.role).toBe('admin')
  })

  it('denies anonymous reads', async () => {
    const { data, error } = await anonClient().from('profiles').select('id')
    // RLS surfaces as either an error or an empty set — never as rows.
    expect(error ?? data).not.toBeNull()
    expect(data ?? []).toEqual([])
  })

  it('reports admin status through is_admin()', async () => {
    const client = await signedInClient(EMAIL, PASSWORD)
    const { data, error } = await client.rpc('is_admin')
    expect(error).toBeNull()
    expect(data).toBe(true)
  })

  it('allows a user to update their own full_name', async () => {
    const client = await signedInClient(EMAIL, PASSWORD)
    const {
      data: { user },
    } = await client.auth.getUser()
    const { error } = await client
      .from('profiles')
      .update({ full_name: 'Updated Name' })
      .eq('id', user!.id)
    expect(error).toBeNull()

    const { data } = await client.from('profiles').select('full_name').single()
    expect(data?.full_name).toBe('Updated Name')
  })

  it('denies a user updating their own role', async () => {
    const client = await signedInClient(EMAIL, PASSWORD)
    const {
      data: { user },
    } = await client.auth.getUser()
    const { error } = await client.from('profiles').update({ role: 'client' }).eq('id', user!.id)
    expect(error).not.toBeNull()

    const { data } = await client.from('profiles').select('role').single()
    expect(data?.role).toBe('admin')
  })

  it('routes a valid non-default role from metadata into the profile', async () => {
    const email = 'rls-staff@example.test'
    await ensureUser(email, PASSWORD, 'staff')
    const client = await signedInClient(email, PASSWORD)
    const { data, error } = await client.from('profiles').select('role').single()
    expect(error).toBeNull()
    expect(data?.role).toBe('staff')
  })

  it('rejects an unrecognized role and leaves no orphaned user', async () => {
    const email = 'rls-invalid-role@example.test'
    const admin = adminClient()

    const { data: before } = await admin.auth.admin.listUsers()
    const stale = before?.users.find((u) => u.email === email)
    if (stale) await admin.auth.admin.deleteUser(stale.id)

    // admin.auth.admin.createUser() collapses the underlying Postgres error
    // into a generic "Database error creating new user" (AuthRetryableFetchError,
    // status 500, no message detail — verified by hand before writing this
    // assertion). Call the admin REST endpoint directly so the trigger's actual
    // exception message, naming the offending value, is visible to the test.
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: 'Test User', role: 'owner' },
      }),
    })

    expect(res.ok).toBe(false)
    const body = await res.json()
    expect(body.message).toContain('owner')

    const { data: after } = await admin.auth.admin.listUsers()
    expect(after?.users.some((u) => u.email === email)).toBe(false)
  })
})
