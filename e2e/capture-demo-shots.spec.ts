import { test, expect, type Locator, type Page } from '@playwright/test'

/**
 * Re-captures the product screenshots on /try (public/demo/*.png). NOT a test — a tool. It is
 * skipped unless CAPTURE_DEMO=1 so it never runs in the normal suite.
 *
 *   CAPTURE_DEMO=1 npx playwright test capture-demo-shots
 *
 * WHY THIS EXISTS: the first set was shot by hand and it showed. Every one had a sliver of the
 * sidebar down the left edge, the content column sitting off-centre with dead space beside it,
 * and report.png was cut off mid-word on the right. Ad-hoc captures drift like that every time,
 * and these are the only pictures of the product a visitor sees before deciding to hand over a
 * card. So the framing is code now:
 *
 *   • Crop to <main> — the centred content column. The sidebar and the floating feedback button
 *     are outside it by construction, so they cannot creep back in.
 *   • Cut the bottom edge in the GAP between two cards, never through one. Fixed heights slice
 *     a card in half the moment any content changes.
 *   • deviceScaleFactor 2, so it isn't soft on a retina screen.
 *
 * REQUIRES E2E_DEMO_EMAIL / E2E_DEMO_PASSWORD (the seeded demo family — see memory
 * reference_cultivate_demo_account). The shots are of an example account by design; the /try page
 * says so beneath them.
 */

const EMAIL = process.env.E2E_DEMO_EMAIL
const PASSWORD = process.env.E2E_DEMO_PASSWORD

// 1000px wide, deliberately. The reports page widens its column to max-w-4xl at the `lg`
// breakpoint (1024px) while history and attendance stay at max-w-2xl. Shooting above 1024 gave
// three images of two different widths, so on /try the report rendered at a visibly different
// scale to the other two — the kind of mismatch that reads as unpolished without being obvious.
// Below `lg`, all three content columns are 672px and the set is consistent.
// deviceScaleFactor 2 so the result is not soft on a retina screen.
test.use({ viewport: { width: 1000, height: 1200 }, deviceScaleFactor: 2 })

/**
 * Screenshot the content column, ending at a card boundary at or before `maxHeight`.
 *
 * Cutting at a flat maxHeight is what produces the half-a-card bottom edge that reads as sloppy.
 * Instead, collect the bottom edge of every card and section inside <main>, and cut at the lowest
 * one that still fits. `minFill` stops it from choosing a very early boundary and returning a
 * stub — if nothing lands in the acceptable band, fall back to the flat height.
 */
