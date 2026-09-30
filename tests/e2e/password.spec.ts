import { expect, test, type Page } from '@playwright/test'
import { ensureUser } from '../helpers/db'

// Its own account, so a run that fails half way cannot leave the seeded
// advisor's password changed for every other spec.
const EMAIL = 'e2e-password@example.test'
const ORIGINAL = 'e2e-original-password-1'
const NEW = 'e2e-replacement-password-2'

test.beforeEach(async () => {
  await ensureUser(EMAIL, ORIGINAL, 'admin')
})

test.afterAll(async () => {
  await ensureUser(EMAIL, ORIGINAL, 'admin')
})

async function signIn(page: Page, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test('changes the password from Settings, and only the new one signs in afterwards', async ({
  page,
}) => {
  await signIn(page, ORIGINAL)
  await expect(page).toHaveURL(/\/families$/)

  await page.getByRole('link', { name: 'Settings' }).click()
  await page.getByLabel('Current password').fill(ORIGINAL)
  await page.getByLabel('New password', { exact: true }).fill(NEW)
  await page.getByLabel('Confirm new password').fill(NEW)
  await page.getByRole('button', { name: 'Change password' }).click()
  await expect(page.getByRole('status')).toHaveText('Password changed.')

  // Still signed in after the change.
  await page.goto('/families')
  await expect(page).toHaveURL(/\/families$/)

  await page.getByRole('button', { name: 'Sign out' }).click()
  await signIn(page, ORIGINAL)
  await expect(page.getByText('Invalid email or password.')).toBeVisible()

  await signIn(page, NEW)
  await expect(page).toHaveURL(/\/families$/)
})

test('refuses the change when the current password is wrong', async ({ page }) => {
  await signIn(page, ORIGINAL)
  await expect(page).toHaveURL(/\/families$/)

  await page.goto('/settings/reminders')
  await page.getByLabel('Current password').fill('not-the-password-0')
  await page.getByLabel('New password', { exact: true }).fill(NEW)
  await page.getByLabel('Confirm new password').fill(NEW)
  await page.getByRole('button', { name: 'Change password' }).click()
  await expect(page.getByText('Current password is incorrect.')).toBeVisible()
})
