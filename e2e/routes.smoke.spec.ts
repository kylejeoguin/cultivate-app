import { test, expect } from '@playwright/test'
import { publicRoutes, uncoveredDynamicRoutes } from './_routes'

// PUBLIC route integrity. NO secrets needed — runs in CI.
//
// Purpose (BUILD-BIBLE Dim 6): prove every public page still resolves. `tsc` and
// `next build` both pass for a page that throws at request time, and neither notices
// a route that MOVED — which is exactly the failure mode of an IA restructure. This
// is the net that makes moving things safe.
//
// The route list is derived from src/app at test time (see _routes.ts), so a new page
// is covered automatically and a renamed one fails here instead of in someone's inbox.

const ROUTES = publicRoutes()

test('the route enumerator actually found routes', () => {
  // Guard against the vacuous pass: if the walk breaks, every other test in this file
  // would trivially "succeed" over an empty list. Fail loudly instead.
  expect(ROUTES.length, 'no public routes discovered — the enumerator is broken').toBeGreaterThan(5)
})

test('every public route responds without a server error', async ({ request }) => {
  test.setTimeout(2 * 60_000)

  const failures: string[] = []
  const retried: string[] = []
  for (const route of ROUTES) {
    let res = await request.get(route, { maxRedirects: 5 })

    // Against `next dev` the server compiles routes on demand, so a request that lands
    // mid-rebuild can 500 once and be perfectly healthy a second later — especially right
    // after an edit. A real failure fails twice; a compile race does not. (Confirmed: a
    // /state-requirements/missouri 500 seen immediately after an 8-file change returned 200
    // three times in a row on a settled server.)
    if (res.status() >= 500) {
      const firstStatus = res.status()
      await new Promise((r) => setTimeout(r, 1500))
      res = await request.get(route, { maxRedirects: 5 })
      // Named, not silently forgiven — a route that only works on the second try is worth
      // knowing about even when the retry rescues the run.
      if (res.status() < 400) retried.push(`${route} → ${firstStatus} first, then ${res.status()}`)
    }

    if (res.status() >= 400) failures.push(`${route} → ${res.status()}`)
  }

  if (retried.length) {
    console.log('Routes that returned 5xx once and then recovered (dev compile race, or genuinely flaky):')
    for (const r of retried) console.log(`  ${r}`)
  }
  expect(failures, `public routes returning >=400:\n${failures.join('\n')}`).toEqual([])
})

test('no public route renders an error boundary', async ({ page }) => {
  // Never let test traffic reach the analytics beacon. Cultivate's real visit numbers are
  // small enough that ~60 synthetic page loads per run would swamp the signal, and this
  // suite is meant to be safe to point at production.
  await page.route('**/api/track', (r) => r.abort())

  const failures: string[] = []
  for (const route of ROUTES) {
    await page.goto(route, { waitUntil: 'domcontentloaded' })
    const body = (await page.locator('body').innerText()).toLowerCase()
    // Next's default error UIs + our own fallbacks. A page that 200s but renders
    // "something went wrong" is still broken.
    if (
      body.includes('application error') ||
      body.includes('something went wrong') ||
      body.includes('internal server error') ||
      body.includes('this page could not be found')
    ) {
      failures.push(route)
    }
  }
  expect(failures, `public routes rendering an error state:\n${failures.join('\n')}`).toEqual([])
})

test('reports which dynamic routes this suite does not cover', () => {
  const uncovered = uncoveredDynamicRoutes()
  // Not a failure — a visible ledger. If this list grows, someone added a dynamic
  // route with no test value and should add one to DYNAMIC_SUBSTITUTIONS.
  console.log(
    uncovered.length
      ? `Dynamic routes without a test substitution (uncovered):\n  ${uncovered.join('\n  ')}`
      : 'All dynamic routes have a test substitution.',
  )
  expect(Array.isArray(uncovered)).toBe(true)
})
