import { test, expect } from '@playwright/test'

// The worksheet library's access gate.
//
// The failure mode here is not a crash — it's giving away the paid product. 184 of the 206
// sheets are subscriber-tier. Before the gated route existed, ResourcesClient rendered a raw
// `<a href={file_url}>` with no tier check, and RLS hands every authenticated user every active
// row. So these tests assert on the ROUTE's status code, not on whether a badge renders.
//
// The signed-out cases need no credentials and run in CI. The signed-in case is env-gated:
//   E2E_TEST_EMAIL=... E2E_TEST_PASSWORD=... npm run test:e2e -- resources-gate

const EMAIL = process.env.E2E_TEST_EMAIL
const PASSWORD = process.env.E2E_TEST_PASSWORD

test.describe('worksheet library — public surface', () => {
  test('the free-worksheets lead magnet is reachable without an account', async ({ page }) => {
    const res = await page.goto('/free-worksheets', { waitUntil: 'domcontentloaded' })
    expect(res?.status()).toBeLessThan(400)
    await expect(page.getByRole('heading', { name: /free pre-writing worksheets/i })).toBeVisible()
    await expect(page.locator('#fw-email')).toBeVisible()
  })

  test('the lead magnet page is server-rendered for crawlers', async ({ request }) => {
    // Pinterest and Google must see the copy without running JS. Reading ?source= with
    // useSearchParams() would blank this page the way it blanked /login.
    const html = await (await request.get('/free-worksheets')).text()
    expect(html).toContain('Free pre-writing worksheets')
    expect(html).toContain('id="fw-email"')
  })

  test('the free pack requires an email, and never serves another pack', async ({ request }) => {
    const bad = await request.post('/api/free-worksheets', { data: { email: 'not-an-email' } })
    expect(bad.status(), 'invalid email must be rejected').toBe(400)

    // The route hardcodes ONE object. A caller must not be able to name a different pack.
    const injected = await request.post('/api/free-worksheets', {
      data: { email: 'e2e@example.test', file: 'packs/alphabet-activity.zip', id: 'x' },
    })
    const body = await injected.json()
    if (injected.ok()) {
      expect(body.url, 'signed URL must point at the free pack only').toContain('prewriting')
      expect(body.url).not.toContain('alphabet')
      expect(body.url).not.toContain('numbers')
    }
  })

  test('a signed-out visitor cannot download any resource', async ({ request }) => {
    // Unknown id → 404, not a hint about what exists.
    const missing = await request.get('/api/resources/00000000-0000-0000-0000-000000000000/download', {
      maxRedirects: 0,
    })
    expect([401, 404]).toContain(missing.status())
  })
})

test.describe('worksheet library — signed in', () => {
  test.skip(!EMAIL || !PASSWORD, 'set E2E_TEST_EMAIL / E2E_TEST_PASSWORD to run')

  test('resources page lists the packs and never leaks a storage path', async ({ page }) => {
    await page.goto('/login')
    await page.locator('input[type="email"]').fill(EMAIL!)
    await page.locator('input[type="password"]').fill(PASSWORD!)
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 })

    await page.goto('/dashboard/resources')
    await expect(page.getByText('Pre-Writing Practice')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Alphabet Activity Sheets')).toBeVisible()

    // `file_url` must never reach the browser: the object path is a server-side detail, and
    // shipping it hands a trial user the key to every gated pack.
    const html = await page.content()
    expect(html, 'storage object path leaked to the client').not.toContain('packs/')

    // Every download button points at the gated route, not at storage.
    const hrefs = await page.locator('a[href*="/download"]').evaluateAll(els =>
      els.map(e => (e as HTMLAnchorElement).getAttribute('href') ?? '')
    )
    expect(hrefs.length).toBeGreaterThan(0)
    for (const h of hrefs) expect(h).toMatch(/^\/api\/resources\/[0-9a-f-]+\/download$/)
  })
})
