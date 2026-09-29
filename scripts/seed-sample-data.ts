import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local', quiet: true })

const FAMILY_NAME = 'Patel — Rajeshkumar'

// This script deletes and recreates a household, so it must only ever run
// against the local database — never a hosted project holding client data.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])
if (!supabaseUrl || !LOCAL_HOSTS.has(new URL(supabaseUrl).hostname)) {
  throw new Error(
    `Refusing to seed sample data: ${supabaseUrl || 'NEXT_PUBLIC_SUPABASE_URL (unset)'} is not a local Supabase.`,
  )
}

const admin = createClient(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

// The advisor profile must already exist — `db:reset` wipes `auth.users` (and
// with it the `profiles` row created by the on-insert trigger) on every run,
// so this script cannot create its own advisor. Run `npm run db:seed-admin`
// first.
const { data: profiles, error: profilesError } = await admin
  .from('profiles')
  .select('id')
  .order('created_at', { ascending: true })
  .limit(1)

if (profilesError) throw profilesError
const advisorId = profiles?.[0]?.id
if (!advisorId) {
  throw new Error(
    'No advisor profile found. Run `npm run db:seed-admin` first, then `npm run db:seed-sample`.',
  )
}

// Idempotent: remove any earlier run's sample family before inserting fresh.
// The cascade on families -> family_members / holdings -> due_instances takes
// members, holdings, and due instances with it.
const { error: deleteError } = await admin.from('families').delete().eq('name', FAMILY_NAME)
if (deleteError) throw deleteError

const { data: family, error: familyError } = await admin
  .from('families')
  .insert({
    owner_advisor_id: advisorId,
    name: FAMILY_NAME,
    head_name: 'Rajeshkumar Patel',
    head_mobile: '+919876543210',
  })
  .select('id')
  .single()
if (familyError) throw familyError
const familyId = family.id as string

const { data: members, error: membersError } = await admin
  .from('family_members')
  .insert(
    [
      {
        family_id: familyId,
        name: 'Rajeshkumar Patel',
        relation: 'self',
        mobile: '+919876543210',
        whatsapp_consent: true,
      },
      {
        family_id: familyId,
        name: 'Sunitaben Patel',
        relation: 'spouse',
        mobile: '+919876543211',
        whatsapp_consent: false,
      },
      { family_id: familyId, name: 'Aarav Patel', relation: 'son' },
    ],
    { defaultToNull: false },
  )
  .select('id, name')
if (membersError) throw membersError

const headId = members!.find((m) => m.name === 'Rajeshkumar Patel')!.id as string
const spouseId = members!.find((m) => m.name === 'Sunitaben Patel')!.id as string
const sonId = members!.find((m) => m.name === 'Aarav Patel')!.id as string

async function insertHolding(row: Record<string, unknown>) {
  const { data, error } = await admin.from('holdings').insert(row).select('id').single()
  if (error) throw error
  return data.id as string
}

async function insertDueInstance(holdingId: string, dueDate: string, amountDue: number) {
  const { error } = await admin
    .from('due_instances')
    .insert({ holding_id: holdingId, due_date: dueDate, amount_due: amountDue })
  if (error) throw error
}

// Life insurance
const lifeSelfId = await insertHolding({
  family_id: familyId,
  member_id: headId,
  category: 'life_insurance',
  managed_by: 'self',
  label: 'LIC Jeevan Umang / Term Plan',
  institution: 'LIC',
  principal_amount: 5_000_000,
  periodic_amount: 45_000,
  anchor_due_date: '2027-03-15',
  next_due_date: '2027-03-15',
  due_frequency: 'annual',
  details: { plan_type: 'Endowment' },
})
await insertDueInstance(lifeSelfId, '2027-03-15', 45_000)

const lifeExternalId = await insertHolding({
  family_id: familyId,
  member_id: sonId,
  category: 'life_insurance',
  managed_by: 'external',
  label: 'Child Education Plan',
  institution: 'HDFC Life',
  principal_amount: 1_000_000,
  periodic_amount: 25_000,
  anchor_due_date: '2026-09-20',
  next_due_date: '2026-09-20',
  due_frequency: 'annual',
  details: {},
})
await insertDueInstance(lifeExternalId, '2026-09-20', 25_000)

// General insurance
const healthId = await insertHolding({
  family_id: familyId,
  category: 'general_insurance',
  managed_by: 'self',
  label: 'Optima Secure Health Floater',
  institution: 'HDFC Ergo',
  principal_amount: 1_000_000,
  periodic_amount: 22_000,
  anchor_due_date: '2027-05-15',
  next_due_date: '2027-05-15',
  due_frequency: 'annual',
  details: {
    sub_category: 'health',
    insured_asset: 'Entire family (floater)',
    policy_type: 'Optima Secure Health Floater',
  },
})
await insertDueInstance(healthId, '2027-05-15', 22_000)

const vehicleId = await insertHolding({
  family_id: familyId,
  member_id: headId,
  category: 'general_insurance',
  managed_by: 'self',
  label: 'Hyundai Creta GJ-16-XX-1234',
  institution: 'ICICI Lombard',
  principal_amount: 850_000,
  periodic_amount: 14_500,
  anchor_due_date: '2026-11-20',
  next_due_date: '2026-11-20',
  due_frequency: 'annual',
  details: {
    sub_category: 'vehicle',
    insured_asset: 'Hyundai Creta GJ-16-XX-1234',
    policy_type: 'Comprehensive car insurance',
  },
})
await insertDueInstance(vehicleId, '2026-11-20', 14_500)

// Mutual funds
await insertHolding({
  family_id: familyId,
  member_id: headId,
  category: 'mutual_fund',
  managed_by: 'self',
  label: 'Retirement corpus',
  principal_amount: 1_500_000,
  periodic_amount: 15_000,
  due_frequency: 'monthly',
  reminders_enabled: false,
  details: { target_goal: 6_000_000 },
})

await insertHolding({
  family_id: familyId,
  member_id: sonId,
  category: 'mutual_fund',
  managed_by: 'external',
  label: 'Education corpus',
  principal_amount: 500_000,
  periodic_amount: 0,
  due_frequency: 'monthly',
  reminders_enabled: false,
  details: { target_goal: 1_500_000 },
})

// Fixed income
const fdId = await insertHolding({
  family_id: familyId,
  member_id: headId,
  category: 'fixed_income',
  managed_by: 'external',
  label: 'Bank fixed deposit',
  institution: 'SBI',
  principal_amount: 1_000_000,
  anchor_due_date: '2027-10-01',
  next_due_date: '2027-10-01',
  due_frequency: 'one_time',
  details: {
    asset_type: 'Bank fixed deposit',
    interest_rate: 6.5,
    remarks: 'Oct 2027 maturity',
  },
})
await insertDueInstance(fdId, '2027-10-01', 1_000_000)

const bondsId = await insertHolding({
  family_id: familyId,
  member_id: spouseId,
  category: 'fixed_income',
  managed_by: 'self',
  label: 'Corporate bonds / NCDs',
  institution: 'InCred',
  principal_amount: 300_000,
  anchor_due_date: '2026-12-31',
  next_due_date: '2026-12-31',
  due_frequency: 'quarterly',
  details: {
    asset_type: 'Corporate bonds / NCDs',
    interest_rate: 9.5,
    payout_frequency: 'Quarterly',
  },
})
await insertDueInstance(bondsId, '2026-12-31', 7_125)

console.log(`Seeded sample family "${FAMILY_NAME}" (${familyId}).`)
