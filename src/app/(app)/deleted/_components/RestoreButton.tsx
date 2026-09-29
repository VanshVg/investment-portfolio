'use client'

import { useState, useTransition } from 'react'
import type { ActionResult } from '@/lib/actions/result'
import { buttonClass } from '@/components/ui/styles'

/**
 * One row's Restore. On success the page re-renders without the row (the
 * action revalidates /deleted); on failure the message stays by the button.
 * Named for its record, for the same reason every row action is: a column of
 * identical "Restore" buttons is useless to a screen reader.
 */
export function RestoreButton({
  label,
  restore,
}: {
  label: string
  restore: () => Promise<ActionResult>
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        aria-label={`Restore ${label}`}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const result = await restore()
            if (!result.ok) setError(result.formError ?? 'Could not restore.')
          })
        }
        className={buttonClass('secondary', 'xs')}
      >
        {pending ? 'Restoring…' : 'Restore'}
      </button>
      {error && (
        <p role="alert" className="w-[220px] whitespace-normal text-right text-[11px] text-rust">
          {error}
        </p>
      )}
    </div>
  )
}
