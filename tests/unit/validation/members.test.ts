import { describe, expect, it } from 'vitest'
import { memberInput } from '@/lib/validation/members'

const base = { name: 'Rakesh Patel', relation: 'self' as const, mobile: '', whatsappConsent: false }

describe('memberInput', () => {
  it('accepts a member with no mobile and no consent', () => {
    const parsed = memberInput.parse(base)
    expect(parsed.mobile).toBeNull()
    expect(parsed.whatsappConsent).toBe(false)
  })

  it('requires a name', () => {
    expect(memberInput.safeParse({ ...base, name: '   ' }).success).toBe(false)
  })

  it('refuses consent without a mobile number, mirroring the database check', () => {
    const result = memberInput.safeParse({ ...base, whatsappConsent: true })
    expect(result.success).toBe(false)
    const issue = result.error!.issues.find((i) => i.path[0] === 'whatsappConsent')
    expect(issue).toBeDefined()
  })

  it('accepts consent when a mobile number is present', () => {
    const parsed = memberInput.parse({ ...base, mobile: '9876543210', whatsappConsent: true })
    expect(parsed.mobile).toBe('+919876543210')
    expect(parsed.whatsappConsent).toBe(true)
  })
})
