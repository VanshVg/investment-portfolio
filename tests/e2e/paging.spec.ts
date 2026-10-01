import { expect, test, type Page } from '@playwright/test'
import { adminClient } from '../helpers/db'
import { purgeE2EHouseholds } from './cleanup'

const EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'hiral@example.test'
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? ''
const RUN = Date.now()
const PREFIX = `E2E Paging ${RUN}`
const REPLY_PREFIX = `wamid.e2e-paging-${RUN}`

async function signIn(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/families$/)
}

test.beforeAll(async () => {
  const admin = adminClient()
  const { data: users } = await admin.auth.admin.listUsers()
  const advisorId = users.users.find((user) => user.email === EMAIL)!.id
  const { error } = await admin.from('families').insert(
    Array.from({ length: 55 }, (_, i) => ({
      name: `${PREFIX} ${String(i + 1).padStart(3, '0')}`,
      owner_advisor_id: advisorId,
    })),
  )
  if (error) throw new Error(error.message)
  const { error: repliesError } = await admin.from('whatsapp_inbound').insert(
    Array.from({ length: 30 }, (_, i) => ({
      from_mobile: '+919812333001',
      body: `Paging reply ${i + 1}`,
      provider_message_id: `${REPLY_PREFIX}-${i}`,
    })),
  )
  if (repliesError) throw new Error(repliesError.message)
})

test.afterAll(async () => {
  await adminClient()
    .from('whatsapp_inbound')
    .delete()
    .like('provider_message_id', `${REPLY_PREFIX}%`)
  await purgeE2EHouseholds()
})

test('pages through a search of the families list, keeping the search', async ({ page }) => {
  await signIn(page)
  await page.goto(`/families?q=${encodeURIComponent(PREFIX)}`)
  await expect(page.getByText('55 matches')).toBeVisible()

  const pager = page.getByRole('navigation', { name: 'Families pages' })
  await expect(pager).toContainText('Showing 1–50 of 55')
  await expect(pager).toContainText('Page 1 of 2')
  await expect(page.getByRole('link', { name: `${PREFIX} 050`, exact: true })).toBeVisible()

  await pager.getByRole('link', { name: 'Next page' }).click()
  await expect(page).toHaveURL(/[?&]page=2/)
  await expect(page).toHaveURL(/[?&]q=/)
  await expect(pager).toContainText('Showing 51–55 of 55')
  await expect(page.getByRole('link', { name: `${PREFIX} 055`, exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: `${PREFIX} 001`, exact: true })).toHaveCount(0)

  await pager.getByRole('link', { name: 'Previous page' }).click()
  await expect(pager).toContainText('Showing 1–50 of 55')
})

test('serves the last page for an address past the end', async ({ page }) => {
  await signIn(page)
  await page.goto(`/families?q=${encodeURIComponent(PREFIX)}&page=99`)
  await expect(page.getByRole('navigation', { name: 'Families pages' })).toContainText(
    'Showing 51–55 of 55',
  )
})

test('pages Messages replies on their own, landing back on that section', async ({ page }) => {
  await signIn(page)
  await page.goto('/messages')
  const pager = page.getByRole('navigation', { name: 'Replies pages' })
  await expect(pager).toContainText(/Showing 1–25 of \d+/)

  await pager.getByRole('link', { name: 'Next page' }).click()
  await expect(page).toHaveURL(/repliesPage=2#replies$/)
  await expect(page.getByRole('navigation', { name: 'Replies pages' })).toContainText(
    /Showing 26–/,
  )
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true })

  test('the pager fits the screen, with both buttons on one row', async ({ page }) => {
    await signIn(page)
    await page.goto(`/families?q=${encodeURIComponent(PREFIX)}&page=2`)
    const pager = page.getByRole('navigation', { name: 'Families pages' })
    await expect(pager).toBeVisible()
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth)

    const previous = await pager.getByRole('link', { name: 'Previous page' }).boundingBox()
    const next = pager.getByText('Next →')
    const nextBox = await next.boundingBox()
    expect(previous!.height).toBeGreaterThanOrEqual(36)
    expect(Math.abs(previous!.y - nextBox!.y)).toBeLessThan(2)
  })
})
