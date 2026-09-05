import Link from 'next/link'

export default function FamilyNotFound() {
  return (
    <div className="pt-10">
      <h1 className="font-serif text-[20px] font-semibold text-navy">Family not found</h1>
      <p className="mt-1 text-[12.5px] text-ink-soft">
        It may have been deleted, or the link may be wrong.
      </p>
      <Link href="/families" className="mt-3 inline-block text-[12.5px] text-navy underline">
        Back to all families
      </Link>
    </div>
  )
}
