import { expect, test, type Locator, type Page } from '@playwright/test'
import { purgeE2EHouseholds } from './cleanup'

const EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'hiral@example.test'
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? ''

const FAMILY = `E2E Responsive ${Date.now()}`

// A small Android phone. Anything wider than the screen here makes a mobile
// browser lay the whole page out wider than the screen, so zooming out shows
// an empty strip down the right-hand side.
test.use({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true })

test.afterAll(purgeE2EHouseholds)

async function signIn(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/families$/)
}

async function expectNoSidewaysScroll(page: Page) {
  await page.waitForLoadState('networkidle')
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(scrollWidth, `${page.url()} is wider than the screen`).toBeLessThanOrEqual(clientWidth)
}

/**
 * A table on a phone scrolls sideways inside its card, which keeps the page
 * itself narrow but can still carry content off to the right. Anything that
 * spans a whole row — a form, an empty-table message — must stay on screen.
 */
async function expectOnScreen(page: Page, locator: Locator) {
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
  const box = await locator.boundingBox()
  expect(box, 'element is not rendered').not.toBeNull()
  expect(box!.x, 'starts off the left of the screen').toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width, 'runs off the right of the screen').toBeLessThanOrEqual(clientWidth)
}

test('no page is wider than a phone screen', async ({ page }) => {
  await page.goto('/login')
  await expectNoSidewaysScroll(page)

  await signIn(page)
  await page.getByRole('button', { name: '+ Add family' }).click()
  await expectNoSidewaysScroll(page)
  await page.getByLabel('Family name').fill(FAMILY)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { name: FAMILY })).toBeVisible()
  await expectNoSidewaysScroll(page)

  await page.goto('/families')
  await expect(page.getByRole('link', { name: FAMILY, exact: true })).toBeVisible()
  await expectNoSidewaysScroll(page)

  await page.getByRole('link', { name: FAMILY, exact: true }).click()
  await expect(page.getByRole('heading', { name: FAMILY })).toBeVisible()

  const lifeInsurance = page.locator('section', {
    has: page.getByRole('heading', { name: 'Life insurance' }),
  })
  await expectOnScreen(page, lifeInsurance.getByText('No life insurance recorded.'))
  await lifeInsurance.getByRole('button', { name: '+ Add policy' }).click()
  for (const field of ['Plan name', 'Due date', 'Insurer']) {
    await expectOnScreen(page, lifeInsurance.getByLabel(field, { exact: true }))
  }
  await expectOnScreen(page, lifeInsurance.getByRole('button', { name: 'Save' }))
  await lifeInsurance.getByRole('button', { name: 'Cancel' }).click()

  for (const path of ['/renewals', '/messages', '/settings/reminders']) {
    await page.goto(path)
    await expectNoSidewaysScroll(page)
  }
})
