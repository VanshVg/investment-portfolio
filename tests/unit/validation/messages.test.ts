import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import { familyInput } from '@/lib/validation/families'
import { memberInput } from '@/lib/validation/members'
import { holdingInput } from '@/lib/validation/holdings'
import { reminderRuleInput } from '@/lib/validation/reminders'
import { fromZodError } from '@/lib/actions/result'

/**
 * What the advisor actually reads when a save is rejected. Every message
 * here goes through `fromZodError`, the same path an action takes, so a
 * library default ("Too small: expected number to be >0") cannot slip back
 * onto the screen without one of these failing.
 */
function errorsOf(schema: z.ZodType, input: unknown): Record<string, string> {
  const result = schema.safeParse(input)
  if (result.success) throw new Error('expected the input to be rejected')
  const action = fromZodError(result.error)
  if (action.ok) throw new Error('unreachable')
  return action.fieldErrors ?? {}
}

function accepts(schema: z.ZodType, input: unknown): boolean {
  return schema.safeParse(input).success
}

const family = { name: 'Patel', headName: '', headMobile: '', notes: '', goalHorizonYears: 8, assumedCagr: 12 }
const member = { name: 'Asha', relation: 'daughter', mobile: '', whatsappConsent: false }
const base = {
  memberId: null,
  managedBy: 'self',
  label: 'Policy',
  institution: '',
  principalAmount: null,
  periodicAmount: null,
  nextDueDate: null,
  dueFrequency: 'annual',
  remindersEnabled: true,
}
const life = (over: Record<string, unknown> = {}, details: Record<string, unknown> = {}) => ({
  ...base,
  ...over,
  category: 'life_insurance',
  details,
})

describe('no library default ever reaches the advisor', () => {
  it('names the missing required details on general insurance', () => {
    expect(
      errorsOf(holdingInput, { ...base, category: 'general_insurance', details: { sub_category: 'health' } }),
    ).toEqual({
      'details.insured_asset': 'Insured asset is required.',
      'details.policy_type': 'Policy type is required.',
    })
  })

  it('names the missing target goal on a mutual fund', () => {
    expect(errorsOf(holdingInput, { ...base, category: 'mutual_fund', details: {} })).toEqual({
      'details.target_goal': 'Target goal is required.',
    })
  })

  it('names the missing asset type on fixed income', () => {
    expect(errorsOf(holdingInput, { ...base, category: 'fixed_income', details: {} })).toEqual({
      'details.asset_type': 'Asset type is required.',
    })
  })

  it('treats a detail made only of spaces as missing, not as filled in', () => {
    expect(
      errorsOf(holdingInput, {
        ...base,
        category: 'fixed_income',
        details: { asset_type: '   ' },
      }),
    ).toEqual({ 'details.asset_type': 'Asset type is required.' })
  })

  it.each([
    [{ term_years: 0 }, 'details.term_years', 'Term must be at least 1 year.'],
    [{ term_years: 2.5 }, 'details.term_years', 'Use whole years.'],
    [{ term_years: 101 }, 'details.term_years', 'Term must be 100 years or less.'],
  ])('explains a bad life term %j', (details, key, message) => {
    expect(errorsOf(holdingInput, life({}, details))).toEqual({ [key]: message })
  })

  it.each([
    [-1, 'Interest rate cannot be negative.'],
    [51, 'Interest rate must be 50% or less.'],
  ])('explains an interest rate of %s', (rate, message) => {
    expect(
      errorsOf(holdingInput, {
        ...base,
        category: 'fixed_income',
        details: { asset_type: 'FD', interest_rate: rate },
      }),
    ).toEqual({ 'details.interest_rate': message })
  })

  it.each([
    [0, 'Goal horizon must be at least 1 year.'],
    [41, 'Goal horizon must be 40 years or less.'],
  ])('explains a mutual fund goal horizon of %s', (years, message) => {
    expect(
      errorsOf(holdingInput, {
        ...base,
        category: 'mutual_fund',
        details: { target_goal: 100000, goal_horizon_years: years },
      }),
    ).toEqual({ 'details.goal_horizon_years': message })
  })
})

