import { test, expect } from '@playwright/test'

// The universal log must never guess WHICH child a school record belongs to.
//
// The save path used to fall back to `childList[0]` whenever the AI resolved no child name —
// silently writing hours and attendance onto one kid's compliance record off nothing but array
// order. For a multi-child family that is a wrong record handed to a state evaluator.
//
// This drives the real AI log, so it costs a Haiku call and needs ANTHROPIC_API_KEY on the
// server. Gated on creds so CI skips cleanly:
//   E2E_TEST_EMAIL=... E2E_TEST_PASSWORD=... npm run test:e2e -- log-child-gate

const EMAIL = process.env.E2E_TEST_EMAIL
const PASSWORD = process.env.E2E_TEST_PASSWORD

test.describe('universal log — child attribution', () => {
  test.skip(!EMAIL || !PASSWORD, 'set E2E_TEST_EMAIL / E2E_TEST_PASSWORD to run')

  test('a school event with no child cannot be saved until one is picked', async ({ page }) => {
    await page.goto('/login')
    await page.locator('input[type="email"]').fill(EMAIL!)
    await page.locator('input[type="password"]').fill(PASSWORD!)
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 })

    await page.goto('/dashboard/log')
    const box = page.locator('textarea').first()
    // Controlled input: a fill before hydration is silently discarded. Retry until it sticks.
    await expect(async () => {
      await box.fill('Did some math today.')
      await expect(box).toHaveValue(/math/)
    }).toPass({ timeout: 60_000 })

    await page.getByRole('button', { name: /review|next|continue/i }).first().click()
    await expect(page.getByText('School record')).toBeVisible({ timeout: 60_000 })

    // Reach the no-child state deterministically: the model may or may not name someone
    // for a given phrasing, so clear whatever it picked rather than assuming.
    const pressed = page.locator('button[aria-pressed="true"]')
    for (let i = await pressed.count(); i > 0; i--) await pressed.first().click()
    await expect(page.locator('button[aria-pressed="true"]')).toHaveCount(0)

    // No child → we say so, and we refuse to save.
    await expect(page.getByText(/Who did this\?/i)).toBeVisible({ timeout: 10_000 })
    const confirm = page.getByRole('button', { name: /Confirm & save/i })
    await expect(confirm, 'a school event with no child must not be saveable').toBeDisabled()

    // Pick one and the gate opens.
    await page.getByRole('button', { name: /^Aaron/ }).first().click()
    await expect(confirm).toBeEnabled({ timeout: 10_000 })
  })
})
