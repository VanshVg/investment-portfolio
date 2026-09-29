import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { adminClient, anonClient, ensureUser, signedInClient } from '../helpers/db'

const EMAIL = 'member-actions@example.test'
const PASSWORD = 'test-password-123'
let advisorId: string
let familyId: string

const { revalidatePath, mockCreateServerSupabase } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  mockCreateServerSupabase: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [],
    set: () => {},
  }),
}))

vi.mock('next/cache', () => ({
  revalidatePath,
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: mockCreateServerSupabase,
}))

mockCreateServerSupabase.mockImplementation(() => signedInClient(EMAIL, PASSWORD))

const { createMember, updateMember, deleteMember } = await import(
  '@/app/(app)/families/[familyId]/member-actions'
)

// Cascades away the shared 'Member Fixture' family along with every member and
// holding row the tests below created against it, so repeated local runs
// don't accumulate orphaned fixture data.
afterAll(async () => {
  await adminClient().from('families').delete().eq('id', familyId)
})

describe('member records', () => {
  beforeAll(async () => {
    const user = await ensureUser(EMAIL, PASSWORD, 'admin')
    advisorId = user!.id
    const { data } = await adminClient()
      .from('families')
      .insert({ name: 'Member Fixture', owner_advisor_id: advisorId })
      .select()
      .single()
    familyId = data!.id
  })

  it('orphans rather than deletes a member holding, so nothing is lost silently', async () => {
    const admin = adminClient()
    const { data: member } = await admin
      .from('family_members')
      .insert({ family_id: familyId, name: 'Priya', relation: 'spouse' })
      .select()
      .single()
    const { data: holding } = await admin
      .from('holdings')
      .insert({
        family_id: familyId,
        member_id: member!.id,
        category: 'life_insurance',
        label: 'Priya policy',
      })
      .select()
      .single()

    await admin.from('family_members').delete().eq('id', member!.id)

    const { data: after } = await admin
      .from('holdings')
      .select('id, member_id')
      .eq('id', holding!.id)
      .single()

    expect(after).not.toBeNull()
    expect(after!.member_id).toBeNull()
  })

  it('denies anonymous member inserts', async () => {
    const { error } = await anonClient()
      .from('family_members')
      .insert({ family_id: familyId, name: 'Anon', relation: 'other' })
    expect(error).not.toBeNull()
  })

  it('denies anonymous member updates', async () => {
    const admin = adminClient()
    const { data: member } = await admin
      .from('family_members')
      .insert({ family_id: familyId, name: 'Update Target', relation: 'other' })
      .select()
      .single()

    await anonClient().from('family_members').update({ name: 'Hacked' }).eq('id', member!.id)

    const { data: after } = await admin
      .from('family_members')
      .select('name')
      .eq('id', member!.id)
      .single()
    expect(after!.name).toBe('Update Target')
  })
})