async function shootContent(
  page: Page,
  path: string,
  opts: { maxHeight: number; minFill?: number },
) {
  const main = page.locator('main')
  await expect(main).toBeVisible()
  const box = await main.boundingBox()
  if (!box) throw new Error('main has no box — the page did not render')

  const { maxHeight, minFill = 0.55 } = opts
  const cut = await main.evaluate((el, { maxHeight, minFill }) => {
    const top = el.getBoundingClientRect().top
    const all = Array.from(el.querySelectorAll('*'))

    // A box the eye can see: it has a background or a border. Cutting through one of these is
    // what reads as sloppy — a card sliced in half. Cutting through a transparent layout wrapper
    // is invisible, so those must NOT veto a candidate or nothing would ever qualify.
    const boxes = all
      .map(n => {
        const cs = getComputedStyle(n)
        const painted =
          (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') ||
          parseFloat(cs.borderTopWidth) > 0 ||
          parseFloat(cs.borderBottomWidth) > 0 ||
          // A leaf that carries text: slicing a line of type looks just as bad as slicing a card.
          (n.children.length === 0 && (n.textContent ?? '').trim().length > 0)
        const r = n.getBoundingClientRect()
        return painted ? { top: r.top - top, bottom: r.bottom - top } : null
      })
      .filter((b): b is { top: number; bottom: number } => b !== null)

    const candidates = Array.from(new Set(boxes.map(b => Math.round(b.bottom))))
      .filter(b => b > 0 && b <= maxHeight)
      .sort((a, b) => b - a)

    const clean = candidates.find(c => !boxes.some(b => b.top < c - 1 && b.bottom > c + 1))
    if (!clean || clean < maxHeight * minFill) return maxHeight

    // Breathing room below the last card — but never more than the gap itself, or the shot ends
    // on a 2px sliver of the NEXT card, which looks like a mistake rather than an edge.
    const nextTop = Math.min(...boxes.map(b => b.top).filter(t => t > clean + 1), Infinity)
    const pad = Number.isFinite(nextTop) ? Math.max(0, Math.min(24, nextTop - clean - 3)) : 24
    return Math.round(clean + pad)
  }, { maxHeight, minFill })

  await page.screenshot({
    path,
    fullPage: true,
    clip: { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: cut },
  })
  return cut
}

test.describe('capture /try product screenshots', () => {
  test.skip(process.env.CAPTURE_DEMO !== '1', 'set CAPTURE_DEMO=1 to re-shoot public/demo/*.png')
  test.skip(!EMAIL || !PASSWORD, 'needs E2E_DEMO_EMAIL / E2E_DEMO_PASSWORD (demo account)')

  test('re-shoot history, report, and attendance', async ({ page }) => {
    test.setTimeout(5 * 60_000)
    await page.route('**/api/track', (r) => r.abort())

    await page.goto('/login')
    await page.locator('input[type="email"]').fill(EMAIL!)
    await page.locator('input[type="password"]').fill(PASSWORD!)
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForURL(/\/dashboard/, { timeout: 60_000 })

    // The floating feedback bubble is app furniture, not product. It sat in the corner of the old
    // report.png. Kill it for every capture in this run.
    await page.addInitScript(() => {
      const css = document.createElement('style')
      css.textContent = '[class*="fixed"][class*="bottom-"]{display:none !important}'
      document.addEventListener('DOMContentLoaded', () => document.head.appendChild(css))
    })

    const settle = async (marker: Locator) => {
      await expect(marker).toBeVisible({ timeout: 30_000 })
      // Let webfonts and the CSS transitions on cards land before the shutter.
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(400)
    }

    // ── 1. Log history ────────────────────────────────────────────────────────
    await page.goto('/dashboard/homeschool/history', { waitUntil: 'domcontentloaded' })
    await settle(page.getByText(/days logged/i).first())
    const h = await shootContent(page, 'public/demo/history.png', { maxHeight: 900 })

    // ── 2. Year-to-date report ────────────────────────────────────────────────
    await page.goto('/dashboard/homeschool/reports', { waitUntil: 'domcontentloaded' })
    await settle(page.getByText(/days present/i).first())
    const r = await shootContent(page, 'public/demo/report.png', { maxHeight: 1000 })

    // ── 3. Attendance calendar ────────────────────────────────────────────────
    // Step back to a month that is actually FULL. The current month is only a couple of days old,
    // so the calendar renders almost entirely blank — a true screenshot that makes the product
    // look unused.
    await page.goto('/dashboard/homeschool/attendance', { waitUntil: 'domcontentloaded' })
    await settle(page.getByText(/days present/i).first())
    const grid = page.locator('main')
    const marked = () => grid.locator('.bg-green-700, .bg-green-600, [class*="bg-green-7"]').count()
    for (let back = 0; back < 6 && (await marked()) < 12; back++) {
      await page.getByRole('button', { name: '←' }).click()
      await page.waitForTimeout(350)
    }
    expect(await marked(), 'no month with a filled calendar was found').toBeGreaterThan(11)
    const a = await shootContent(page, 'public/demo/attendance.png', { maxHeight: 1050 })

    console.log(`captured — history ${h}px, report ${r}px, attendance ${a}px (CSS px, shot at 2x)`)
  })
})
