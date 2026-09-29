'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { inputClass } from '@/components/ui/styles'

/** Long enough that a name typed at speed sends one search, not one per key. */
export const SEARCH_DEBOUNCE_MS = 300

/**
 * Searches as the advisor types, once they pause.
 *
 * The search still lives in the URL (`?q=`), exactly as it did when this was
 * a plain GET form, so a reload or a shared link keeps it and the server page
 * does the filtering. `replace` rather than `push`: a search typed a letter
 * at a time is one thing the advisor did, not six pages to step back through.
 * Enter still searches at once, for anyone who reaches for it.
 */
export function FamilySearch({ search }: { search?: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const current = search ?? ''

  const [value, setValue] = useState(current)
  // The query this box last sent. It tells a search the box asked for apart
  // from one that arrived from elsewhere (the Clear search link, Back).
  const [sent, setSent] = useState(current)
  const [synced, setSynced] = useState(current)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const inputRef = useRef<HTMLInputElement>(null)

  // Render-time sync with the URL, the same pattern DateField uses, so no
  // effect sets state. Only a search this box did not send replaces what is
  // in it: results for "Pa" landing while the advisor has typed on to "Pate"
  // must not snap the text back.
  if (current !== synced) {
    setSynced(current)
    if (current !== sent) {
      setValue(current)
      setSent(current)
    }
  }

  useEffect(() => () => clearTimeout(timer.current), [])

  function go(raw: string) {
    clearTimeout(timer.current)
    const q = raw.trim()
    // Nothing to do when only surrounding spaces changed.
    if (q === sent) return
    setSent(q)
    startTransition(() => {
      router.replace(q ? `/families?${new URLSearchParams({ q })}` : '/families')
    })
  }

  function clear() {
    setValue('')
    go('')
    // Back in the box, ready for the next search, rather than on a button
    // that has just disappeared.
    inputRef.current?.focus()
  }

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault()
        go(value)
      }}
      className="relative w-full max-w-sm"
    >
      <label htmlFor="q" className="sr-only">
        Search families
      </label>
      {/* The icon slot on the left doubles as the progress indicator, so
          "searching" needs no room of its own inside the box. */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-soft"
      >
        {pending ? (
          <span className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line-strong border-t-navy" />
        ) : (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="block"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        )}
      </span>
      <input
        ref={inputRef}
        id="q"
        name="q"
        type="search"
        autoComplete="off"
        value={value}
        onChange={(event) => {
          const next = event.target.value
          setValue(next)
          clearTimeout(timer.current)
          timer.current = setTimeout(() => go(next), SEARCH_DEBOUNCE_MS)
        }}
        onKeyDown={(event) => {
          // Esc clears, as the browser's own clear button did.
          if (event.key === 'Escape' && value) {
            event.preventDefault()
            clear()
          }
        }}
        placeholder="Search by family, head of family, or mobile"
        aria-busy={pending}
        className={`${inputClass()} pl-8 pr-8`}
      />
      {/* Our own clear button instead of the browser's: the native one sits
          wherever the input's padding leaves it and looks different in every
          browser. This one sits flush with the right edge and only appears
          when there is something to clear. */}
      {value && (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear search text"
          className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-ink-soft hover:bg-paper hover:text-navy"
        >
          <svg
            aria-hidden
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      )}
    </form>
  )
}
