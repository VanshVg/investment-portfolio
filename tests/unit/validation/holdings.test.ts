import { describe, expect, it } from 'vitest'
import { holdingInput, parseHoldingDetails } from '@/lib/validation/holdings'

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

describe('holdingInput', () => {
  const base = {
    memberId: null,
    managedBy: 'self' as const,
    label: 'HDFC Click2Protect',
    institution: 'HDFC Life',
    principalAmount: 5000000,
    periodicAmount: 12500,
    nextDueDate: '2027-03-12',
    dueFrequency: 'annual' as const,
    remindersEnabled: true,
  }

  it('accepts a life insurance row with its own detail fields', () => {
    const parsed = holdingInput.parse({
      ...base,
      category: 'life_insurance',
      details: { policy_number: 'P/1234', term_years: 20 },
    })
    expect(parsed.category).toBe('life_insurance')
  })

  it('rejects detail fields belonging to another category', () => {
    const result = holdingInput.safeParse({
      ...base,
      category: 'life_insurance',
      details: { folio_number: 'F/999' },
    })
    expect(result.success).toBe(false)
  })

  it('requires general insurance to declare its sub-category and asset', () => {
    const result = holdingInput.safeParse({
      ...base,
      category: 'general_insurance',
      details: {},
    })
    expect(result.success).toBe(false)
  })

  it('accepts a complete general insurance row', () => {
    const parsed = holdingInput.parse({
      ...base,
      category: 'general_insurance',
      details: { sub_category: 'health', insured_asset: 'Family floater', policy_type: 'Floater' },
    })
    expect(parsed.category).toBe('general_insurance')
  })

  it('requires a label', () => {
    expect(
      holdingInput.safeParse({ ...base, label: '  ', category: 'life_insurance', details: {} }).success,
    ).toBe(false)
  })

  it('treats a blank due date as absent', () => {
    const parsed = holdingInput.parse({
      ...base,
      nextDueDate: '',
      category: 'life_insurance',
      details: {},
    })
    expect(parsed.nextDueDate).toBeNull()
  })

  it('accepts the nulls an empty draft actually supplies', () => {
    // emptyHoldingDraft() sets these to null, so null must be a valid INPUT and
    // not merely a permitted output. This is the exact shape a new row submits.
    const parsed = holdingInput.parse({
      ...base,
      principalAmount: null,
      periodicAmount: null,
      nextDueDate: null,
      category: 'life_insurance',
      details: {},
    })
    expect(parsed.principalAmount).toBeNull()
    expect(parsed.periodicAmount).toBeNull()
    expect(parsed.nextDueDate).toBeNull()
  })

  it('accepts a mutual fund row with its own detail fields', () => {
    const parsed = holdingInput.parse({
      ...base,
      category: 'mutual_fund',
      details: { target_goal: 1000000, folio_number: 'F/5678', fund_house: 'ICICI Prudential' },
    })
    expect(parsed.category).toBe('mutual_fund')
  })

  it('rejects mutual fund detail fields on a life insurance row', () => {
    const result = holdingInput.safeParse({
      ...base,
      category: 'life_insurance',
      details: { folio_number: 'F/5678', target_goal: 1000000 },
    })
    expect(result.success).toBe(false)
  })

  it('accepts a fixed income row with its own detail fields', () => {
    const parsed = holdingInput.parse({
      ...base,
      category: 'fixed_income',
      details: { asset_type: 'Bank FD', interest_rate: 6.5, payout_frequency: 'Quarterly', remarks: 'Senior citizen rate' },
    })
    expect(parsed.category).toBe('fixed_income')
  })

  it('rejects fixed income detail fields on a general insurance row', () => {
    const result = holdingInput.safeParse({
      ...base,
      category: 'general_insurance',
      details: { asset_type: 'FD', sub_category: 'health', insured_asset: 'Self', policy_type: 'Floater' },
    })
    expect(result.success).toBe(false)
  })
})
