import { beforeAll, describe, expect, it } from 'vitest'
import { anonClient, ensureUser, signedInClient } from '../helpers/db'

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
})
