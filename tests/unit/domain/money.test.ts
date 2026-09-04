import { describe, expect, it } from 'vitest'
import { formatCompactINR, formatINR } from '@/lib/domain/money'

const norm = (s: string) => s.replace(/ /g, ' ')

describe('formatINR', () => {
  it('groups in lakhs and crores, not thousands', () => {
    expect(norm(formatINR(5_000_000))).toBe('₹50,00,000')
    expect(norm(formatINR(100_000))).toBe('₹1,00,000')
    expect(norm(formatINR(1_500))).toBe('₹1,500')
  })

  it('rounds to whole rupees', () => {
    expect(norm(formatINR(1234.56))).toBe('₹1,235')
  })

  it('treats null and undefined as zero', () => {
    expect(norm(formatINR(null))).toBe('₹0')
    expect(norm(formatINR(undefined))).toBe('₹0')
  })
})

describe('formatCompactINR', () => {
  it('abbreviates lakhs and crores', () => {
    expect(formatCompactINR(10_000_000)).toBe('₹1.00 Cr')
    expect(formatCompactINR(2_500_000)).toBe('₹25.00 L')
    expect(formatCompactINR(45_000)).toBe('₹45,000')
  })
})
