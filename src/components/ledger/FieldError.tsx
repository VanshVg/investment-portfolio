'use client'

/**
 * The `${id}-error` id convention lives here and nowhere else, so every field
 * — the shared primitives and the raw inputs a section renders directly —
 * associates its error the same way.
 */
export function fieldErrorProps(id: string, error?: string) {
  return {
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : undefined,
  } as const
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <span role="alert" id={`${id}-error`} className="text-[11px] text-rust">
      {message}
    </span>
  )
}
