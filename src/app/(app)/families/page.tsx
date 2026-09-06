import { createServerSupabase } from '@/lib/supabase/server'
import { listFamilies } from '@/lib/queries/families'
import { FamilyList } from './_components/FamilyList'
import { createFamily, deleteFamily } from './actions'

export default async function FamiliesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const supabase = await createServerSupabase()
  const { families, truncated } = await listFamilies(supabase, { search: q })

  return (
    <div className="pt-7">
      <form className="mb-4">
        <label htmlFor="q" className="sr-only">
          Search families
        </label>
        <input
          id="q"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search by family, head of family, or mobile"
          className="w-full max-w-sm rounded border border-line-strong bg-paper-raised px-2.5 py-2 text-[13px]"
        />
      </form>

      {truncated && (
        <p className="mb-3 rounded border border-gold bg-gold-bg px-2.5 py-2 text-[12.5px] text-gold">
          Showing the first {families.length} families. Narrow your search to see the rest.
        </p>
      )}

      <FamilyList families={families} createFamily={createFamily} deleteFamily={deleteFamily} />
    </div>
  )
}
