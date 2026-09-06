import { describe, expect, it } from 'vitest'
import { normaliseIndianMobile, optionalIndianMobile } from '@/lib/validation/contact'

describe('normaliseIndianMobile', () => {
  it.each([
    ['9876543210', '+919876543210'],
    ['09876543210', '+919876543210'],
    ['+91 98765 43210', '+919876543210'],
    ['+91-9876-543-210', '+919876543210'],
    ['919876543210', '+919876543210'],
  ])('normalises %s to %s', (input, expected) => {
    expect(normaliseIndianMobile(input)).toBe(expected)
  })

  it.each([
    ['12345', 'too short'],
    ['98765432101234', 'too long'],
    ['1234567890', 'Indian mobiles start 6-9'],
    ['5876543210', 'Indian mobiles start 6-9'],
    ['', 'empty'],
  ])('rejects %s (%s)', (input) => {
    expect(normaliseIndianMobile(input)).toBeNull()
  })
})

describe('optionalIndianMobile', () => {
  it('treats an empty string as absent rather than invalid', () => {
    expect(optionalIndianMobile.parse('')).toBeNull()
    expect(optionalIndianMobile.parse('   ')).toBeNull()
  })

  it('normalises a valid number', () => {
    expect(optionalIndianMobile.parse('98765 43210')).toBe('+919876543210')
  })

  it('rejects a malformed number', () => {
    expect(optionalIndianMobile.safeParse('123').success).toBe(false)
  })
})
