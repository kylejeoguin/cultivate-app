import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Accessibility scan (BUILD-BIBLE Dim 7). Public pages need no secrets, so this runs in CI.
//
// WHY IT EXISTS: the DoD asks for "axe scan passes on key pages in CI (no serious/critical
// violations)" and axe was not wired anywhere — it appeared only as a transitive dependency in
// the lockfile. For a paid SaaS holding family data, WCAG 2.x AA is the floor, and the standing
// note in the project memory is that the ADA/WCAG exposure is live.
//
// Scope is deliberately WCAG 2.0/2.1 A and AA, which is the benchmark courts treat as the de
// facto standard. Automated scanning catches only a subset of real failures — this is necessary,
// not sufficient, and does not replace a keyboard walk.

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

/** Pages a stranger can reach, which is where the legal exposure actually is. */
const PUBLIC_PAGES = [
  ['home', '/'],
  ['try', '/try'],
  ['pricing', '/pricing'],
  ['signup', '/signup'],
  ['login', '/login'],
  ['state requirements hub', '/state-requirements'],
  ['a state page', '/state-requirements/missouri'],
  ['free worksheets', '/free-worksheets'],
]

for (const [name, path] of PUBLIC_PAGES) {
  test(`a11y: ${name}`, async ({ page }) => {
    await page.route('**/api/track', (r) => r.abort())
    await page.goto(path, { waitUntil: 'domcontentloaded' })

    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze()

    // Report EVERYTHING, then fail only on serious/critical. Minor/moderate findings are printed
    // so they stay visible rather than being silently tolerated — a gap you cannot see is a gap
    // nobody fixes.
    const bySeverity = (impact: string) => results.violations.filter((v) => v.impact === impact)
    const serious = [...bySeverity('critical'), ...bySeverity('serious')]
    const lesser = [...bySeverity('moderate'), ...bySeverity('minor')]

    if (lesser.length) {
      console.log(`[${name}] ${lesser.length} moderate/minor:`)
      for (const v of lesser) console.log(`   ${v.impact} · ${v.id} · ${v.nodes.length} node(s) — ${v.help}`)
    }

    if (serious.length) {
      console.log(`[${name}] SERIOUS:`)
      for (const v of serious) {
        for (const n of v.nodes.slice(0, 6)) {
          // failureSummary carries the measured ratio and the actual colours, which is the
          // difference between fixing the real element and guessing at a class name.
          console.log(`   ${v.id} @ ${n.target.join(' ')}`)
          console.log(`      ${(n.failureSummary ?? '').replace(/\n/g, ' | ')}`)
        }
      }
    }

    const detail = serious
      .map((v) => `${v.impact} · ${v.id} — ${v.help}\n      ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join('\n      ')}`)
      .join('\n  ')

    expect(serious, `serious/critical a11y violations on ${path}:\n  ${detail}`).toEqual([])
  })
}
