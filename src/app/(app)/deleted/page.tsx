import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase/server'
import { listDeleted } from '@/lib/queries/deleted'
import { formatDMY, todayInIndia } from '@/lib/domain/dates'
import { PageHeader } from '@/components/ui/PageHeader'
import {
  FULL_ROW,
  SECTION_LEAD,
  SECTION_TITLE,
  TABLE,
  TABLE_HEAD_ROW,
  TABLE_WRAP,
  TD,
  TH,
} from '@/components/ui/styles'
import { RestoreButton } from './_components/RestoreButton'
import { restoreFamily, restoreHolding, restoreMember } from './actions'

const CATEGORY_LABELS: Record<string, string> = {
  life_insurance: 'Life insurance',
  general_insurance: 'General insurance',
  mutual_fund: 'Mutual fund',
  fixed_income: 'Fixed income',
}

/** deleted_at is an instant; the advisor thinks in Indian calendar days. */
function deletedOn(instant: string): string {
  return formatDMY(todayInIndia(new Date(instant)))
}

const SNUG = 'w-[1%] whitespace-nowrap'

function Section({
  title,
  description,
  empty,
  children,
  headers,
}: {
  title: string
  description: string
  empty: boolean
  headers: string[]
  children: React.ReactNode
}) {
  return (
    <section className="mt-8">
      <h2 className={SECTION_TITLE}>{title}</h2>
      <p className={SECTION_LEAD}>{description}</p>
      <div className={`mt-3 ${TABLE_WRAP}`}>
        <table className={TABLE}>
          <thead>
            <tr className={TABLE_HEAD_ROW}>
              {headers.map((header, index) => (
                <th key={header} className={`${TH} ${index === 0 ? '' : SNUG}`}>
                  {header}
                </th>
              ))}
              <th className={`${TH} ${SNUG}`}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {empty ? (
              <tr>
                <td colSpan={headers.length + 1} className="p-0">
                  <p className={`${FULL_ROW} px-3 py-6 text-center text-ink-soft`}>Nothing here.</p>
                </td>
              </tr>
            ) : (
              children
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/**
 * Decision D2: nothing the advisor deletes is destroyed. This is where it
 * goes, and where it comes back from — exactly as it was, schedule and all.
 */
export default async function DeletedItemsPage() {
  const supabase = await createServerSupabase()
  const deleted = await listDeleted(supabase)
  const row = 'border-b border-line last:border-0'

  return (
    <div>
      <PageHeader
        title="Deleted items"
        back={{ href: '/families', label: 'All families' }}
        description="Nothing you delete is destroyed. Restore anything here and it comes back exactly as it was, reminders included."
      />

      <Section
        title="Households"
        description="Restoring a household brings back its members and policies with it."
        headers={['Household', 'Deleted on']}
        empty={deleted.families.length === 0}
      >
        {deleted.families.map((family) => (
          <tr key={family.id} className={row}>
            <td className={`${TD} font-medium`}>{family.name}</td>
            <td className={`${TD} ${SNUG} font-mono`}>{deletedOn(family.deletedAt)}</td>
            <td className={`${TD} ${SNUG} text-right`}>
              <RestoreButton label={family.name} restore={restoreFamily.bind(null, family.id)} />
            </td>
          </tr>
        ))}
      </Section>

      <Section
        title="Family members"
        description="Their policies stayed on the household's ledger while they were removed."
        headers={['Member', 'Household', 'Deleted on']}
        empty={deleted.members.length === 0}
      >
        {deleted.members.map((member) => (
          <tr key={member.id} className={row}>
            <td className={`${TD} font-medium`}>{member.name}</td>
            <td className={`${TD} ${SNUG}`}>
              <Link href={`/families/${member.familyId}`} className="text-navy hover:underline">
                {member.familyName}
              </Link>
            </td>
            <td className={`${TD} ${SNUG} font-mono`}>{deletedOn(member.deletedAt)}</td>
            <td className={`${TD} ${SNUG} text-right`}>
              <RestoreButton label={member.name} restore={restoreMember.bind(null, member.id)} />
            </td>
          </tr>
        ))}
      </Section>

      <Section
        title="Policies and holdings"
        description="Reminders pick up again from the next daily run after a restore."
        headers={['Policy or holding', 'Category', 'Household', 'Deleted on']}
        empty={deleted.holdings.length === 0}
      >
        {deleted.holdings.map((holding) => (
          <tr key={holding.id} className={row}>
            <td className={`${TD} font-medium`}>{holding.label}</td>
            <td className={`${TD} ${SNUG}`}>{CATEGORY_LABELS[holding.category] ?? holding.category}</td>
            <td className={`${TD} ${SNUG}`}>
              <Link href={`/families/${holding.familyId}`} className="text-navy hover:underline">
                {holding.familyName}
              </Link>
            </td>
            <td className={`${TD} ${SNUG} font-mono`}>{deletedOn(holding.deletedAt)}</td>
            <td className={`${TD} ${SNUG} text-right`}>
              <RestoreButton label={holding.label} restore={restoreHolding.bind(null, holding.id)} />
            </td>
          </tr>
        ))}
      </Section>
    </div>
  )
}
