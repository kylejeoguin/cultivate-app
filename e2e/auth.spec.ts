import { test, expect } from '@playwright/test'

// Authenticated flows — need a REAL, already-confirmed Supabase user.
// Gated on env so CI (no creds) skips cleanly and stays green:
//   E2E_TEST_EMAIL / E2E_TEST_PASSWORD  → a throwaway confirmed account.
// Run locally against `next dev` (.env.local supplies the live Supabase keys):
//   E2E_TEST_EMAIL=you@test.dev E2E_TEST_PASSWORD=... npm run test:e2e -- auth
//
// NOTE: full signup→trial is intentionally NOT automated here — it requires
// clicking an emailed confirmation link. Use a pre-confirmed test user instead
// (create once via Supabase dashboard or admin API). Billing-portal coverage is
// a TODO: it needs a Stripe test customer attached to the test user.

const EMAIL = process.env.E2E_TEST_EMAIL
const PASSWORD = process.env.E2E_TEST_PASSWORD

test.describe('authenticated user', () => {
  test.skip(!EMAIL || !PASSWORD, 'set E2E_TEST_EMAIL / E2E_TEST_PASSWORD to run')

  test('can log in and reach the dashboard', async ({ page }) => {
    await page.goto('/login')
    await page.locator('input[type="email"]').fill(EMAIL!)
    await page.locator('input[type="password"]').fill(PASSWORD!)
    await page.getByRole('button', { name: /sign in/i }).click()

    // New accounts with no children bounce to onboarding — accept either.
    await page.waitForURL(/\/dashboard(\/onboarding)?/, { timeout: 30_000 })
    expect(page.url()).toMatch(/\/dashboard/)
  })

  test('can export their data as JSON', async ({ page }) => {
    // Establish a session first.
    await page.goto('/login')
    await page.locator('input[type="email"]').fill(EMAIL!)
    await page.locator('input[type="password"]').fill(PASSWORD!)
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 })

    // The request shares the browser session cookies.
    const res = await page.request.get('/api/export')
    expect(res.status(), '/api/export should succeed for an authed user').toBe(200)
    const body = await res.json()
    expect(body, 'export should be a JSON object').toBeTruthy()
  })
})