describe('createMember / updateMember / deleteMember server actions', () => {
  beforeAll(async () => {
    const user = await ensureUser(EMAIL, PASSWORD, 'admin')
    advisorId = user!.id
  })

  it('creates a member with the mapped columns and revalidates the family page', async () => {
    revalidatePath.mockClear()
    const input = {
      name: 'Aarav — action create',
      relation: 'son',
      mobile: '98765 22222',
      whatsappConsent: true,
    }

    const result = await createMember(familyId, input)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok result')

    const admin = adminClient()
    const { data: row, error } = await admin
      .from('family_members')
      .select('*')
      .eq('id', result.id)
      .single()
    expect(error).toBeNull()
    expect(row?.family_id).toBe(familyId)
    expect(row?.name).toBe('Aarav — action create')
    expect(row?.relation).toBe('son')
    expect(row?.mobile).toBe('+919876522222')
    expect(row?.whatsapp_consent).toBe(true)

    expect(revalidatePath).toHaveBeenCalledWith(`/families/${familyId}`)

    await admin.from('family_members').delete().eq('id', result.id)
  })

  it('updates the intended fields', async () => {
    const admin = adminClient()
    const { data: member } = await admin
      .from('family_members')
      .insert({ family_id: familyId, name: 'Before update', relation: 'other' })
      .select()
      .single()

    revalidatePath.mockClear()
    const result = await updateMember(member!.id, familyId, {
      name: 'After update',
      relation: 'daughter',
      mobile: '98765 33333',
      whatsappConsent: true,
    })
    expect(result.ok).toBe(true)

    const { data: row } = await admin
      .from('family_members')
      .select('*')
      .eq('id', member!.id)
      .single()
    expect(row?.name).toBe('After update')
    expect(row?.relation).toBe('daughter')
    expect(row?.mobile).toBe('+919876533333')
    expect(row?.whatsapp_consent).toBe(true)

    expect(revalidatePath).toHaveBeenCalledWith(`/families/${familyId}`)

    await admin.from('family_members').delete().eq('id', member!.id)
  })

  it('soft-deletes a member and revalidates the family page, keeping their holdings attributed to them', async () => {
    const admin = adminClient()
    const { data: member } = await admin
      .from('family_members')
      .insert({ family_id: familyId, name: 'To delete', relation: 'other' })
      .select()
      .single()
    const { data: holding } = await admin
      .from('holdings')
      .insert({
        family_id: familyId,
        member_id: member!.id,
        category: 'life_insurance',
        label: 'Orphan-to-be',
      })
      .select()
      .single()

    revalidatePath.mockClear()
    const result = await deleteMember(member!.id, familyId)
    expect(result.ok).toBe(true)

    // Soft delete (decision D2): the member is stamped, not destroyed...
    const { data: row } = await admin
      .from('family_members')
      .select('id, deleted_at')
      .eq('id', member!.id)
      .single()
    expect(row!.deleted_at).not.toBeNull()

    // ...and their holding stays attributed to them, instead of losing its
    // owner as the old hard delete's ON DELETE SET NULL made it do.
    const { data: after } = await admin
      .from('holdings')
      .select('id, member_id')
      .eq('id', holding!.id)
      .single()
    expect(after!.member_id).toBe(member!.id)

    expect(revalidatePath).toHaveBeenCalledWith(`/families/${familyId}`)

    await admin.from('holdings').delete().eq('id', holding!.id)
  })

  it('refuses to record consent without a mobile number, mapping the check constraint, and writes nothing', async () => {
    const admin = adminClient()
    const before = await admin
      .from('family_members')
      .select('id')
      .eq('family_id', familyId)
      .eq('name', 'Consent without mobile')

    const result = await createMember(familyId, {
      name: 'Consent without mobile',
      relation: 'other',
      mobile: '',
      whatsappConsent: true,
    })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure result')
    expect(result.fieldErrors?.whatsappConsent).toBe(
      'Add a mobile number before recording WhatsApp consent.',
    )

    const after = await admin
      .from('family_members')
      .select('id')
      .eq('family_id', familyId)
      .eq('name', 'Consent without mobile')
    expect(after.data ?? []).toEqual(before.data ?? [])
  })

  // Postgres applies RLS's USING clause to UPDATE/DELETE as a row filter,
  // not an error: an anonymous write against a real row comes back with
  // `error: null`, and the row survives untouched. A test that only checks
  // `result.ok` cannot see that — it has to read the row back to catch it.
  it('reports failure, not success, when an anonymous client attempts an update, and writes nothing', async () => {
    const admin = adminClient()
    const { data: member } = await admin
      .from('family_members')
      .insert({ family_id: familyId, name: 'Anon action update target', relation: 'other' })
      .select()
      .single()

    mockCreateServerSupabase.mockImplementationOnce(async () => anonClient())

    const result = await updateMember(member!.id, familyId, {
      name: 'Hacked',
      relation: 'other',
      mobile: '',
      whatsappConsent: false,
    })

    expect(result.ok).toBe(false)

    const { data: row } = await admin
      .from('family_members')
      .select('name')
      .eq('id', member!.id)
      .single()
    expect(row?.name).toBe('Anon action update target')

    await admin.from('family_members').delete().eq('id', member!.id)
  })

  it('reports failure, not success, when an anonymous client attempts a delete, and the row survives', async () => {
    const admin = adminClient()
    const { data: member } = await admin
      .from('family_members')
      .insert({ family_id: familyId, name: 'Anon action delete target', relation: 'other' })
      .select()
      .single()

    mockCreateServerSupabase.mockImplementationOnce(async () => anonClient())

    const result = await deleteMember(member!.id, familyId)

    expect(result.ok).toBe(false)

    const { data: row } = await admin
      .from('family_members')
      .select('id')
      .eq('id', member!.id)
      .maybeSingle()
    expect(row).not.toBeNull()

    await admin.from('family_members').delete().eq('id', member!.id)
  })
})
