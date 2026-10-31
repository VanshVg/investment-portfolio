import { describe, expect, it } from 'vitest'
import { recheck, type RowState } from '@/lib/whatsapp/recheck'

const TODAY = '2027-03-01'

const person = (fields: { deleted?: boolean; consent?: boolean; mobile?: string | null }) => ({
  deleted: false,
  consent: true,
  mobile: '+919800000001',
  ...fields,
})

function client(overrides: Partial<RowState> = {}): RowState {
  return {
    recipientType: 'client',
    recipientMobile: '+919800000001',
    dueDate: '2027-03-15',
    paymentStatus: 'unknown',
    offSchedule: false,
    holdingDeleted: false,
    familyDeleted: false,
    remindersEnabled: true,
    managedBy: 'self',
    nextDueDate: '2027-03-15',
    member: { deleted: false, consent: true, mobile: '+919800000001' },
    advisorMobile: '+919800000099',
    ...overrides,
  }
}

const advisor = (overrides: Partial<RowState> = {}) =>
  client({ recipientType: 'advisor', recipientMobile: '+919800000099', ...overrides })

describe('recheck', () => {
  it('sends a client reminder that is still valid, to the number on file', () => {
    expect(recheck(client(), TODAY)).toEqual({ action: 'send', mobile: '+919800000001' })
  })

  it('sends to the new number when a consented client’s number changed (D3)', () => {
    const row = client({ member: person({ mobile: '+919800000002' }) })
    expect(recheck(row, TODAY)).toEqual({ action: 'send', mobile: '+919800000002' })
  })

  it('sends an advisor row to the advisor’s current number', () => {
    expect(recheck(advisor({ advisorMobile: '+919800000098' }), TODAY)).toEqual({
      action: 'send',
      mobile: '+919800000098',
    })
  })

  it('still sends on the due date itself', () => {
    expect(recheck(client({ dueDate: TODAY, nextDueDate: TODAY }), TODAY).action).toBe('send')
  })

  const skips: [string, RowState, string][] = [
    ['a deleted holding', client({ holdingDeleted: true }), 'deleted'],
    ['a deleted household', client({ familyDeleted: true }), 'deleted'],
    ['reminders switched off', client({ remindersEnabled: false }), 'reminders_off'],
    ['a paid due date', client({ paymentStatus: 'paid' }), 'resolved'],
    ['an off-schedule due date', client({ offSchedule: true }), 'resolved'],
    ['a due date already renewed past', client({ nextDueDate: '2028-03-15' }), 'resolved'],
    [
      'a due date gone by',
      client({ dueDate: '2027-02-28', nextDueDate: '2027-02-28' }),
      'expired',
    ],
    ['a holding now managed elsewhere', client({ managedBy: 'external' }), 'managed_elsewhere'],
    ['a removed member', client({ member: person({ deleted: true }) }), 'member_removed'],
    ['no attributed member', client({ member: null }), 'member_removed'],
    ['withdrawn consent', client({ member: person({ consent: false }) }), 'no_consent'],
    ['a client without a number', client({ member: person({ mobile: null }) }), 'no_mobile'],
    ['an advisor without a number', advisor({ advisorMobile: null }), 'no_mobile'],
  ]

  for (const [what, row, reason] of skips) {
    it(`skips ${what} as ${reason}`, () => {
      expect(recheck(row, TODAY)).toEqual({ action: 'skip', reason })
    })
  }

  it('does not skip an advisor row for the client’s consent or management', () => {
    const row = advisor({ managedBy: 'external', member: null })
    expect(recheck(row, TODAY).action).toBe('send')
  })
})
