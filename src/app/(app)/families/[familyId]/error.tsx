'use client'

import Link from 'next/link'
import { buttonClass, PAGE_LEAD, PAGE_TITLE } from '@/components/ui/styles'

export default function FamilyError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="pt-10">
      <h1 className={`${PAGE_TITLE} !text-rust`}>Something went wrong</h1>
      <p className={PAGE_LEAD}>This household could not be loaded. No data has been changed.</p>
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={reset} className={buttonClass('primary', 'sm')}>
          Try again
        </button>
        <Link href="/families" className={buttonClass('secondary', 'sm')}>
          Back to all families
        </Link>
      </div>
    </div>
  )
}
