'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { formatDateTimeIST } from '@/lib/domain/dates'
import type { ActionResult } from '@/lib/actions/result'
import type { ReplyRow } from '@/lib/queries/messages'
import {
  buttonClass,
  FULL_ROW,
  TABLE,
  TABLE_HEAD_ROW,
  TABLE_WRAP,
  TD,
  TH,
} from '@/components/ui/styles'

/**
 * What clients wrote back. The advisor answers from their own phone; here
 * they see it arrived, who it is from, and tick it off once dealt with.
 */
export function ReplyList({
  replies,
  markReplyHandled,
}: {
  replies: ReplyRow[]
  markReplyHandled: (id: string) => Promise<ActionResult>
}) {
  const [handled, setHandled] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function mark(id: string) {
    setError(null)
    startTransition(async () => {
      const result = await markReplyHandled(id)
      if (!result.ok) {
        setError(result.formError ?? 'Could not mark the reply handled.')
        return
      }
      setHandled((current) => new Set(current).add(id))
    })
  }

  return (
    <>
      <div className={`mt-3 ${TABLE_WRAP}`}>
        <table className={TABLE}>
          <thead>
            <tr className={TABLE_HEAD_ROW}>
              <th className={TH}>Received</th>
              <th className={TH}>From</th>
              <th className={TH}>Message</th>
              <th className={TH}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {replies.length === 0 && (
              <tr>
                <td colSpan={4} className="p-0">
                  <p className={`${FULL_ROW} px-3 py-8 text-center text-ink-soft`}>
                    No replies yet.
                  </p>
                </td>
              </tr>
            )}
            {replies.map((reply) => {
              const done = reply.handled || handled.has(reply.id)
              const who = reply.senders.map((sender) => sender.name).join(', ') || reply.from
              return (
                <tr
                  key={reply.id}
                  className={`border-b border-line last:border-0 ${done ? 'text-ink-soft' : ''}`}
                >
                  <td className={`${TD} whitespace-nowrap font-mono text-[12px]`}>
                    {formatDateTimeIST(reply.receivedAt)}
                  </td>
                  <td className={TD}>
                    {reply.senders.length === 0 ? (
                      <span className="font-mono">{reply.from}</span>
                    ) : (
                      reply.senders.map((sender) => (
                        <span key={`${sender.familyId}-${sender.name}`} className="block">
                          <span>{sender.name}</span>
                          <Link
                            href={`/families/${sender.familyId}`}
                            className="block text-[11.5px] text-navy hover:underline"
                          >
                            {sender.familyName}
                          </Link>
                        </span>
                      ))
                    )}
                  </td>
                  <td className={TD}>
                    {reply.body}
                    {reply.optOut && (
                      <span className="mt-0.5 block text-[11.5px] text-rust">
                        Opted out of WhatsApp reminders automatically.
                      </span>
                    )}
                  </td>
                  <td className={`${TD} whitespace-nowrap text-right`}>
                    {done ? (
                      <span className="text-[12px]">Handled</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => mark(reply.id)}
                        disabled={pending}
                        aria-label={`Mark handled: ${who}`}
                        className={buttonClass('secondary', 'xs')}
                      >
                        Mark handled
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[12.5px] text-rust">
          {error}
        </p>
      )}
    </>
  )
}
