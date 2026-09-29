import { notFound } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/PageHeader'
import { getFamily, listHoldings, listMembers } from '@/lib/queries/families'
import { updateFamily } from '../actions'
import { FamilyHeader } from './_components/FamilyHeader'
import { SectionNav } from './_components/SectionNav'
import { MembersSection } from './_components/MembersSection'
import { LifeInsuranceSection } from './_components/LifeInsuranceSection'
import { GeneralInsuranceSection } from './_components/GeneralInsuranceSection'
import { MutualFundSection } from './_components/MutualFundSection'
import { FixedIncomeSection } from './_components/FixedIncomeSection'
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

  const [everyone, holdings] = await Promise.all([
    // Removed members too: holdings stay attributed to a removed member
    // (decision D2) and still need their name. The members table and every
    // member picker show only current members.
    listMembers(supabase, familyId, { includeRemoved: true }),
    listHoldings(supabase, familyId),
  ])
  const members = everyone.filter((member) => !member.removed)

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
    <div>
      <PageHeader
        title={family.name}
        back={{ href: '/families', label: 'All families' }}
        description={`${members.length} ${members.length === 1 ? 'member' : 'members'} · ${holdings.length} financial ${holdings.length === 1 ? 'record' : 'records'}`}
      />

      <FamilyHeader family={family} updateFamily={updateFamily} />

      <SectionNav
        counts={{
          members: members.length,
          life: byCategory.life_insurance.length,
          general: byCategory.general_insurance.length,
          mutual: byCategory.mutual_fund.length,
          fixed: byCategory.fixed_income.length,
        }}
      />

      <div id="members" className="scroll-mt-16">
        <MembersSection
          familyId={familyId}
          members={members}
          holdingCountByMember={holdingCountByMember}
          createMember={createMember}
          updateMember={updateMember}
          deleteMember={deleteMember}
        />
      </div>

      <div id="life" className="scroll-mt-16">
        <LifeInsuranceSection
          familyId={familyId}
          members={everyone}
          holdings={byCategory.life_insurance}
          createHolding={createHolding}
          updateHolding={updateHolding}
          deleteHolding={deleteHolding}
        />
      </div>

      <div id="general" className="scroll-mt-16">
        <GeneralInsuranceSection
          familyId={familyId}
          members={everyone}
          holdings={byCategory.general_insurance}
          createHolding={createHolding}
          updateHolding={updateHolding}
          deleteHolding={deleteHolding}
        />
      </div>

      <div id="mutual" className="scroll-mt-16">
        <MutualFundSection
          familyId={familyId}
          members={everyone}
          holdings={byCategory.mutual_fund}
          createHolding={createHolding}
          updateHolding={updateHolding}
          deleteHolding={deleteHolding}
        />
      </div>

      <div id="fixed" className="scroll-mt-16">
        <FixedIncomeSection
          familyId={familyId}
          members={everyone}
          holdings={byCategory.fixed_income}
          createHolding={createHolding}
          updateHolding={updateHolding}
          deleteHolding={deleteHolding}
        />
      </div>

    </div>
  )
}
