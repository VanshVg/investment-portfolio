/**
 * What a due instance records as owed, from the holding that produced it.
 *
 * Insurance and mutual funds are due their premium or instalment. A fixed
 * deposit or bond has no premium — on its due date it matures — so for fixed
 * income the renewals page shows the maturity amount the advisor entered,
 * falling back to the amount invested (decision D4). Before this, a fixed
 * income maturity always showed no amount at all, because only the premium
 * column was ever read.
 *
 * Pure, and the single place this rule lives: generation and the refresh of
 * pristine future instances both call it, so the two cannot disagree.
 */
export function amountDueFor(holding: {
  category: string
  periodic_amount: number | string | null
  principal_amount: number | string | null
  details: unknown
}): number | null {
  if (holding.category === 'fixed_income') {
    const details = (holding.details ?? {}) as Record<string, unknown>
    const maturity = details.maturity_amount
    if (typeof maturity === 'number') return maturity
    return toNumber(holding.principal_amount)
  }
  return toNumber(holding.periodic_amount)
}

/** numeric columns reach the client as strings; null stays null. */
function toNumber(value: number | string | null): number | null {
  if (value === null) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}
