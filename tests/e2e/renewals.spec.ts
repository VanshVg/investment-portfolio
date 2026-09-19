import { addDays, addMonths } from 'date-fns'
import { expect, test, type Page } from '@playwright/test'

const EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'hiral@example.test'
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? ''

async function signIn(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/families$/)
}

/**
 * DD-MM-YYYY, matching `formatDMY` exactly. These journeys assert against
 * what the advisor actually sees on screen, not the ISO value underneath.
 */
function dmy(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${day}-${month}-${date.getFullYear()}`
}

/**
 * A future date that never lands on the 29th-31st. `markRenewed` advances a
 * policy by exactly 12 months along its own schedule, and a month-end anchor
 * (31 Jan rolling to 28/29 Feb) would make "one year later" land on a
 * different day of the month -- a real rule elsewhere in the app, not
 * something these journeys mean to exercise.
 */
function dueInDays(days: number): Date {
  const candidate = addDays(new Date(), days)
  return candidate.getDate() > 28 ? addDays(candidate, 5) : candidate
}

async function createFamily(page: Page, name: string) {
  await page.goto('/families')
  await page.getByRole('button', { name: '+ Add family' }).click()
  await page.getByLabel('Family name').fill(name)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('link', { name, exact: true })).toBeVisible()
}

/**
 * Opens the family workspace and returns its URL path, for a later plain
 * `page.goto`. A hard navigation is what forces the server component to
 * re-read the database; a `Link` click's soft app-router navigation might
 * instead serve a cached render from before the change under test.
 */
async function openFamily(page: Page, name: string): Promise<string> {
  const link = page.getByRole('link', { name, exact: true })
  const href = await link.getAttribute('href')
  if (!href) throw new Error(`family link for "${name}" had no href`)
  await link.click()
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  return href
}

/**
 * Adds a life insurance policy with a due date and waits for it to land in
 * the read-mode row. Life insurance's due frequency is always annual, which
 * is exactly the schedule these journeys need -- no separate control to set.
 */
async function addLifePolicy(page: Page, label: string, due: Date) {
  const lifeSection = page.locator('#life')
  await lifeSection.getByRole('button', { name: '+ Add policy' }).click()
  await lifeSection.getByLabel('Plan name').fill(label)
  await lifeSection.getByLabel('Due date').fill(dmy(due))
  await lifeSection.getByLabel('Due date').blur()
  await lifeSection.getByRole('button', { name: 'Save' }).click()
  await expect(lifeSection.getByText(label, { exact: true })).toBeVisible()
}

/**
 * Erases the household through the same DPDP-erasure dialog families.spec
 * exercises. Called from a `finally`, so it must tolerate the family already
 * being gone (or never having been created) if an earlier step failed.
 */
async function deleteFamily(page: Page, name: string) {
  await page.goto('/families')
  const deleteButton = page.getByRole('button', { name: `Delete ${name}`, exact: true })
  if ((await deleteButton.count()) === 0) return
  await deleteButton.click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel(/Type .* to confirm/).fill(name)
  await dialog.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('link', { name, exact: true })).toHaveCount(0)
}

test('finds an upcoming renewal by filtering the window', async ({ page }) => {
  const FAMILY = `E2E-RenewalWindow-${Date.now()}`
  const LABEL = 'E2E LIC Jeevan Anand'
  // Deliberately outside the page's default 30-day window (see renewal-params.ts)
  // but inside "Next 60 days" -- a due date already covered by the default
  // would make clicking the preset prove nothing.
  const due = dueInDays(45)

  try {
    await signIn(page)
    await createFamily(page, FAMILY)
    await openFamily(page, FAMILY)
    await addLifePolicy(page, LABEL, due)

    await page.goto('/renewals')
    // Rows only, not the filter bar's own "Family" <select> -- that dropdown
    // lists every household regardless of the date filter, so it would also
    // contain FAMILY's name and defeat this baseline check.
    const row = page.getByRole('row').filter({ hasText: FAMILY })
    await expect(row).toHaveCount(0)

    await page.getByRole('button', { name: 'Next 60 days', exact: true }).click()

    await expect(row).toHaveCount(1)
    await expect(row.getByText(FAMILY, { exact: true })).toBeVisible()
    await expect(row.getByText(dmy(due), { exact: true })).toBeVisible()
  } finally {
    await deleteFamily(page, FAMILY)
  }
})

test('marks a policy renewed and sees it roll to the next year', async ({ page }) => {
  const FAMILY = `E2E-RenewalRoll-${Date.now()}`
  const LABEL = 'E2E HDFC Sanchay'
  const due = dueInDays(10) // inside the default 30-day window
  const nextYear = addMonths(due, 12)

  try {
    await signIn(page)
    await createFamily(page, FAMILY)
    const familyHref = await openFamily(page, FAMILY)
    await addLifePolicy(page, LABEL, due)

    const lifeSection = page.locator('#life')
    const policyRow = lifeSection.getByRole('row').filter({ hasText: LABEL })
    // Baseline, before touching the renewals page at all.
    await expect(policyRow.getByText(dmy(due), { exact: true })).toBeVisible()

    await page.goto('/renewals')
    // The renewals page spans every family, so the controls are named with
    // the full row description -- policy, family, member, due date -- which
    // is what makes this one row's controls addressable at all.
    const desc = `${LABEL}, ${FAMILY} (whole family), due ${dmy(due)}`
    const status = page.getByRole('combobox', { name: `Payment status for ${desc}`, exact: true })
    const markRenewedButton = page.getByRole('button', {
      name: `Mark renewed for ${desc}`,
      exact: true,
    })

    await expect(status).toHaveValue('unknown')

    await markRenewedButton.click()
    // aria-busy, not disabled, marks the pending save -- see PaymentStatusControl.
    await expect(status).not.toHaveAttribute('aria-busy', 'true')
    await expect(status).toHaveValue('paid')

    // markRenewed leaves this instance's own due date untouched -- only the
    // holding's schedule moves, visible back on the family ledger. A hard
    // navigation is required here; see openFamily.
    await page.goto(familyHref)
    const policyRowAfter = page.locator('#life').getByRole('row').filter({ hasText: LABEL })
    await expect(policyRowAfter.getByText(dmy(due), { exact: true })).toHaveCount(0)
    await expect(policyRowAfter.getByText(dmy(nextYear), { exact: true })).toBeVisible()
  } finally {
    await deleteFamily(page, FAMILY)
  }
})

test('records a premium as unpaid and the tick survives a reload', async ({ page }) => {
  const FAMILY = `E2E-RenewalUnpaid-${Date.now()}`
  const LABEL = 'E2E Bajaj Health Shield'
  const due = dueInDays(15)

  try {
    await signIn(page)
    await createFamily(page, FAMILY)
    await openFamily(page, FAMILY)
    await addLifePolicy(page, LABEL, due)

    await page.goto('/renewals')
    const desc = `${LABEL}, ${FAMILY} (whole family), due ${dmy(due)}`
    const status = page.getByRole('combobox', { name: `Payment status for ${desc}`, exact: true })

    // Baseline: a fresh holding has no payment recorded either way.
    await expect(status).toHaveValue('unknown')

    await status.selectOption('unpaid')
    await expect(status).not.toHaveAttribute('aria-busy', 'true')
    await expect(status).toHaveValue('unpaid')

    // The manual tick is the primary path (no insurer exposes a payment API
    // to an independent advisor), so it has to survive a real reload, not
    // just an optimistic client update that a full reread of the server
    // would otherwise expose as never having been saved.
    await page.reload()
    const statusAfterReload = page.getByRole('combobox', {
      name: `Payment status for ${desc}`,
      exact: true,
    })
    await expect(statusAfterReload).toHaveValue('unpaid')
  } finally {
    await deleteFamily(page, FAMILY)
  }
})
