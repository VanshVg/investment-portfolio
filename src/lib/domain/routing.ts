export type ManagedBy = 'self' | 'external'
export type RecipientType = 'advisor' | 'client'

export interface Recipient {
  type: RecipientType
  mobile: string
}

export interface RoutingInput {
  managedBy: ManagedBy
  advisorMobile: string | null
  member: { mobile: string | null; whatsappConsent: boolean } | null
}

/**
 * Who receives the reminder for a holding.
 *
 * A holding managed by the advisor notifies both parties, provided the member
 * has opted in and has a number on file. A holding managed elsewhere notifies
 * the advisor only — deliberately, as a cross-sell trigger. Consent never
 * overrides that rule: the client is never messaged about a policy the advisor
 * does not manage.
 */
export function reminderRecipients({
  managedBy,
  advisorMobile,
  member,
}: RoutingInput): Recipient[] {
  const recipients: Recipient[] = []

  if (advisorMobile) {
    recipients.push({ type: 'advisor', mobile: advisorMobile })
  }

  const clientMayBeNotified =
    managedBy === 'self' && member !== null && member.whatsappConsent && Boolean(member.mobile)

  if (clientMayBeNotified) {
    recipients.push({ type: 'client', mobile: member!.mobile! })
  }

  return recipients
}
