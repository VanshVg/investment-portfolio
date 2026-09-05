import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { getFamily, listHoldings, listMembers } from '@/lib/queries/families'
import { updateFamily } from '../actions'
import { FamilyHeader } from './_components/FamilyHeader'

export default async function FamilyWorkspacePage({
  params,
}: {
  params: Promise<{ familyId: string }>
}) {
  const { familyId } = await params
  const supabase = await createServerSupabase()

  const family = await getFamily(supabase, familyId)
  if (!family) notFound()

  const [members, holdings] = await Promise.all([
    listMembers(supabase, familyId),
    listHoldings(supabase, familyId),
  ])

  // Grouped here rather than in four queries: one round trip renders the page.
  const byCategory = {
    life_insurance: holdings.filter((h) => h.category === 'life_insurance'),
    general_insurance: holdings.filter((h) => h.category === 'general_insurance'),
    mutual_fund: holdings.filter((h) => h.category === 'mutual_fund'),
    fixed_income: holdings.filter((h) => h.category === 'fixed_income'),
  }

  return (
    <div className="pt-7">
      <Link href="/families" className="text-[12.5px] text-ink-soft underline">
        ← All families
      </Link>

      <h1 className="mt-2 mb-4 font-serif text-[22px] font-semibold text-navy">{family.name}</h1>

      <FamilyHeader family={family} updateFamily={updateFamily} />

      {/* Sections are mounted by Tasks 8-11. Counts keep the shell honest until then. */}
      <p className="mt-6 text-[12.5px] text-ink-soft">
        {members.length} member(s) · {holdings.length} financial record(s)
        {' · '}
        {byCategory.life_insurance.length} life, {byCategory.general_insurance.length} general,{' '}
        {byCategory.mutual_fund.length} mutual fund, {byCategory.fixed_income.length} fixed income
      </p>
    </div>
  )
}
