import { defineConfig, devices } from '@playwright/test'
import { loadEnvConfig } from '@next/env'

// Load .env.local the same way Next does, so the authenticated specs can read
// E2E_TEST_EMAIL / E2E_TEST_PASSWORD without them being typed on the command line
// (and therefore without landing in shell history). Playwright runs in plain Node and
// does NOT read .env.local on its own — without this the auth-gated specs silently skip,
// which looks identical to passing. @next/env ships with Next; no new dependency.
loadEnvConfig(process.cwd())

// E2E safety net (BUILD-BIBLE gap-audit P4). Two tiers of specs live under e2e/:
//   • *.smoke.spec.ts  — public pages, NO secrets needed. Runs in CI + locally.
//   • auth/billing/export — need real Supabase/Stripe; gated on E2E_TEST_* env,
//     skipped automatically when creds are absent (so CI stays green).
//
// Server: CI serves the prod build (`next start`, NEXT_PUBLIC_* already inlined at
// build time with placeholders); locally we use `next dev` so .env.local supplies
// real creds for the authenticated specs. Set E2E_BASE_URL to test a deployed URL
// (e.g. a Vercel preview) and no local server is started.

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000'
const useExternal = Boolean(process.env.E2E_BASE_URL)
const isCI = Boolean(process.env.CI)

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: useExternal
    ? undefined
    : {
        command: isCI ? 'npm run start' : 'npm run dev',
        url: baseURL,
        reuseExistingServer: !isCI,
        timeout: 120_000,
      },
})
