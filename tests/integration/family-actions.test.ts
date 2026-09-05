import { beforeAll, describe, expect, it } from 'vitest'
import { adminClient, ensureUser } from '../helpers/db'
import { familyInput } from '@/lib/validation/families'

const EMAIL = 'family-actions@example.test'
const PASSWORD = 'test-password-123'
let advisorId: string

describe('family input and cascade behaviour', () => {
  beforeAll(async () => {
    const user = await ensureUser(EMAIL, PASSWORD, 'admin')
    advisorId = user!.id
  })

  it('normalises the head mobile and coerces numerics before the database sees them', () => {
    const parsed = familyInput.parse({
      name: 'Patel',
      headName: 'Rakesh',
      headMobile: '98765 43210',
      notes: '',
      goalHorizonYears: '10',
      assumedCagr: '12.5',
    })
    expect(parsed.headMobile).toBe('+919876543210')
    expect(parsed.goalHorizonYears).toBe(10)
    expect(parsed.assumedCagr).toBe(12.5)
    expect(parsed.notes).toBeNull()
  })

  it('rejects a horizon the database check would also reject', () => {
    expect(
      familyInput.safeParse({
        name: 'Patel',
        headName: '',
        headMobile: '',
        notes: '',
        goalHorizonYears: '99',
        assumedCagr: '12',
      }).success,
    ).toBe(false)
  })

  it('cascades members, holdings and due instances when a family is deleted', async () => {
    const admin = adminClient()
    const { data: family } = await admin
      .from('families')
      .insert({ name: 'Cascade Probe', owner_advisor_id: advisorId })
      .select()
      .single()

    await admin.from('family_members').insert({ family_id: family!.id, name: 'M', relation: 'other' })
    const { data: holding } = await admin
      .from('holdings')
      .insert({ family_id: family!.id, category: 'life_insurance', label: 'H' })
      .select()
      .single()
    await admin.from('due_instances').insert({ holding_id: holding!.id, due_date: '2027-01-01' })

    await admin.from('families').delete().eq('id', family!.id)

    const { data: members } = await admin
      .from('family_members')
      .select('id')
      .eq('family_id', family!.id)
    const { data: holdings } = await admin.from('holdings').select('id').eq('family_id', family!.id)
    const { data: instances } = await admin
      .from('due_instances')
      .select('id')
      .eq('holding_id', holding!.id)

    expect(members).toEqual([])
    expect(holdings).toEqual([])
    expect(instances).toEqual([])
  })
})
