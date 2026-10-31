import { expect, test } from '@playwright/test'
import { purgeE2EHouseholds } from './cleanup'

const EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'advisor@example.test'
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? ''

// Unique per run, so a failed run never collides with the next one.
const FAMILY = `E2E Household ${Date.now()}`

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/families$/)
}

test.afterAll(purgeE2EHouseholds)

test('records a household, its member and a policy, then erases it', async ({ page }) => {
  await signIn(page)

  // Create the family.
  await page.getByRole('button', { name: '+ Add family' }).click()
  await page.getByLabel('Family name').fill(FAMILY)
  await page.getByLabel('Head of family').fill('Rakesh Patel')
  await page.getByLabel('Mobile').fill('9876543210')
  await page.getByRole('button', { name: 'Save' }).click()

  // Saving a new household opens its page: members and policies are added
  // there next.
  await expect(page).toHaveURL(/\/families\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: FAMILY })).toBeVisible()
  // The number was normalised to E.164 on the way in.
  await expect(page.getByText('+919876543210')).toBeVisible()

  // Locators are scoped to the section anchors: "Mobile" labels both the
  // household header field and the member field on this page, and "+ Add policy"
  // labels both insurance sections. Scoping is the fix rather than renaming the
  // labels, which are correct for screen-reader users.
  const membersSection = page.locator('#members')
  const lifeSection = page.locator('#life')

  // Add a member with consent.
  await membersSection.getByRole('button', { name: '+ Add family member' }).click()
  await membersSection.getByLabel('Name').fill('Rakesh')
  await membersSection.getByLabel('Mobile').fill('9876543210')
  await membersSection.getByLabel('WhatsApp consent').check()
  await membersSection.getByRole('button', { name: 'Save' }).click()
  await expect(membersSection.getByText('Consented')).toBeVisible()
  // Saved and closed: no second blank form opens for another member.
  await expect(membersSection.getByRole('button', { name: 'Save' })).toHaveCount(0)

  // Add a life policy with a detail field.
  await lifeSection.getByRole('button', { name: '+ Add policy' }).click()
  await lifeSection.getByLabel('Plan name').fill('HDFC Click2Protect')
  await lifeSection.getByLabel('Sum assured').fill('5000000')
  await lifeSection.getByLabel('Due date').fill('12-03-2027')
  // DateField parses on blur, so the next field must take focus before saving.
  await lifeSection.getByLabel('Policy number').fill('P/1234')
  await lifeSection.getByRole('button', { name: 'Save' }).click()

  // "HDFC Click2Protect" also names the row's Edit/Delete buttons (their
  // accessible name is "Edit HDFC Click2Protect" / "Delete HDFC
  // Click2Protect"), so a substring text match is ambiguous even scoped to
  // #life. An exact match keeps the label untouched and picks out only the
  // table cell.
  await expect(lifeSection.getByText('HDFC Click2Protect', { exact: true })).toBeVisible()
  await expect(lifeSection.getByText('12-03-2027')).toBeVisible()
  await expect(lifeSection.getByRole('button', { name: 'Save' })).toHaveCount(0)

  // Correcting the date must stick, not snap back to the old grid.
  await lifeSection.getByRole('button', { name: 'Edit HDFC Click2Protect' }).click()
  await lifeSection.getByLabel('Due date').fill('20-03-2027')
  await lifeSection.getByLabel('Due date').blur()
  await lifeSection.getByRole('button', { name: 'Save' }).click()
  await expect(lifeSection.getByText('20-03-2027')).toBeVisible()

  // Erase the household. This is the DPDP erasure path, so it demands the name.
  await page.goto('/families')
  await page.getByRole('button', { name: `Delete ${FAMILY}` }).click()
  // Every row on this page has its own "Delete <name>" button, and Playwright
  // matches accessible names by substring, so a bare "Delete" matches all of
  // them plus the dialog's own button. Scoping to the one open dialog is the
  // fix; the labels are correct for screen-reader users and stay as they are.
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByLabel(/Type .* to confirm/).fill(FAMILY)
  await dialog.getByRole('button', { name: 'Delete' }).click()

  await expect(page.getByRole('link', { name: FAMILY })).toHaveCount(0)
})

test('refuses to arm the family delete until the name is typed exactly', async ({ page }) => {
  await signIn(page)
  const name = `E2E Guard ${Date.now()}`

  await page.getByRole('button', { name: '+ Add family' }).click()
  await page.getByLabel('Family name').fill(name)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()

  await page.goto('/families')
  await page.getByRole('button', { name: `Delete ${name}` }).click()
  // Scoped to the one open dialog, for the same reason as the journey test
  // above: a bare "Delete" is a substring match against every row's own
  // "Delete <name>" button.
  const dialog = page.getByRole('dialog')
  const confirm = dialog.getByRole('button', { name: 'Delete' })
  await expect(confirm).toBeDisabled()

  await dialog.getByLabel(/Type .* to confirm/).fill('wrong name')
  await expect(confirm).toBeDisabled()

  await dialog.getByLabel(/Type .* to confirm/).fill(name)
  await expect(confirm).toBeEnabled()

  // Clean up.
  await confirm.click()
  await expect(page.getByRole('link', { name })).toHaveCount(0)
})

test('adds a policy without touching the mouse', async ({ page }) => {
  await signIn(page)
  const name = `E2E Keyboard ${Date.now()}`

  await page.getByRole('button', { name: '+ Add family' }).click()
  await page.getByLabel('Family name').fill(name)
  // Enter commits the row: fast entry is a stated requirement, so it is tested.
  await page.getByLabel('Family name').press('Enter')
  await expect(page.getByRole('heading', { name })).toBeVisible()

  // Clean up. Scoped to the dialog for the same reason as the tests above.
  await page.goto('/families')
  await page.getByRole('button', { name: `Delete ${name}` }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel(/Type .* to confirm/).fill(name)
  await dialog.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('link', { name })).toHaveCount(0)
})

test('offers the advisor no deleted-items page: deleted records are kept, not browsable', async ({
  page,
}) => {
  await signIn(page)
  await expect(page.getByRole('link', { name: 'Deleted items' })).toHaveCount(0)
  const response = await page.goto('/deleted')
  expect(response?.status()).toBe(404)
})
