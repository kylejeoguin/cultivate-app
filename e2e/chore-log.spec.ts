import { test, expect } from '@playwright/test'

/**
 * The chore path through the universal log, end to end: typed sentence → router → chip →
 * confirm → a completion written and the schedule advanced.
 *
 * WHY A BROWSER TEST AND NOT ONLY pgTAP: the database half is covered by
 * supabase/tests/database/save_log_entry_chores.test.sql, but that suite has not run since
 * 2026-07-28 (migrations build only a fraction of prod's tables). More importantly, three of the
 * four ways this feature can break are NOT in the database:
 *   1. the router prompt not routing "cleaned the coop" to chores at all — it used to be told to
 *      DROP such an event from the events array entirely, because chores had no destination;
 *   2. the chore list never reaching the form, so the chip cannot render;
 *   3. the chip rendering but the payload omitting `chore`, so Confirm saves a day and silently
 *      does nothing to the chore.
 * Each of those passes every unit test in the repo. Only this covers them.
 *
 * REQUIRES: E2E_DEMO_EMAIL / E2E_DEMO_PASSWORD, and a server with ANTHROPIC_API_KEY set (the
 * routing call is real — this costs a few cents of Haiku per run and is not free CI). Skips
 * with a stated reason rather than passing vacuously when either is missing.
 */

const EMAIL = process.env.E2E_DEMO_EMAIL
const PASSWORD = process.env.E2E_DEMO_PASSWORD

// The chore this expects on the demo account. If it is renamed, this test must be updated —
// better a loud failure than a test that quietly stops asserting anything.
const CHORE = 'Clean the coop'

test.describe('chore completion through the universal log', () => {
  test.skip(!EMAIL || !PASSWORD, 'needs E2E_DEMO_EMAIL / E2E_DEMO_PASSWORD (demo account)')

  test('a typed chore is routed, named on the chip, and saved', async ({ page }) => {
    // A real model round-trip sits in the middle of this; the default 30s is not enough.
    test.setTimeout(5 * 60_000)
    await page.route('**/api/track', (r) => r.abort())

    await page.goto('/login')
    await page.locator('input[type="email"]').fill(EMAIL!)
    await page.locator('input[type="password"]').fill(PASSWORD!)
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForURL(/\/dashboard/, { timeout: 60_000 })

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

    // Fill until the button actually enables. The button is disabled until React sees the text,
    // and on production the page paints fast enough that a single fill can land BEFORE hydration
    // — the characters are in the box, React's state is empty, and the button never enables. This
    // failed on prod while passing locally for exactly that reason. Re-filling is the fix; do not
    // replace it with a fixed wait.
    const box = page.getByRole('textbox', { name: /describe your day/i })
    const review = page.getByRole('button', { name: /review & confirm/i })
    await box.waitFor({ state: 'visible', timeout: 30_000 })
    await expect.poll(
      async () => {
        await box.fill('Cleaned out the chicken coop this morning')
        return review.isEnabled()
      },
      { timeout: 60_000, intervals: [300, 500, 1000] },
    ).toBe(true)
    await review.click()

    // If the AI key is missing server-side the endpoint 500s and the form says so. That is an
    // environment problem, not a regression — name it instead of failing on a missing chip.
    const apiDown = page.getByText(/couldn.t read that into events|briefly at capacity/i)
    const chip = page.getByRole('button', { name: new RegExp(CHORE, 'i') })
    await expect(apiDown.or(chip).first()).toBeVisible({ timeout: 150_000 })
    if (await apiDown.isVisible()) {
      test.skip(true, 'route-log is unavailable on this server (ANTHROPIC_API_KEY not set) — not a regression')
    }

    // The chip must NAME the chore. Confirming moves a due date; "Chores ✓" would not say which.
    await expect(chip).toBeVisible()
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText(/chore done/i)).toBeVisible()

    await page.getByRole('button', { name: /confirm & save/i }).click()
    await expect(page.getByText(/saved|logged/i).first()).toBeVisible({ timeout: 60_000 })

    // The completion is idempotent per chore per date, so re-running this on the same day is safe
    // and the assertion below holds on every run: the chore is no longer due today.
    await page.goto('/dashboard/homestead/chores', { waitUntil: 'domcontentloaded' })
    const row = page.getByText(CHORE, { exact: false }).first()
    await expect(row).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(/overdue/i)).toHaveCount(0)
  })
})
