const RUPEES = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

/** Full rupee amount with Indian digit grouping, e.g. ₹50,00,000. */
export function formatINR(value: number | null | undefined): string {
  return RUPEES.format(Math.round(value ?? 0))
}
