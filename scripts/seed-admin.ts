import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local', quiet: true })

const email = process.env.SEED_ADMIN_EMAIL
const password = process.env.SEED_ADMIN_PASSWORD

if (!email || !password) {
  throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env.local')
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const { data } = await admin.auth.admin.listUsers()
if (data?.users.some((user) => user.email === email)) {
  console.log(`Admin ${email} already exists.`)
  process.exit(0)
}

const { error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: 'Hiral Investmentwala', role: 'admin' },
})

if (error) throw error
console.log(`Created admin ${email}.`)
