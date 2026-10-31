'use client'

import { useState, useTransition } from 'react'
import type { ActionResult } from '@/lib/actions/result'
import type { WhatsAppMode } from '@/lib/whatsapp/settings'
import { buttonClass, CARD, SECTION_LEAD, SECTION_TITLE } from '@/components/ui/styles'

const MODES: { value: WhatsAppMode; label: string; description: string }[] = [
  { value: 'off', label: 'Off', description: 'Nothing is sent.' },
  {
    value: 'test',
    label: 'Test',
    description:
      'Every message, clients’ included, goes to your number instead. Reminders stay queued.',
  },
  { value: 'live', label: 'Live', description: 'Clients receive their reminders.' },
]

const LIVE_CONFIRMATION =
  'Clients will start receiving WhatsApp reminders from the next morning run. Continue?'

/**
 * Whether WhatsApp is connected, which mode it is in, and a way to prove the
 * connection works. Off is always available, so sending can be stopped at
 * once; the Meta keys themselves live only in Vercel, never here.
 */
export function WhatsAppSection({
  connected,
  numberHint,
  mode,
  advisorHasMobile,
  setWhatsAppMode,
  sendTestMessage,
}: {
  connected: boolean
  /** The last digits of the sending number's id, to recognise it by. */
  numberHint: string | null
  mode: WhatsAppMode
  advisorHasMobile: boolean
  setWhatsAppMode: (mode: unknown) => Promise<ActionResult>
  sendTestMessage: () => Promise<ActionResult>
}) {
  const [current, setCurrent] = useState(mode)
  const [message, setMessage] = useState<{ kind: 'status' | 'alert'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function choose(next: WhatsAppMode) {
    if (next === current) return
    if (next === 'live' && !window.confirm(LIVE_CONFIRMATION)) return
    setMessage(null)
    startTransition(async () => {
      const result = await setWhatsAppMode(next)
      if (!result.ok) {
        setMessage({ kind: 'alert', text: result.formError ?? 'Could not change the mode.' })
        return
      }
      setCurrent(next)
      setMessage({ kind: 'status', text: 'Saved.' })
    })
  }

  function test() {
    setMessage(null)
    startTransition(async () => {
      const result = await sendTestMessage()
      setMessage(
        result.ok
          ? { kind: 'status', text: 'Test message sent. Check WhatsApp on your phone.' }
          : { kind: 'alert', text: result.formError ?? 'The test message was not sent.' },
      )
    })
  }

  return (
    <section className={`mt-10 ${CARD} px-5 py-4`}>
      <h2 className={SECTION_TITLE}>WhatsApp</h2>
      <p className={SECTION_LEAD}>
        {connected ? (
          <>Connected{numberHint && <> (number id …{numberHint})</>}.</>
        ) : (
          <>
            Not connected. Add the Meta keys in Vercel to switch WhatsApp on; until then nothing
            is sent.
          </>
        )}
      </p>

      <fieldset className="mt-3" disabled={!connected || pending}>
        <legend className="sr-only">WhatsApp mode</legend>
        <div className="flex flex-col gap-2">
          {MODES.map((option) => {
            const needsMobile = option.value === 'test' && !advisorHasMobile
            return (
              <label key={option.value} className="flex items-start gap-2 text-[13px] text-ink">
                <input
                  type="radio"
                  name="whatsapp-mode"
                  value={option.value}
                  checked={current === option.value}
                  disabled={needsMobile}
                  onChange={() => choose(option.value)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">{option.label}</span>
                  <span className="text-ink-soft"> — {option.description}</span>
                  {needsMobile && (
                    <span className="block text-[12px] text-gold">
                      Test mode needs your mobile number above.
                    </span>
                  )}
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={test}
          disabled={!connected || !advisorHasMobile || pending}
          className={buttonClass('secondary', 'sm')}
        >
          Send me a test message
        </button>
        {message?.kind === 'status' && (
          <span role="status" className="text-[12px] text-teal">
            {message.text}
          </span>
        )}
      </div>
      {message?.kind === 'alert' && (
        <p role="alert" className="mt-2 text-[12.5px] text-rust">
          {message.text}
        </p>
      )}
    </section>
  )
}
