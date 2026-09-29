import Link from 'next/link'
import { buttonClass, PAGE_LEAD, PAGE_TITLE } from '@/components/ui/styles'

export default function FamilyNotFound() {
  return (
    <div className="pt-10">
      <h1 className={PAGE_TITLE}>Family not found</h1>
      <p className={PAGE_LEAD}>It may have been deleted, or the link may be wrong.</p>
      <Link href="/families" className={`mt-4 ${buttonClass('secondary', 'sm')}`}>
        ← Back to all families
      </Link>
    </div>
  )
}
