export interface GoalGapInput {
  /** Combined current value of the family's mutual fund holdings. */
  currentValue: number
  /** Combined monthly SIP already running. */
  currentMonthlySip: number
  /** Combined target corpus. */
  targetGoal: number
  horizonYears: number
  assumedCagr: number
}

export interface GoalGapResult {
  futureValueOfCurrent: number
  requiredSip: number
  shortfall: number
  onTrack: boolean
}

/**
 * Projects the existing corpus forward, then solves for the monthly SIP that
 * closes whatever remains. Uses an annuity-due factor: contributions are made
 * at the start of each month, which is how an SIP mandate actually runs.
 */
export function computeGoalGap({
  currentValue,
  currentMonthlySip,
  targetGoal,
  horizonYears,
  assumedCagr,
}: GoalGapInput): GoalGapResult {
  const monthlyRate = assumedCagr / 100 / 12
  const months = horizonYears * 12

  const futureValueOfCurrent = currentValue * Math.pow(1 + monthlyRate, months)
  const remaining = Math.max(targetGoal - futureValueOfCurrent, 0)

  const annuityFactor =
    monthlyRate === 0
      ? months
      : ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate) * (1 + monthlyRate)

  const requiredSip = remaining > 0 && annuityFactor > 0 ? remaining / annuityFactor : 0
  const shortfall = Math.max(requiredSip - currentMonthlySip, 0)

  return {
    futureValueOfCurrent,
    requiredSip,
    shortfall,
    // A rupee of rounding noise should not read as "behind target".
    onTrack: shortfall <= 1,
  }
}
