import { test, expect } from '@playwright/test'

// Garden QuickLog — the routine harvest, logged against a specific open planting.
//
// Why this exists: a harvest UPDATES the planting row rather than inserting a new one. The
// failure mode isn't a crash, it's a quiet data lie — a twin row that leaves the planting
// open forever, inflates the yield, and drags the success rate. So these tests assert the
// crop LEAVES the open list and its yield shows up on the harvested card, not just that a
// "Logged ✓" toast appeared.
//
// Gated on env so CI (no creds) skips cleanly and stays green:
//   E2E_TEST_EMAIL=... E2E_TEST_PASSWORD=... npm run test:e2e -- garden-quicklog

const EMAIL = process.env.E2E_TEST_EMAIL
const PASSWORD = process.env.E2E_TEST_PASSWORD

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(EMAIL!)
  await page.locator('input[type="password"]').fill(PASSWORD!)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 })
}

async function gotoGarden(page: import('@playwright/test').Page) {
  await page.goto('/dashboard/homestead/garden')
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

test.describe('garden quick log', () => {
  test.skip(!EMAIL || !PASSWORD, 'set E2E_TEST_EMAIL / E2E_TEST_PASSWORD to run')

  test('harvests an open planting: it closes that row, no twin', async ({ page }) => {
    await login(page)
    await gotoGarden(page)

    // Read the crop we're about to harvest off the dropdown's first option.
    const cropLabel = await page.locator('#ql-garden_entry_id option').first().textContent()
    const crop = (cropLabel ?? '').split(' — ')[0].trim()
    expect(crop.length).toBeGreaterThan(0)

    const openBefore = await page.locator('#ql-garden_entry_id option').count()

    // A yield no seeded row uses, so the assertion can't pass on pre-existing data.
    const qty = '87'
    await page.locator('#ql-garden_entry_id').selectOption({ index: 0 })
    await fillHydrated(page, '#ql-quantity', qty)
    await page.getByRole('button', { name: /✓ Log/ }).click()

    await expect(page.getByText('Logged ✓')).toBeVisible({ timeout: 30_000 })

    // The yield reached the DB and came back through router.refresh(). Catches a silent zero.
    await expect(page.locator('main')).toContainText(qty, { timeout: 15_000 })

    // The planting CLOSED: it's gone from the open-harvest dropdown. If a twin row had been
    // inserted instead of the planting being updated, the original would still be open here.
    await expect(async () => {
      const openAfter = await page.locator('#ql-garden_entry_id option').count()
      expect(openAfter).toBe(openBefore - 1)
    }).toPass({ timeout: 15_000 })
  })

  test('blocks an empty harvest amount instead of writing a null yield', async ({ page }) => {
    await login(page)
    await gotoGarden(page)

    // Prove hydration first (a pre-hydration click would no-op and fake a pass), then clear.
    await fillHydrated(page, '#ql-quantity', '1')
    await fillHydrated(page, '#ql-quantity', '')
    await page.getByRole('button', { name: /✓ Log/ }).click()

    await expect(page.locator('p[role="alert"]')).toContainText(/harvest/i)
    await expect(page.getByText('Logged ✓')).toHaveCount(0)
  })

  test('quick log is labelled and keyboard operable', async ({ page }) => {
    await login(page)
    await gotoGarden(page)

    await expect(page.locator('#ql-garden_entry_id')).toHaveAccessibleName(/crop/i)
    await expect(page.locator('#ql-quantity')).toHaveAccessibleName(/harvested/i)
    await expect(page.locator('#ql-unit')).toHaveAccessibleName(/unit/i)

    const logButton = page.getByRole('button', { name: /✓ Log/ })
    await logButton.focus()
    await expect(logButton).toBeFocused()
  })
})
