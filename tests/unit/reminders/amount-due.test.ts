import { describe, expect, it } from 'vitest'
import { amountDueFor } from '@/lib/reminders/amount-due'

describe('amountDueFor', () => {
  it('is the premium for insurance and mutual funds', () => {
    for (const category of ['life_insurance', 'general_insurance', 'mutual_fund'] as const) {
      expect(
        amountDueFor({ category, periodic_amount: 25000, principal_amount: 1000000, details: {} }),
      ).toBe(25000)
    }
  })

  it('is the maturity amount for fixed income, when the advisor has entered one (D4)', () => {
    expect(
      amountDueFor({
        category: 'fixed_income',
        periodic_amount: null,
        principal_amount: 1000000,
        details: { asset_type: 'FD', maturity_amount: 1070000 },
      }),
    ).toBe(1070000)
  })

  it('falls back to the amount invested for fixed income without a maturity amount', () => {
    expect(
      amountDueFor({
        category: 'fixed_income',
        periodic_amount: null,
        principal_amount: 1000000,
        details: { asset_type: 'FD' },
      }),
    ).toBe(1000000)
  })

  it('is null when there is genuinely nothing to show', () => {
    expect(
      amountDueFor({ category: 'fixed_income', periodic_amount: null, principal_amount: null, details: {} }),
    ).toBeNull()
    expect(
      amountDueFor({ category: 'life_insurance', periodic_amount: null, principal_amount: 500000, details: {} }),
    ).toBeNull()
  })

  it('reads numeric columns that arrive as strings from PostgREST', () => {
    expect(
      amountDueFor({
        category: 'fixed_income',
        periodic_amount: null,
        principal_amount: '300000.00',
        details: { asset_type: 'NCD' },
      }),
    ).toBe(300000)
  })
})
