import { expect, test } from '@playwright/test'

const EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'hiral@example.test'
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

test('records a household, its member and a policy, then erases it', async ({ page }) => {
  await signIn(page)

  // Create the family.
  await page.getByRole('button', { name: '+ Add family' }).click()
  await page.getByLabel('Family name').fill(FAMILY)
  await page.getByLabel('Head of family').fill('Rakesh Patel')
  await page.getByLabel('Mobile').fill('9876543210')
  await page.getByRole('button', { name: 'Save' }).click()

  // The local DB carries ~1300 stale fixture households and this list has no
  // pagination, so every save re-renders the full table: a longer timeout
  // than the default gives that render room to finish under this data volume
  // without changing what is asserted.
  await expect(page.getByRole('link', { name: FAMILY })).toBeVisible({ timeout: 15_000 })
  // The local DB carries ~1300 stale fixture households, some sharing this
  // same placeholder mobile number, so the check is scoped to this family's
  // own row rather than matched page-wide.
  const familyRow = page.getByRole('row').filter({ has: page.getByRole('link', { name: FAMILY }) })
  // The number was normalised to E.164 on the way in.
  await expect(familyRow.getByText('+919876543210')).toBeVisible()

  await page.getByRole('link', { name: FAMILY }).click()
  await expect(page.getByRole('heading', { name: FAMILY })).toBeVisible()

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

  // Correcting the date must stick, not snap back to the old grid.
  await lifeSection.getByRole('button', { name: 'Edit HDFC Click2Protect' }).click()
  await lifeSection.getByLabel('Due date').fill('20-03-2027')
  await lifeSection.getByLabel('Due date').blur()
  await lifeSection.getByRole('button', { name: 'Save' }).click()
  await expect(lifeSection.getByText('20-03-2027')).toBeVisible()

  // Erase the household. This is the DPDP erasure path, so it demands the name.
  await page.goto('/families')
  await page.getByRole('button', { name: `Delete ${FAMILY}` }).click()
  // The local DB carries ~1300 stale fixture households, each with its own
  // "Delete <name>" button on this page. A bare "Delete" name match is a
  // substring match against every one of them, so the confirm button is
  // scoped to the one open dialog rather than looked up page-wide.
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
  // See the journey test above: the unpaginated list re-renders ~1300 rows on
  // every save, so this needs more than the default timeout.
  await expect(page.getByRole('link', { name })).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: `Delete ${name}` }).click()
  // Scoped to the one open dialog, for the same reason as the journey test
  // above: a bare "Delete" name is a substring match against every stale
  // fixture row's own "Delete <name>" button on this page.
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
  // See the journey test above: the unpaginated list re-renders ~1300 rows on
  // every save, so this needs more than the default timeout.
  await expect(page.getByRole('link', { name })).toBeVisible({ timeout: 15_000 })

  // Clean up. Scoped to the dialog for the same reason as the tests above.
  await page.getByRole('button', { name: `Delete ${name}` }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel(/Type .* to confirm/).fill(name)
  await dialog.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('link', { name })).toHaveCount(0)
})
