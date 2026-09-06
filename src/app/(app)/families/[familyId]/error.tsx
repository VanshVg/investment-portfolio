'use client'

export default function FamilyError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="pt-10">
      <h1 className="font-serif text-[20px] font-semibold text-rust">Something went wrong</h1>
      <p className="mt-1 text-[12.5px] text-ink-soft">
        This household could not be loaded. No data has been changed.
      </p>
      <button type="button" onClick={reset} className="mt-3 text-[12.5px] text-navy underline">
        Try again
      </button>
    </div>
  )
}
