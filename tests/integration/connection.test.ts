import { describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'

describe('local Supabase stack', () => {
  it('exposes the environment the app needs', () => {
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBeTruthy()
    expect(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBeTruthy()
    expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBeTruthy()
  })

  it('answers an authenticated service-role request', async () => {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { error } = await admin.auth.admin.listUsers()
    expect(error).toBeNull()
  })
})
