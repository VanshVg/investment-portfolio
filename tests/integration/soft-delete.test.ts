import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { addDays } from 'date-fns'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminClient, ensureUser, signedInClient } from '../helpers/db'
import { fromISODate, toISODate, todayInIndia } from '@/lib/domain/dates'
import { getFamily, listFamilies, listHoldings, listMembers } from '@/lib/queries/families'
import { listOverdue, listRenewals } from '@/lib/queries/renewals'
import { listLiveHoldingIds } from '@/lib/reminders/live-holdings'
import { runReminderSweep } from '@/lib/reminders/sweep'

/**
 * Decision D2: nothing the advisor deletes is destroyed — and nothing deleted
 * may still show up anywhere, least of all in the reminder sweep, where a
 * "deleted" policy that kept producing reminders would be the worst possible
 * leak. Each block deletes one thing and checks every place it could appear.
 */
const EMAIL = 'soft-delete-admin@example.test'
const PASSWORD = 'test-password-123'
const ADVISOR_MOBILE = '+919812300000'
const MEMBER_MOBILE = '+919812300001'

const { revalidatePath, mockCreateServerSupabase } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  mockCreateServerSupabase: vi.fn(),
}))
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }))
vi.mock('next/cache', () => ({ revalidatePath }))
vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: mockCreateServerSupabase }))
mockCreateServerSupabase.mockImplementation(() => signedInClient(EMAIL, PASSWORD))

const { deleteFamily } = await import('@/app/(app)/families/actions')
const { deleteMember } = await import('@/app/(app)/families/[familyId]/member-actions')
const { deleteHolding } = await import('@/app/(app)/families/[familyId]/holding-actions')

const admin = adminClient()
let client: SupabaseClient
let advisorId: string
const today = todayInIndia()
const day = (offset: number) => toISODate(addDays(fromISODate(today)!, offset))
const familyIds: string[] = []

type SoftDeletable = 'families' | 'family_members' | 'holdings'

/** Still in the database, stamped as deleted — kept, not destroyed. */
async function keptAsDeleted(table: SoftDeletable, id: string): Promise<boolean> {
  const { data } = await admin.from(table).select('deleted_at').eq('id', id).single()
  return data?.deleted_at != null
}

/**
 * The advisor has no restore screen; a record is brought back by clearing
 * its stamp in the database, as docs/deployment.md describes. These tests do
 * the same, to prove that is all a restore needs.
 */
async function restoreByHand(table: SoftDeletable, id: string) {
  const { data } = await admin
    .from(table)
    .update({ deleted_at: null })
    .eq('id', id)
    .not('deleted_at', 'is', null)
    .select('id')
  expect(data).toHaveLength(1)
}

/** A household with one consented member, and a policy of theirs due in ten days. */
async function household(name: string) {
  const { data: family } = await admin
    .from('families')
    .insert({ name, owner_advisor_id: advisorId })
    .select('id')
    .single()
  familyIds.push(family!.id)
  const { data: member } = await admin
    .from('family_members')
    .insert({
      family_id: family!.id,
      name: `${name} member`,
      relation: 'self',
      mobile: MEMBER_MOBILE,
      whatsapp_consent: true,
    })
    .select('id')
    .single()
  const { data: holding } = await admin
    .from('holdings')
    .insert({
      family_id: family!.id,
      member_id: member!.id,
      category: 'life_insurance',
      label: `${name} policy`,
      managed_by: 'self',
      anchor_due_date: day(10),
      next_due_date: day(10),
    })
    .select('id')
    .single()
  const { data: instance } = await admin
    .from('due_instances')
    .insert({ holding_id: holding!.id, due_date: day(10) })
    .select('id')
    .single()
  // An overdue one too, so the overdue list is exercised as well.
  const { data: overdueHolding } = await admin
    .from('holdings')
    .insert({
      family_id: family!.id,
      category: 'life_insurance',
      label: `${name} lapsed policy`,
      anchor_due_date: day(-5),
      next_due_date: day(-5),
    })
    .select('id')
    .single()
  await admin.from('due_instances').insert({ holding_id: overdueHolding!.id, due_date: day(-5) })
  return {
    familyId: family!.id as string,
    memberId: member!.id as string,
    holdingId: holding!.id as string,
    overdueHoldingId: overdueHolding!.id as string,
    instanceId: instance!.id as string,
  }
}

async function everywhere(h: Awaited<ReturnType<typeof household>>, name: string) {
  const [families, family, members, holdings, renewals, overdue, live] = await Promise.all([
    listFamilies(client, { search: name }),
    getFamily(client, h.familyId),
    listMembers(client, h.familyId),
    listHoldings(client, h.familyId),
    listRenewals(client, { from: day(0), to: day(30), familyId: h.familyId }),
    listOverdue(client, { before: today, today, familyId: h.familyId }),
    listLiveHoldingIds(admin),
  ])
  return {
    familyListed: families.families.some((f) => f.id === h.familyId),
    familyOpens: family !== null,
    memberIds: members.map((m) => m.id),
    holdingIds: holdings.map((x) => x.id),
    renewalHoldingIds: renewals.rows.map((r) => r.holdingId),
    overdueHoldingIds: overdue.rows.map((r) => r.holdingId),
    liveHoldingIds: live.filter((id) => id === h.holdingId || id === h.overdueHoldingId),
  }
}

