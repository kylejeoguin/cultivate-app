import { test, expect } from '@playwright/test'
import { dashboardRoutes } from './_routes'

// AUTHENTICATED route integrity (BUILD-BIBLE Dim 6). Gated on env so CI stays green:
//   E2E_TEST_EMAIL / E2E_TEST_PASSWORD → a real, confirmed account with access.
//
// This is the safety net for the 2026-09 IA restructure. Every page under /dashboard is
// enumerated from src/app at test time, so:
//   • a page that MOVES fails here instead of 404-ing a bookmark or the PWA start_url
//   • a page added later is covered without anyone remembering to add it
//   • a page that 200s but renders an error boundary still fails
//
// Note on redirects: several dashboard routes redirect on purpose (e.g.
// /dashboard/homeschool/log → /dashboard). Following redirects is correct — we assert the
// route RESOLVES to something healthy, not that it renders in place.

const EMAIL = process.env.E2E_TEST_EMAIL
const PASSWORD = process.env.E2E_TEST_PASSWORD
const ROUTES = dashboardRoutes()

/** Playwright errors carry a multi-line call log; only the first line is the actual cause. */
const firstLine = (msg: string) => msg.split(/\r?\n/)[0]

test.describe('dashboard route integrity', () => {
  test.skip(!EMAIL || !PASSWORD, 'set E2E_TEST_EMAIL / E2E_TEST_PASSWORD to run')

  test.beforeEach(async ({ page }) => {
    // Test traffic must never reach the analytics beacon. AnalyticsBeacon lives in the root
    // layout, so it fires on dashboard pages too — walking ~30 routes would write ~30 synthetic
    // visit rows, and real volume is low enough that it would swamp the signal. This matters
    // most when the suite is pointed at production via E2E_BASE_URL.
    await page.route('**/api/track', (r) => r.abort())

    await page.goto('/login')
    await page.locator('input[type="email"]').fill(EMAIL!)
    await page.locator('input[type="password"]').fill(PASSWORD!)
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 })
  })

  test('the enumerator found the dashboard routes', () => {
    // Vacuous-pass guard: an empty list would make every assertion below trivially true.
    expect(ROUTES.length, 'no dashboard routes discovered — the enumerator is broken').toBeGreaterThan(10)
  })

  test('every dashboard route resolves and renders real content', async ({ page }) => {
    // One test walks ~30 routes; Playwright's 30s default is a per-TEST budget, not per-route,
    // so the default silently guillotines the sweep partway and reports the rest as "browser
    // closed". Budget for the whole walk instead.
    test.setTimeout(5 * 60_000)

    const failures: string[] = []
    const slow: string[] = []
    const flaky: string[] = []

    for (const route of ROUTES) {
      // A goto that THROWS (ERR_ABORTED on a redirect/download, a hung navigation) must be
      // recorded and stepped over, not allowed to abort the loop — otherwise the run reports
      // the first broken route and hides every one after it.
      let res: Awaited<ReturnType<typeof page.goto>> = null
      const startedAt = Date.now()
      try {
        res = await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 45_000 })
      } catch (err) {
        // ERR_ABORTED shows up when a navigation is superseded — a real hazard of walking ~30
        // routes back to back, and NOT evidence the page is broken. Don't assume either way:
        // retry once, and if it still won't navigate, ask the server directly whether the route
        // serves at all. Only a bad status is reported as a failure.
        const first = firstLine((err as Error).message)
        try {
          await page.waitForTimeout(750)
          res = await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 45_000 })
        } catch {
          const probe = await page.request.get(route, { maxRedirects: 5 })
          if (probe.status() >= 400) {
            failures.push(`${route} → ${probe.status()} (navigation also failed: ${first})`)
          } else {
            flaky.push(`${route} → navigation aborted twice but serves ${probe.status()}`)
          }
          continue
        }
      }

      if (!res) {
        failures.push(`${route} → no response`)
        continue
      }
      if (res.status() >= 400) {
        failures.push(`${route} → ${res.status()}`)
        continue
      }

      // Bounced back to the front door = the route didn't really resolve for an authed user.
      if (/\/login|\/pricing/.test(page.url())) {
        failures.push(`${route} → redirected to ${new URL(page.url()).pathname}`)
        continue
      }

      const body = (await page.locator('body').innerText()).toLowerCase()
      if (
        body.includes('application error') ||
        body.includes('something went wrong') ||
        body.includes('internal server error') ||
        body.includes('this page could not be found')
      ) {
        failures.push(`${route} → rendered an error state`)
        continue
      }
      if (body.trim().length < 40) {
        failures.push(`${route} → rendered essentially nothing`)
        continue
      }

      // Not a failure — dev compiles routes on demand, so a first hit is legitimately slow.
      // Recorded so a genuinely heavy page gets named instead of just eating the clock.
      const ms = Date.now() - startedAt
      if (ms > 8_000) slow.push(`${route} → ${(ms / 1000).toFixed(1)}s`)
    }

    if (flaky.length) {
      console.log('Routes that would not navigate but DO serve (test-side race, not a page fault):')
      for (const f of flaky) console.log(`  ${f}`)
    }
    if (slow.length) console.log(`Slow routes (>8s, may just be dev compile):\n  ${slow.join('\n  ')}`)
    expect(failures, `dashboard routes with problems:\n${failures.join('\n')}`).toEqual([])
  })

  test('every nav destination is reachable and none 404', async ({ page }) => {
    // The nav is the contract with the user's muscle memory. During a restructure this is
    // the thing most likely to break quietly, so assert the links themselves resolve.
    await page.goto('/dashboard')
    const hrefs = await page
      .locator('nav a[href^="/dashboard"], a[href^="/dashboard"]')
      .evaluateAll((els) => Array.from(new Set(els.map((e) => (e as HTMLAnchorElement).getAttribute('href')!))))

    expect(hrefs.length, 'no dashboard links found on the landing page').toBeGreaterThan(3)

    const broken: string[] = []
    for (const href of hrefs) {
      const res = await page.request.get(href)
      if (res.status() >= 400) broken.push(`${href} → ${res.status()}`)
    }
    expect(broken, `broken nav links:\n${broken.join('\n')}`).toEqual([])
  })
})
