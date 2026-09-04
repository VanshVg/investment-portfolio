const RUPEES = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

const LAKH = 100_000
const CRORE = 10_000_000

/** Full rupee amount with Indian digit grouping, e.g. ₹50,00,000. */
export function formatINR(value: number | null | undefined): string {
  return RUPEES.format(Math.round(value ?? 0))
}

/** Abbreviated amount for dense tables, e.g. ₹1.00 Cr. */
export function formatCompactINR(value: number | null | undefined): string {
  const amount = Math.round(value ?? 0)
  const magnitude = Math.abs(amount)
  if (magnitude >= CRORE) return `₹${(amount / CRORE).toFixed(2)} Cr`
  if (magnitude >= LAKH) return `₹${(amount / LAKH).toFixed(2)} L`
  return formatINR(amount)
}