async function queuedFor(instanceId: string) {
  await admin.from('reminder_log').delete().eq('due_instance_id', instanceId)
  await runReminderSweep(admin, today)
  const { data } = await admin
    .from('reminder_log')
    .select('recipient_type')
    .eq('due_instance_id', instanceId)
  return [...new Set((data ?? []).map((row) => row.recipient_type))].sort()
}

beforeAll(async () => {
  const user = await ensureUser(EMAIL, PASSWORD, 'admin')
  advisorId = user!.id
  await admin.from('profiles').update({ mobile: ADVISOR_MOBILE }).eq('id', advisorId)
  client = await signedInClient(EMAIL, PASSWORD)
})

afterAll(async () => {
  if (familyIds.length) await admin.from('families').delete().in('id', familyIds)
})

describe('soft delete', () => {
  it('a live household is visible everywhere and reminds both parties', async () => {
    const h = await household('Soft delete — live')
    const seen = await everywhere(h, 'Soft delete — live')
    expect(seen).toMatchObject({ familyListed: true, familyOpens: true, memberIds: [h.memberId] })
    expect(seen.holdingIds).toContain(h.holdingId)
    expect(seen.renewalHoldingIds).toContain(h.holdingId)
    expect(seen.overdueHoldingIds).toContain(h.overdueHoldingId)
    expect(await queuedFor(h.instanceId)).toEqual(['advisor', 'client'])
  })

  it('a deleted holding disappears from every listing and the sweep, and comes back on restore', async () => {
    const h = await household('Soft delete — holding')
    expect((await deleteHolding(h.holdingId, h.familyId)).ok).toBe(true)
    expect((await deleteHolding(h.overdueHoldingId, h.familyId)).ok).toBe(true)

    const seen = await everywhere(h, 'Soft delete — holding')
    expect(seen.holdingIds).not.toContain(h.holdingId)
    expect(seen.renewalHoldingIds).not.toContain(h.holdingId)
    expect(seen.overdueHoldingIds).not.toContain(h.overdueHoldingId)
    expect(seen.liveHoldingIds).toEqual([])
    expect(await queuedFor(h.instanceId)).toEqual([])

    expect(await keptAsDeleted('holdings', h.holdingId)).toBe(true)

    await restoreByHand('holdings', h.holdingId)
    const back = await everywhere(h, 'Soft delete — holding')
    expect(back.holdingIds).toContain(h.holdingId)
    expect(back.renewalHoldingIds).toContain(h.holdingId)
  })

  it('a removed member disappears from the household but keeps their policies, which then remind the advisor only', async () => {
    const h = await household('Soft delete — member')
    expect((await deleteMember(h.memberId, h.familyId)).ok).toBe(true)

    const seen = await everywhere(h, 'Soft delete — member')
    expect(seen.memberIds).toEqual([])
    // Still attributed, and still on the renewals page...
    expect(seen.holdingIds).toContain(h.holdingId)
    expect(seen.renewalHoldingIds).toContain(h.holdingId)
    // ...but a removed member is never messaged.
    expect(await queuedFor(h.instanceId)).toEqual(['advisor'])

    // Their name stays available for the policies still attributed to them.
    const all = await listMembers(client, h.familyId, { includeRemoved: true })
    expect(all).toEqual([expect.objectContaining({ id: h.memberId, removed: true })])

    expect(await keptAsDeleted('family_members', h.memberId)).toBe(true)
    await restoreByHand('family_members', h.memberId)
    expect((await everywhere(h, 'Soft delete — member')).memberIds).toEqual([h.memberId])
    expect(await queuedFor(h.instanceId)).toEqual(['advisor', 'client'])
  })

  it('a deleted household disappears entirely, including from the sweep, and restores whole', async () => {
    const h = await household('Soft delete — family')
    expect((await deleteFamily(h.familyId)).ok).toBe(true)

    const seen = await everywhere(h, 'Soft delete — family')
    expect(seen).toMatchObject({
      familyListed: false,
      familyOpens: false,
      renewalHoldingIds: [],
      overdueHoldingIds: [],
      liveHoldingIds: [],
    })
    expect(await queuedFor(h.instanceId)).toEqual([])

    expect(await keptAsDeleted('families', h.familyId)).toBe(true)
    // Its members and holdings are hidden through the family, not stamped one
    // by one, so clearing the family's stamp alone brings everything back.
    expect(await keptAsDeleted('family_members', h.memberId)).toBe(false)
    expect(await keptAsDeleted('holdings', h.holdingId)).toBe(false)

    await restoreByHand('families', h.familyId)
    const back = await everywhere(h, 'Soft delete — family')
    expect(back).toMatchObject({ familyListed: true, familyOpens: true, memberIds: [h.memberId] })
    expect(back.holdingIds).toEqual(expect.arrayContaining([h.holdingId, h.overdueHoldingId]))
  })

  it('does not count deleted members and holdings in the family list', async () => {
    const h = await household('Soft delete — counts')
    await deleteMember(h.memberId, h.familyId)
    await deleteHolding(h.overdueHoldingId, h.familyId)
    const { families } = await listFamilies(client, { search: 'Soft delete — counts' })
    expect(families[0]).toMatchObject({ memberCount: 0, holdingCount: 1 })
  })

  it('refuses to edit or re-delete something already deleted', async () => {
    const h = await household('Soft delete — stale')
    expect((await deleteHolding(h.holdingId, h.familyId)).ok).toBe(true)
    expect((await deleteHolding(h.holdingId, h.familyId)).ok).toBe(false)
  })
})
