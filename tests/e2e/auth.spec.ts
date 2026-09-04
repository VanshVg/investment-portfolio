import { expect, test } from '@playwright/test'

const EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'hiral@example.test'
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? ''

test('redirects an anonymous visitor to the login page', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
})

test('rejects a wrong password without signing in', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill('definitely-not-the-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Invalid email or password.')).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
})

test('signs in with valid credentials and reaches the dashboard', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('http://localhost:3000/')
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
})
