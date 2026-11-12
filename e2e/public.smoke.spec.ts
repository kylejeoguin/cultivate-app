import { test, expect } from '@playwright/test'

// Public-page smoke. NO secrets required — runs in CI and locally.
// Purpose: catch render/boot/prerender crashes that `tsc` and even `next build`
// can miss (a dynamic page that throws at request time still "builds"). Every
// check asserts a 200 AND real rendered content, so an error-boundary fallback
// or 500 fails the test.

async function expectOk(page: import('@playwright/test').Page, path: string) {
  const res = await page.goto(path, { waitUntil: 'domcontentloaded' })
  expect(res, `no response for ${path}`).not.toBeNull()
  expect(res!.status(), `${path} returned ${res!.status()}`).toBeLessThan(400)
}

test('home page renders hero + trial CTA', async ({ page }) => {
  await expectOk(page, '/')
  await expect(page).toHaveTitle(/Cultivate/i)
  await expect(page.getByText(/Start your free 7-day trial/i).first()).toBeVisible()
})

test('login page renders the sign-in form', async ({ page }) => {
  await expectOk(page, '/login')
  await expect(page.getByText(/Sign in to your account/i)).toBeVisible()
  await expect(page.locator('input[type="email"]')).toBeVisible()
  await expect(page.locator('input[type="password"]')).toBeVisible()
})

// The sign-in form must exist in the SERVER HTML, not just after hydration. `useSearchParams()`
// opts its Suspense boundary out of prerendering; when that hook sat in LoginForm, /login shipped
// an empty fallback and the form only appeared once JS ran. Assert on the raw response body so a
// future hook added to the form fails here instead of silently blanking the front door.
test('login form is server-rendered, not JS-only', async ({ request }) => {
  const html = await (await request.get('/login')).text()
  expect(html).toContain('Sign in to your account')
  expect(html).toContain('type="email"')
  expect(html).toContain('type="password"')
})

// ?reset=1 is read by <ResetNotice/>, the one piece deliberately left client-side.
test('login shows the password-updated notice after a reset', async ({ page }) => {
  await expectOk(page, '/login?reset=1')
  await expect(page.getByText(/Password updated\. Sign in with your new password\./i)).toBeVisible()
  // And it must NOT show on a plain visit.
  await expectOk(page, '/login')
  await expect(page.getByText(/Password updated/i)).toHaveCount(0)
})

test('signup page renders the create-account form', async ({ page }) => {
  await expectOk(page, '/signup')
  await expect(page.getByText(/Create your account/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /Start free trial/i })).toBeVisible()
})

test('pricing page renders both plans', async ({ page }) => {
  await expectOk(page, '/pricing')
  await expect(page.getByText(/Individual/i).first()).toBeVisible()
  await expect(page.getByText(/Family/i).first()).toBeVisible()
})

test('legal pages render', async ({ page }) => {
  await expectOk(page, '/privacy')
  await expect(page.getByText(/privacy/i).first()).toBeVisible()
  await expectOk(page, '/terms')
  await expect(page.getByText(/terms/i).first()).toBeVisible()
})

test('state-requirements hub + a state page render (SSG + liability disclaimer)', async ({ page }) => {
  await expectOk(page, '/state-requirements')
  // A specific SSG state page — proves generateStaticParams output renders
  // and the standing liability disclaimer is present (compliance rule).
  await expectOk(page, '/state-requirements/missouri')
  await expect(page.getByRole('heading', { level: 1, name: /Missouri Homeschool Requirements/i })).toBeVisible()
  await expect(page.getByText(/not legal advice/i).first()).toBeVisible()
})

// Security regression guard (no secrets needed). Locks in the 2026-06-28
// denial-of-wallet fix: unauthenticated callers must NOT reach the AI endpoints
// or the data export. If any of these ever returns 200 to an anon request, the
// auth guard regressed — fail loudly.
test('protected endpoints reject unauthenticated requests', async ({ request }) => {
  const exportRes = await request.get('/api/export')
  expect(exportRes.status(), '/api/export must require auth').toBe(401)

  for (const path of ['/api/spark', '/api/route-log', '/api/tag-subjects']) {
    const res = await request.post(path, { data: {} })
    expect(res.status(), `${path} must reject anon (denial-of-wallet guard)`).toBe(401)
  }
})
