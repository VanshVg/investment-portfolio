import { describe, expect, it } from 'vitest'
import { reminderRecipients } from '@/lib/domain/routing'

const ADVISOR = '+919000000001'
const CLIENT = '+919876543210'

const consenting = { mobile: CLIENT, whatsappConsent: true }
const nonConsenting = { mobile: CLIENT, whatsappConsent: false }

describe('reminderRecipients', () => {
  it('notifies advisor and client for a policy managed by the advisor', () => {
    expect(
      reminderRecipients({ managedBy: 'self', advisorMobile: ADVISOR, member: consenting }),
    ).toEqual([
      { type: 'advisor', mobile: ADVISOR },
      { type: 'client', mobile: CLIENT },
    ])
  })

  it('notifies only the advisor when the client has not opted in', () => {
    expect(
      reminderRecipients({ managedBy: 'self', advisorMobile: ADVISOR, member: nonConsenting }),
    ).toEqual([{ type: 'advisor', mobile: ADVISOR }])
  })

  it('never notifies the client about an externally managed policy', () => {
    // Deliberate: an external holding is a cross-sell trigger for the advisor.
    // Consent does not override this.
    expect(
      reminderRecipients({ managedBy: 'external', advisorMobile: ADVISOR, member: consenting }),
    ).toEqual([{ type: 'advisor', mobile: ADVISOR }])

    expect(
      reminderRecipients({ managedBy: 'external', advisorMobile: ADVISOR, member: nonConsenting }),
    ).toEqual([{ type: 'advisor', mobile: ADVISOR }])
  })

  it('notifies only the advisor for a family-level holding with no member', () => {
    expect(
      reminderRecipients({ managedBy: 'self', advisorMobile: ADVISOR, member: null }),
    ).toEqual([{ type: 'advisor', mobile: ADVISOR }])
  })

  it('skips a consenting client with no number on file', () => {
    expect(
      reminderRecipients({
        managedBy: 'self',
        advisorMobile: ADVISOR,
        member: { mobile: null, whatsappConsent: true },
      }),
    ).toEqual([{ type: 'advisor', mobile: ADVISOR }])
  })

  it('returns nobody when the advisor has no number configured', () => {
    expect(
      reminderRecipients({ managedBy: 'external', advisorMobile: null, member: consenting }),
    ).toEqual([])
  })
})
