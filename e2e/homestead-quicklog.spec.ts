import { test, expect } from '@playwright/test'

// Homestead QuickLog — the shared quick-add on each section page.
//
// Why this exists: the QuickLog and the AI log both write production through the ONE
// `save_log_entry` RPC. The failure mode when that path drifts is not a crash — it is a
// SILENT ZERO (the UI says "Logged ✓" and the number never reaches Reports/Intelligence).
// So this test asserts the row actually landed in history, not just that a toast appeared.
//
// Gated on env so CI (no creds) skips cleanly and stays green:
//   E2E_TEST_EMAIL / E2E_TEST_PASSWORD → a confirmed account with a livestock section.
//   E2E_TEST_EMAIL=... E2E_TEST_PASSWORD=... npm run test:e2e -- homestead-quicklog

const EMAIL = process.env.E2E_TEST_EMAIL
const PASSWORD = process.env.E2E_TEST_PASSWORD

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(EMAIL!)
  await page.locator('input[type="password"]').fill(PASSWORD!)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 })
}

// The QuickLog's inputs are React-controlled, so typing into them BEFORE hydration is
// silently discarded (React reclaims the DOM value on mount). Visible !== interactive.
// Retry the fill until the value survives — that round-trip is our hydration signal.
async function gotoLivestock(page: import('@playwright/test').Page) {
  await page.goto('/dashboard/homestead/livestock')
  await expect(page.locator('#ql-quantity')).toBeVisible({ timeout: 60_000 })
}

async function fillHydrated(page: import('@playwright/test').Page, selector: string, value: string) {
  await expect(async () => {
    await page.locator(selector).fill(value)
    await expect(page.locator(selector)).toHaveValue(value)
  }).toPass({ timeout: 60_000 })
}

test.describe('homestead quick log', () => {
  test.skip(!EMAIL || !PASSWORD, 'set E2E_TEST_EMAIL / E2E_TEST_PASSWORD to run')

  test('logs livestock production and it appears in history', async ({ page }) => {
    await login(page)
    await gotoLivestock(page)

    // A quantity no seeded row uses, so the history assertion can't pass on a pre-existing entry.
    const qty = '73'

    await page.locator('#ql-animal_type').selectOption({ index: 0 })
    await fillHydrated(page, '#ql-quantity', qty)
    await page.getByRole('button', { name: /✓ Log/ }).click()

    // 1. The user-visible confirmation.
    await expect(page.getByText('Logged ✓')).toBeVisible({ timeout: 30_000 })

    // 2. The row actually persisted — router.refresh() re-renders history from the DB.
    //    This is the assertion that catches a silent zero.
    await expect(page.locator('main')).toContainText(qty, { timeout: 15_000 })
  })

  test('quick log form is keyboard operable and labelled', async ({ page }) => {
    await login(page)
    await gotoLivestock(page)

    // Every control has an accessible name (WCAG AA — Dim 7).
    await expect(page.locator('#ql-animal_type')).toHaveAccessibleName(/animal/i)
    await expect(page.locator('#ql-quantity')).toHaveAccessibleName(/quantity/i)
    await expect(page.locator('#ql-unit')).toHaveAccessibleName(/unit/i)

    // The primary action is reachable and operable by keyboard.
    const logButton = page.getByRole('button', { name: /✓ Log/ })
    await logButton.focus()
    await expect(logButton).toBeFocused()
  })

  test('blocks an empty quantity instead of writing a null row', async ({ page }) => {
    await login(page)
    await gotoLivestock(page)

    // Prove hydration first (a pre-hydration click would no-op and fake a pass), then clear.
    await fillHydrated(page, '#ql-quantity', '1')
    await fillHydrated(page, '#ql-quantity', '')
    await page.getByRole('button', { name: /✓ Log/ }).click()

    // Scope to the form's own alert — Next injects a global role="alert" route announcer.
    await expect(page.locator('p[role="alert"]')).toContainText(/quantity/i)
    await expect(page.getByText('Logged ✓')).toHaveCount(0)
  })
})
