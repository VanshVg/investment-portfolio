import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { getFamily, listHoldings, listMembers } from '@/lib/queries/families'
import { updateFamily } from '../actions'
import { FamilyHeader } from './_components/FamilyHeader'
import { MembersSection } from './_components/MembersSection'
import { LifeInsuranceSection } from './_components/LifeInsuranceSection'
import { GeneralInsuranceSection } from './_components/GeneralInsuranceSection'
import { createMember, deleteMember, updateMember } from './member-actions'
import { createHolding, deleteHolding, updateHolding } from './holding-actions'

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

  const holdingCountByMember: Record<string, number> = {}
  for (const holding of holdings) {
    if (holding.memberId) {
      holdingCountByMember[holding.memberId] = (holdingCountByMember[holding.memberId] ?? 0) + 1
    }
  }

  return (
    <div className="pt-7">
      <Link href="/families" className="text-[12.5px] text-ink-soft underline">
        ← All families
      </Link>

      <h1 className="mt-2 mb-4 font-serif text-[22px] font-semibold text-navy">{family.name}</h1>

      <FamilyHeader family={family} updateFamily={updateFamily} />

      <MembersSection
        familyId={familyId}
        members={members}
        holdingCountByMember={holdingCountByMember}
        createMember={createMember}
        updateMember={updateMember}
        deleteMember={deleteMember}
      />

      <LifeInsuranceSection
        familyId={familyId}
        members={members}
        holdings={byCategory.life_insurance}
        createHolding={createHolding}
        updateHolding={updateHolding}
        deleteHolding={deleteHolding}
      />

      <GeneralInsuranceSection
        familyId={familyId}
        members={members}
        holdings={byCategory.general_insurance}
        createHolding={createHolding}
        updateHolding={updateHolding}
        deleteHolding={deleteHolding}
      />

      {/* Remaining holding sections are mounted by Task 11. Counts keep the shell honest until then. */}
      <p className="mt-6 text-[12.5px] text-ink-soft">
        {holdings.length} financial record(s)
        {' · '}
        {byCategory.life_insurance.length} life, {byCategory.general_insurance.length} general,{' '}
        {byCategory.mutual_fund.length} mutual fund, {byCategory.fixed_income.length} fixed income
      </p>
    </div>
  )
}
