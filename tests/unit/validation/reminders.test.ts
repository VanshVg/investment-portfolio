import { describe, expect, it } from 'vitest'
import { advisorMobileInput, reminderRuleInput } from '@/lib/validation/reminders'

describe('reminderRuleInput', () => {
  it('accepts a comma-separated list of windows', () => {
    expect(reminderRuleInput.parse({ daysBefore: '30, 15', isActive: true })).toEqual({
      daysBefore: [30, 15],
      isActive: true,
    })
  })

  it('sorts widest first, so the display order matches the firing order', () => {
    expect(reminderRuleInput.parse({ daysBefore: '15,30', isActive: true }).daysBefore).toEqual([
      30, 15,
    ])
  })

  it('removes duplicates', () => {
    expect(reminderRuleInput.parse({ daysBefore: '30,30', isActive: true }).daysBefore).toEqual([
      30,
    ])
  })

  it('requires at least one window, matching the check constraint', () => {
    expect(() => reminderRuleInput.parse({ daysBefore: '', isActive: true })).toThrow()
  })

  it('rejects a negative window, matching the check constraint', () => {
    expect(() => reminderRuleInput.parse({ daysBefore: '-1', isActive: true })).toThrow()
  })

  it('rejects anything that is not a whole number of days', () => {
    expect(() => reminderRuleInput.parse({ daysBefore: '7.5', isActive: true })).toThrow()
    expect(() => reminderRuleInput.parse({ daysBefore: 'soon', isActive: true })).toThrow()
  })

  it('accepts 0 — "remind on the due date itself" is a legal window', () => {
    expect(reminderRuleInput.parse({ daysBefore: '0', isActive: true }).daysBefore).toEqual([0])
  })

  it('carries isActive through unchanged', () => {
    expect(reminderRuleInput.parse({ daysBefore: '30', isActive: false }).isActive).toBe(false)
  })

  it('attributes a bad window to the daysBefore field, so the UI has somewhere to show it', () => {
    const result = reminderRuleInput.safeParse({ daysBefore: '', isActive: true })
    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error.issues[0]?.path).toEqual(['daysBefore'])
  })
})

describe('advisorMobileInput', () => {
  it('normalises a valid Indian mobile number', () => {
    expect(advisorMobileInput.parse({ mobile: '98765 43210' })).toEqual({
      mobile: '+919876543210',
    })
  })

  it('treats a blank mobile as absent rather than invalid', () => {
    expect(advisorMobileInput.parse({ mobile: '' })).toEqual({ mobile: null })
  })

  it('rejects a malformed number, attributed to the mobile field', () => {
    const result = advisorMobileInput.safeParse({ mobile: '123' })
    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error.issues[0]?.path).toEqual(['mobile'])
  })
})
