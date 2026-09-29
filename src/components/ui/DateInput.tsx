'use client'

import 'react-day-picker/style.css'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DayPicker } from 'react-day-picker'
import {
  EARLIEST_YEAR,
  formatDMY,
  fromISODate,
  LATEST_YEAR,
  parseDMY,
  toISODate,
  todayInIndia,
} from '@/lib/domain/dates'
import { inputClass, type ControlSize } from './styles'

/** Roughly the calendar's rendered size, for placing it before it is measured. */
const POPOVER_WIDTH = 300
const POPOVER_HEIGHT = 360
const GAP = 6

/**
 * A DD-MM-YYYY text box with a calendar beside it.
 *
 * Typing stays the primary way in — fast entry is a stated requirement, and a
 * policy date copied off a document is quicker typed than clicked to. The
 * calendar is for finding a date by weekday or month. A native
 * `<input type="date">` is not used: it renders in the browser's locale,
 * which is not reliably Indian, and this app shows DD-MM-YYYY everywhere.
 *
 * The calendar is drawn in a portal on top of the page rather than inside
 * the field: every ledger table scrolls sideways, and a popup drawn inside a
 * scrolling container is clipped by it.
 *
 * Controlled on the text. The parent decides what a typed value means (and
 * when to parse it, e.g. on blur); `onPick` fires when a day is chosen.
 */
export function DateInput({
  id,
  name,
  text,
  onTextChange,
  onPick,
  onBlur,
  size = 'md',
  width = 'w-full',
  inputProps,
}: {
  id: string
  name?: string
  text: string
  onTextChange: (text: string) => void
  /** A day chosen from the calendar, as an ISO yyyy-mm-dd date. */
  onPick: (iso: string) => void
  onBlur?: () => void
  size?: ControlSize
  width?: string
  /** aria-invalid, aria-describedby and the like, passed to the text box. */
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number; above: boolean }>()
  const inputRef = useRef<HTMLInputElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const popoverId = useId()

  const selected = parseDMY(text) ?? undefined

  function openCalendar() {
    const rect = inputRef.current?.getBoundingClientRect()
    if (rect) {
      // Below the field unless there is no room there but there is above it.
      const above = rect.bottom + POPOVER_HEIGHT > window.innerHeight && rect.top > POPOVER_HEIGHT
      const left = Math.max(
        8,
        Math.min(rect.left + window.scrollX, window.scrollX + window.innerWidth - POPOVER_WIDTH - 8),
      )
      setPosition({
        top: (above ? rect.top - GAP : rect.bottom + GAP) + window.scrollY,
        left,
        above,
      })
    }
    setOpen(true)
  }

  function close({ refocus }: { refocus: boolean }) {
    setOpen(false)
    if (refocus) inputRef.current?.focus()
  }

  function pick(iso: string) {
    onTextChange(formatDMY(iso))
    onPick(iso)
    close({ refocus: true })
  }

  // Outside clicks and a resized window close the calendar. Listening only
  // while it is open keeps every closed field free of document listeners.
  useEffect(() => {
    if (!open) return
    function onMouseDown(event: MouseEvent) {
      const target = event.target as Node
      if (popoverRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      setOpen(false)
    }
    function onResize() {
      setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  const thisYear = new Date().getFullYear()

  return (
    <div className={`relative ${width}`}>
      <input
        ref={inputRef}
        id={id}
        name={name}
        value={text}
        placeholder="DD-MM-YYYY"
        autoComplete="off"
        onChange={(event) => onTextChange(event.target.value)}
        onBlur={onBlur}
        className={`${inputClass(size)} pr-9 font-mono`}
        {...inputProps}
      />
      <button
        ref={buttonRef}
        type="button"
        // Deliberately not "Choose due date": Playwright and Testing Library
        // match labels by substring, and a button named after the field
        // would make every getByLabel('Due date') match two elements.
        aria-label="Open calendar"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        onClick={() => (open ? close({ refocus: false }) : openCalendar())}
        // A ledger editor saves on Enter. Opening the calendar from the
        // keyboard must not also save the row it sits in.
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') event.stopPropagation()
        }}
        className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-ink-soft hover:bg-paper hover:text-navy"
      >
        <svg
          aria-hidden
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      </button>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            id={popoverId}
            role="dialog"
            aria-label="Choose a date"
            // Portals still bubble React events to the field's ancestors, so
            // without this, Enter on a day would save the row being edited
            // and Escape would discard it. Keys stay inside the calendar.
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === 'Escape') {
                event.preventDefault()
                close({ refocus: true })
              }
            }}
            style={{
              position: 'absolute',
              top: position?.top ?? 0,
              left: position?.left ?? 0,
              transform: position?.above ? 'translateY(-100%)' : undefined,
            }}
            className="date-popover z-50 rounded-md border border-line bg-paper-raised p-3 shadow-lg"
          >
            <DayPicker
              mode="single"
              selected={selected}
              defaultMonth={selected ?? fromISODate(todayInIndia()) ?? undefined}
              onSelect={(date) => {
                if (date) pick(toISODate(date))
              }}
              weekStartsOn={1}
              captionLayout="dropdown"
              // The same range the typed-date check and the server allow.
              startMonth={new Date(EARLIEST_YEAR, 0)}
              endMonth={new Date(Math.min(thisYear + 40, LATEST_YEAR), 11)}
              autoFocus
              footer={
                <div className="mt-2 flex justify-end border-t border-line pt-2">
                  <button
                    type="button"
                    onClick={() => pick(todayInIndia())}
                    className="rounded px-2 py-1 text-[12px] font-medium text-navy hover:bg-paper"
                  >
                    Today
                  </button>
                </div>
              }
            />
          </div>,
          document.body,
        )}
    </div>
  )
}
