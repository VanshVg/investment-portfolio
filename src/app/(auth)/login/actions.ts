'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabase/server'

export async function login(_previous: string | null, formData: FormData): Promise<string | null> {
  const supabase = await createServerSupabase()

  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
  })

  // One message for every failure — never reveal whether the address exists.
  if (error) return 'Invalid email or password.'

  revalidatePath('/', 'layout')
  redirect('/')
}
