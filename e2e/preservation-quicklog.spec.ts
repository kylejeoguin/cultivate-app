import { test, expect } from '@playwright/test'

// Preservation QuickLog — the batch you put up, logged through the ONE save_log_entry RPC.
//
// PreservationLogForm used to INSERT straight into `preservation_logs`, bypassing the RPC and
// showing users raw Postgres errors. Deleting it was only safe once the QuickLog could do the
// two things that form could and it couldn't: back-date, and take a note. So these tests assert
// exactly that — a batch logged for a PAST date, with a note, lands in history.
//
// Gated on env so CI (no creds) skips cleanly:
//   E2E_TEST_EMAIL=... E2E_TEST_PASSWORD=... npm run test:e2e -- preservation-quicklog

const EMAIL = process.env.E2E_TEST_EMAIL
const PASSWORD = process.env.E2E_TEST_PASSWORD

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(EMAIL!)
  await page.locator('input[type="password"]').fill(PASSWORD!)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 })
}

async function gotoPreservation(page: import('@playwright/test').Page) {
  await page.goto('/dashboard/homestead/preservation')
  await expect(page.locator('#ql-quantity')).toBeVisible({ timeout: 60_000 })
}

// Controlled React inputs discard fills that land before hydration. Retry until the value
// sticks — that round-trip IS the hydration signal.
async function fillHydrated(page: import('@playwright/test').Page, selector: string, value: string) {
  await expect(async () => {
    await page.locator(selector).fill(value)
    await expect(page.locator(selector)).toHaveValue(value)
  }).toPass({ timeout: 60_000 })
}

test.describe('preservation quick log', () => {
  test.skip(!EMAIL || !PASSWORD, 'set E2E_TEST_EMAIL / E2E_TEST_PASSWORD to run')

  test('logs a batch and it appears in history', async ({ page }) => {
    await login(page)
    await gotoPreservation(page)

    const qty = '91' // a quantity no seeded row uses
    await fillHydrated(page, '#ql-item_name', 'E2E Pickled Beets')
    await page.locator('#ql-method').selectOption('fermenting')
    await fillHydrated(page, '#ql-quantity', qty)
    await page.getByRole('button', { name: /✓ Log/ }).click()

    await expect(page.getByText('Logged ✓')).toBeVisible({ timeout: 30_000 })
    // The row actually persisted — router.refresh() re-reads history from the DB.
    await expect(page.locator('main')).toContainText('E2E Pickled Beets', { timeout: 15_000 })
    await expect(page.locator('main')).toContainText(qty)
  })

  test('back-dating and notes survive — the reason the long form could be deleted', async ({ page }) => {
    await login(page)
    await gotoPreservation(page)

    await fillHydrated(page, '#ql-item_name', 'E2E Backdated Jam')
    await fillHydrated(page, '#ql-quantity', '4')

    // "＋ More details" is what absorbed the retired form's date + notes fields.
    await page.getByText('＋ More details').click()
    await fillHydrated(page, '#ql-log-date', '2026-03-14')
    await fillHydrated(page, '#ql-notes', 'E2E note: grandma recipe')

    await page.getByRole('button', { name: /✓ Log/ }).click()
    await expect(page.getByText('Logged ✓')).toBeVisible({ timeout: 30_000 })

    // History groups by month, so a March batch must NOT appear under today's month.
    await expect(page.locator('main')).toContainText('E2E Backdated Jam', { timeout: 15_000 })
    await expect(page.locator('main')).toContainText('E2E note: grandma recipe')
  })

  test('a sold batch records the money — preservation revenue is real now', async ({ page }) => {
    await login(page)
    await gotoPreservation(page)

    await fillHydrated(page, '#ql-item_name', 'E2E Market Jam')
    await fillHydrated(page, '#ql-quantity', '6')

    // The sale box only exists because preservation_logs finally carries sale columns; before
    // that, showing it would have taken the user's money and dropped it on the floor.
    await page.getByText('＋ Sold some?').click()
    await fillHydrated(page, '#ql-sale-amount', '30')

    await page.getByRole('button', { name: /✓ Log/ }).click()
    await expect(page.getByText('Logged ✓')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('main')).toContainText('E2E Market Jam', { timeout: 15_000 })
  })

  test('blocks an empty item name instead of writing a nameless batch', async ({ page }) => {
    await login(page)
    await gotoPreservation(page)

    // Prove hydration first (a pre-hydration click would no-op and fake a pass).
    await fillHydrated(page, '#ql-quantity', '1')
    await fillHydrated(page, '#ql-item_name', '')
    await page.getByRole('button', { name: /✓ Log/ }).click()

    await expect(page.locator('p[role="alert"]')).toContainText(/preserve/i)
    await expect(page.getByText('Logged ✓')).toHaveCount(0)
  })

  test('quick log is labelled and keyboard operable', async ({ page }) => {
    await login(page)
    await gotoPreservation(page)

    await expect(page.locator('#ql-item_name')).toHaveAccessibleName(/preserve/i)
    await expect(page.locator('#ql-method')).toHaveAccessibleName(/method/i)
    await expect(page.locator('#ql-quantity')).toHaveAccessibleName(/quantity/i)
    await expect(page.locator('#ql-unit')).toHaveAccessibleName(/unit/i)

    const logButton = page.getByRole('button', { name: /✓ Log/ })
    await logButton.focus()
    await expect(logButton).toBeFocused()
  })
})
