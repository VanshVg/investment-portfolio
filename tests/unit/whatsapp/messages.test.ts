import { describe, expect, it } from 'vitest'
import {
  advisorSummaryParams,
  clientReminderParams,
  optOutConfirmation,
  sanitizeParam,
} from '@/lib/whatsapp/messages'

describe('sanitizeParam', () => {
  it('turns newlines and tabs into spaces, since Meta rejects them in a parameter', () => {
    expect(sanitizeParam('Line one\nLine two\tend')).toBe('Line one Line two end')
  })

  it('collapses long runs of spaces and trims', () => {
    expect(sanitizeParam('  a      b  ')).toBe('a b')
  })

  it('never sends an empty parameter, which Meta also rejects', () => {
    expect(sanitizeParam('   ')).toBe('-')
  })

  it('caps the length', () => {
    expect(sanitizeParam('x'.repeat(2000))).toHaveLength(1000)
  })
})

describe('clientReminderParams', () => {
  const base = {
    memberName: 'Rajeshkumar Patel',
    advisorName: 'Hiral Investmentwala',
    holdingLabel: 'LIC Jeevan Anand',
    dueDate: '2027-03-15',
    amountDue: 12500,
  }

  it('fills the five variables in order, the date as DD-MM-YYYY and the amount in ₹', () => {
    expect(clientReminderParams(base)).toEqual([
      'Rajeshkumar Patel',
      'Hiral Investmentwala',
      'LIC Jeevan Anand',
      '15-03-2027',
      '₹12,500',
    ])
  })

  it('uses Indian digit grouping for large amounts', () => {
    expect(clientReminderParams({ ...base, amountDue: 5000000 })[4]).toBe('₹50,00,000')
  })

  it('says "as per your policy" when the amount is not known', () => {
    expect(clientReminderParams({ ...base, amountDue: null })[4]).toBe('as per your policy')
  })

  it('sanitises every value', () => {
    expect(clientReminderParams({ ...base, holdingLabel: 'Plan\nA' })[2]).toBe('Plan A')
  })
})

describe('advisorSummaryParams', () => {
  const item = (familyName: string, holdingLabel: string, dueDate: string) => ({
    familyName,
    holdingLabel,
    dueDate,
  })

  it('lists items soonest first, with the overdue count and the renewals link', () => {
    expect(
      advisorSummaryParams({
        items: [
          item('Shah', 'Star Health', '2027-03-20'),
          item('Patel', 'LIC Jeevan', '2027-03-15'),
        ],
        overdueCount: 1,
        renewalsUrl: 'https://example.app/renewals',
      }),
    ).toEqual([
      '2',
      'Patel – LIC Jeevan (15-03-2027); Shah – Star Health (20-03-2027)',
      '1',
      'https://example.app/renewals',
    ])
  })

  it('names at most five, then says how many more', () => {
    const items = Array.from({ length: 7 }, (_, i) =>
      item(`Family ${i + 1}`, 'Policy', `2027-03-${String(10 + i).padStart(2, '0')}`),
    )
    const [count, list] = advisorSummaryParams({ items, overdueCount: 0, renewalsUrl: 'u' })
    expect(count).toBe('7')
    expect(list.split('; ')).toHaveLength(5)
    expect(list.endsWith('and 2 more')).toBe(true)
  })
})

describe('optOutConfirmation', () => {
  it('names the advisor and says how to come back', () => {
    expect(optOutConfirmation('Hiral Investmentwala')).toBe(
      "You won't receive further reminders from Hiral Investmentwala. " +
        'Reply START if you change your mind.',
    )
  })
})