describe('amounts fit the database, not just the schema', () => {
  // numeric(14, 2): twelve digits before the point, two after.
  it('rejects an amount the database column cannot hold, with a message instead of a failed save', () => {
    expect(errorsOf(holdingInput, life({ principalAmount: 1e12 }))).toEqual({
      principalAmount: 'Enter an amount below ₹1,00,000 crore.',
    })
  })

  it('accepts the largest amount the column holds', () => {
    expect(accepts(holdingInput, life({ principalAmount: 999_999_999_999.99 }))).toBe(true)
  })

  it('rejects fractions of a paisa rather than letting the database round them away', () => {
    expect(errorsOf(holdingInput, life({ periodicAmount: 100.555 }))).toEqual({
      periodicAmount: 'Use at most two decimal places.',
    })
    expect(accepts(holdingInput, life({ periodicAmount: 100.55 }))).toBe(true)
  })

  it('holds a mutual fund target goal to the same rules as every other amount', () => {
    expect(
      errorsOf(holdingInput, { ...base, category: 'mutual_fund', details: { target_goal: -5 } }),
    ).toEqual({ 'details.target_goal': 'Enter an amount of zero or more.' })
  })
})

describe('dates are real dates in a sensible range', () => {
  it('rejects a date that does not exist', () => {
    expect(errorsOf(holdingInput, life({ nextDueDate: '2027-02-31' }))).toEqual({
      nextDueDate: 'Enter a valid date.',
    })
  })

  it('rejects a year typed short, such as 0202 for 2020', () => {
    expect(errorsOf(holdingInput, life({ nextDueDate: '0202-03-15' }))).toEqual({
      nextDueDate: 'Enter a date between 1950 and 2100.',
    })
  })

  it('accepts a leap day and the edges of the range', () => {
    expect(accepts(holdingInput, life({ nextDueDate: '2028-02-29' }))).toBe(true)
    expect(accepts(holdingInput, life({ nextDueDate: '1950-01-01' }))).toBe(true)
    expect(accepts(holdingInput, life({ nextDueDate: '2100-12-31' }))).toBe(true)
  })
})

describe('free text is bounded (follow-up T3)', () => {
  it.each([
    ['family name', familyInput, { ...family, name: 'x'.repeat(121) }, 'name', 'Keep this under 120 characters.'],
    ['family notes', familyInput, { ...family, notes: 'x'.repeat(1001) }, 'notes', 'Keep this under 1000 characters.'],
    ['member name', memberInput, { ...member, name: 'x'.repeat(121) }, 'name', 'Keep this under 120 characters.'],
    ['holding name', holdingInput, life({ label: 'x'.repeat(201) }), 'label', 'Keep this under 200 characters.'],
    ['institution', holdingInput, life({ institution: 'x'.repeat(121) }), 'institution', 'Keep this under 120 characters.'],
    [
      'policy number',
      holdingInput,
      life({}, { policy_number: 'x'.repeat(51) }),
      'details.policy_number',
      'Keep this under 50 characters.',
    ],
  ])('rejects an over-long %s', (_name, schema, input, key, message) => {
    expect(errorsOf(schema as z.ZodType, input)).toEqual({ [key]: message })
  })

  it('accepts text at exactly the limit', () => {
    expect(accepts(familyInput, { ...family, name: 'x'.repeat(120) })).toBe(true)
  })
})

describe('family and reminder numbers', () => {
  it('explains a horizon that is not a number at all', () => {
    expect(errorsOf(familyInput, { ...family, goalHorizonYears: 'soon' })).toEqual({
      goalHorizonYears: 'Enter the horizon in years.',
    })
  })

  it('caps a reminder window at a year, which the int column and the sweep can both hold', () => {
    const result = reminderRuleInput.safeParse({ daysBefore: '30, 400', isActive: true })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(fromZodError(result.error)).toEqual({
      ok: false,
      fieldErrors: { daysBefore: 'A reminder can be at most 365 days before the due date.' },
    })
  })

  it('still accepts a same-day reminder and a full year', () => {
    expect(reminderRuleInput.safeParse({ daysBefore: '365, 0', isActive: true }).success).toBe(true)
  })
})
