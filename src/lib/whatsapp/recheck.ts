export type SkipReason =
  | 'deleted'
  | 'reminders_off'
  | 'resolved'
  | 'expired'
  | 'managed_elsewhere'
  | 'member_removed'
  | 'no_consent'
  | 'no_mobile'
  | 'superseded'

/** One queued reminder, with everything about it as it stands now, not when it was queued. */
export interface RowState {
  recipientType: 'advisor' | 'client'
  recipientMobile: string
  dueDate: string
  paymentStatus: string
  offSchedule: boolean
  holdingDeleted: boolean
  familyDeleted: boolean
  remindersEnabled: boolean
  managedBy: 'self' | 'external'
  nextDueDate: string | null
  member: { deleted: boolean; consent: boolean; mobile: string | null } | null
  advisorMobile: string | null
}

export type Recheck = { action: 'send'; mobile: string } | { action: 'skip'; reason: SkipReason }

/**
 * Whether a queued reminder may still be sent (T7). The sweep decided once,
 * when it queued the row; any amount of time may have passed since, and a
 * client who withdrew consent in between must not be messaged on the
 * strength of a decision made before they did.
 *
 * The same conditions as the sweep's, applied to current data. A consented
 * client whose number changed is sent to the new number: consent survives a
 * number change (decision D3).
 */
export function recheck(row: RowState, today: string): Recheck {
  if (row.holdingDeleted || row.familyDeleted) return skip('deleted')
  if (!row.remindersEnabled) return skip('reminders_off')
  // Mirrors the sweep: a date the holding has already been renewed past is
  // not an open due date, whatever its tick says. Equality still sends.
  const renewedPast = row.nextDueDate !== null && row.dueDate < row.nextDueDate
  if (row.paymentStatus === 'paid' || row.offSchedule || renewedPast) return skip('resolved')
  if (row.dueDate < today) return skip('expired')

  if (row.recipientType === 'advisor') {
    return row.advisorMobile ? send(row.advisorMobile) : skip('no_mobile')
  }

  // The client is never told about a policy the advisor does not manage.
  if (row.managedBy !== 'self') return skip('managed_elsewhere')
  if (!row.member || row.member.deleted) return skip('member_removed')
  if (!row.member.consent) return skip('no_consent')
  if (!row.member.mobile) return skip('no_mobile')
  return send(row.member.mobile)
}

function send(mobile: string): Recheck {
  return { action: 'send', mobile }
}

function skip(reason: SkipReason): Recheck {
  return { action: 'skip', reason }
}
