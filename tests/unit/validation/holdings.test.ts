import { describe, expect, it } from 'vitest'
import { parseHoldingDetails } from '@/lib/validation/holdings'

describe('holding detail validation', () => {
  it('accepts a life insurance policy', () => {
    expect(() =>
      parseHoldingDetails('life_insurance', {
        policy_number: 'LIC-889231',
        plan_type: 'Endowment',
        term_years: 20,
        maturity_date: '2046-03-15',
      }),
    ).not.toThrow()
  })

  it('accepts an empty life insurance detail object', () => {
    expect(parseHoldingDetails('life_insurance', {})).toEqual({})
  })

  it('accepts a general insurance policy', () => {
    const parsed = parseHoldingDetails('general_insurance', {
      sub_category: 'vehicle',
      insured_asset: 'Hyundai Creta GJ-16-XX-1234',
      policy_type: 'Comprehensive car insurance',
    })
    expect(parsed).toMatchObject({ sub_category: 'vehicle' })
  })

  it('requires general insurance to name the insured asset', () => {
    expect(() =>
      parseHoldingDetails('general_insurance', {
        sub_category: 'health',
        policy_type: 'Floater',
      }),
    ).toThrow()
  })

  it('rejects a general insurance sub-category outside the allowed set', () => {
    expect(() =>
      parseHoldingDetails('general_insurance', {
        sub_category: 'travel',
        insured_asset: 'Trip',
        policy_type: 'Travel cover',
      }),
    ).toThrow()
  })

  it('requires a target goal on mutual funds', () => {
    expect(() => parseHoldingDetails('mutual_fund', { folio_number: '12345' })).toThrow()
    expect(() => parseHoldingDetails('mutual_fund', { target_goal: 6_000_000 })).not.toThrow()
  })

  it('accepts a fixed income holding', () => {
    expect(() =>
      parseHoldingDetails('fixed_income', {
        asset_type: 'Bank fixed deposit',
        maturity_date: '2027-10-01',
        interest_rate: 6.5,
        remarks: 'Quarterly payout',
      }),
    ).not.toThrow()
  })

  it('rejects unknown fields so typos surface immediately', () => {
    expect(() =>
      parseHoldingDetails('fixed_income', { asset_type: 'FD', intrest_rate: 6.5 }),
    ).toThrow()
  })

  it('rejects a malformed date', () => {
    expect(() =>
      parseHoldingDetails('fixed_income', { asset_type: 'FD', maturity_date: '01-10-2027' }),
    ).toThrow()
  })
})
