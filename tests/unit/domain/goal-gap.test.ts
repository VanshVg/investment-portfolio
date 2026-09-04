import { describe, expect, it } from 'vitest'
import { computeGoalGap } from '@/lib/domain/goal-gap'

describe('computeGoalGap', () => {
  it('reports no shortfall when the current SIP already covers the target', () => {
    const result = computeGoalGap({
      currentValue: 10_000_000,
      currentMonthlySip: 50_000,
      targetGoal: 5_000_000,
      horizonYears: 8,
      assumedCagr: 12,
    })
    expect(result.requiredSip).toBe(0)
    expect(result.shortfall).toBe(0)
    expect(result.onTrack).toBe(true)
  })

  it('computes the monthly shortfall for an underfunded goal', () => {
    const result = computeGoalGap({
      currentValue: 0,
      currentMonthlySip: 0,
      targetGoal: 1_000_000,
      horizonYears: 10,
      assumedCagr: 12,
    })
    // Annuity-due factor at 1% monthly over 120 months is ~232.34.
    expect(result.requiredSip).toBeGreaterThan(4_200)
    expect(result.requiredSip).toBeLessThan(4_400)
    expect(result.shortfall).toBe(result.requiredSip)
    expect(result.onTrack).toBe(false)
  })

  it('subtracts the existing SIP from the requirement', () => {
    const base = computeGoalGap({
      currentValue: 0,
      currentMonthlySip: 0,
      targetGoal: 1_000_000,
      horizonYears: 10,
      assumedCagr: 12,
    })
    const withSip = computeGoalGap({
      currentValue: 0,
      currentMonthlySip: 2_000,
      targetGoal: 1_000_000,
      horizonYears: 10,
      assumedCagr: 12,
    })
    expect(withSip.shortfall).toBeCloseTo(base.requiredSip - 2_000, 2)
  })

  it('never reports a negative shortfall', () => {
    const result = computeGoalGap({
      currentValue: 0,
      currentMonthlySip: 100_000,
      targetGoal: 1_000_000,
      horizonYears: 10,
      assumedCagr: 12,
    })
    expect(result.shortfall).toBe(0)
  })
})
