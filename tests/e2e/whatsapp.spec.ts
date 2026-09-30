import { expect, test, type Page } from '@playwright/test'
import { adminClient } from '../helpers/db'
import { purgeE2EHouseholds } from './cleanup'

const EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'hiral@example.test'
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? ''
const FAMILY = `E2E WhatsApp ${Date.now()}`
const REPLY_ID = `wamid.e2e-${Date.now()}`

async function signIn(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/families$/)
}

test.afterAll(async () => {
  await adminClient().from('whatsapp_inbound').delete().eq('provider_message_id', REPLY_ID)
  await purgeE2EHouseholds()
})

test('Settings shows WhatsApp as not connected, with nothing to switch on', async ({ page }) => {
  // The development server has no Meta keys, exactly like a fresh deployment.
  await signIn(page)
  await page.getByRole('link', { name: 'Settings' }).click()
  const heading = page.getByRole('heading', { name: 'WhatsApp' })
  const section = page.locator('section', { has: heading })
  await expect(section.getByText(/Not connected/)).toBeVisible()
  await expect(section.getByRole('radio', { name: /^Off/ })).toBeChecked()
  await expect(section.getByRole('radio', { name: /^Live/ })).toBeDisabled()
  await expect(section.getByRole('button', { name: 'Send me a test message' })).toBeDisabled()
})

test('Messages lists a failed reminder and a client’s reply, which can be marked handled', async ({
  page,
}) => {
  const admin = adminClient()
  const { data: users } = await admin.auth.admin.listUsers()
  const advisorId = users.users.find((user) => user.email === EMAIL)!.id
  const { data: family } = await admin
    .from('families')
    .insert({ name: FAMILY, owner_advisor_id: advisorId })
    .select('id')
    .single()
  const { data: member } = await admin
    .from('family_members')
    .insert({
      family_id: family!.id,
      name: 'E2E Reply Sender',
      relation: 'self',
      mobile: '+919812344001',
    })
    .select('id')
    .single()
  const { data: holding } = await admin
    .from('holdings')
    .insert({ family_id: family!.id, category: 'life_insurance', label: 'E2E Failed Policy' })
    .select('id')
    .single()
  const { data: instance } = await admin
    .from('due_instances')
    .insert({ holding_id: holding!.id, due_date: '2027-06-01' })
    .select('id')
    .single()
  await admin.from('reminder_log').insert({
    due_instance_id: instance!.id,
    days_before: 15,
    recipient_type: 'client',
    recipient_mobile: '+919812344001',
    status: 'failed',
    error: 'Recipient not on WhatsApp',
  })
  await admin.from('whatsapp_inbound').insert({
    from_mobile: '+919812344001',
    body: 'Can we talk about the premium?',
    provider_message_id: REPLY_ID,
    member_ids: [member!.id],
  })

  await signIn(page)
  await page.getByRole('link', { name: 'Messages' }).click()
  await expect(page.getByRole('heading', { name: 'Messages', level: 1 })).toBeVisible()

  const failedRow = page.getByRole('row').filter({ hasText: 'E2E Failed Policy' })
  await expect(failedRow.getByText('Recipient not on WhatsApp')).toBeVisible()
  await expect(failedRow.getByRole('link', { name: FAMILY })).toBeVisible()

  const replyRow = page.getByRole('row').filter({ hasText: 'Can we talk about the premium?' })
  await expect(replyRow.getByText('E2E Reply Sender')).toBeVisible()
  await replyRow.getByRole('button', { name: 'Mark handled: E2E Reply Sender' }).click()
  await expect(replyRow.getByText('Handled')).toBeVisible()
})
