import fs from 'node:fs'
import path from 'node:path'

// Route enumeration for the integrity specs (BUILD-BIBLE Dim 6).
//
// WHY THIS WALKS THE FILESYSTEM instead of hardcoding a list: a hardcoded list rots
// silently — someone adds a route, nobody adds it to the test, and the gap is invisible
// forever. Deriving the list from src/app means a new page is covered the moment it
// exists, and a MOVED page fails loudly, which is the whole point during an IA change.

const APP_DIR = path.join(__dirname, '..', 'src', 'app')

/**
 * Concrete URLs to visit for dynamic routes, keyed by the FULL route pattern.
 *
 * Keyed by pattern, not by segment name, because segment names collide: `[category]`
 * means an equipment type under home-diy (tractor/hvac/well…) and a crop or animal
 * under homestead. A segment-name map would silently send the wrong value.
 *
 * A dynamic route with no entry here is NOT silently skipped — `uncoveredDynamicRoutes()`
 * returns it so the suite can report the gap out loud. (No silent caps.)
 */
export const DYNAMIC_SUBSTITUTIONS: Record<string, string> = {
  '/state-requirements/[state]': '/state-requirements/missouri',
  // Neither of these calls notFound() on an unknown value — they render an empty report,
  // which is exactly what we want to assert still renders.
  '/dashboard/home-diy/reports/[category]': '/dashboard/home-diy/reports/tractor',
  '/dashboard/homestead/reports/[section]/[category]': '/dashboard/homestead/reports/garden/tomatoes',
  // '/dashboard/projects/reports/[id]' is deliberately absent: it calls notFound() unless
  // the id is a real row, so it needs an id discovered at runtime rather than a constant.
}

export type Route = { pattern: string; url: string | null; dynamic: boolean }

function walk(dir: string, segments: string[], out: Route[]) {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }

  if (entries.some((e) => e.isFile() && /^page\.(tsx|ts|jsx|js)$/.test(e.name))) {
    // Route groups like (marketing) are organisational only — not part of the URL.
    const urlSegments = segments.filter((s) => !/^\(.*\)$/.test(s))
    const pattern = '/' + urlSegments.join('/')
    const dynamic = urlSegments.some((s) => /^\[.*\]$/.test(s))
    const normalized = pattern === '/' ? '/' : pattern.replace(/\/$/, '')
    out.push({
      pattern: normalized,
      url: dynamic ? (DYNAMIC_SUBSTITUTIONS[normalized] ?? null) : normalized,
      dynamic,
    })
  }

  for (const e of entries) {
    if (!e.isDirectory()) continue
    if (e.name === 'api' || e.name.startsWith('_') || e.name.startsWith('.')) continue
    walk(path.join(dir, e.name), [...segments, e.name], out)
  }
}

function allRoutes(): Route[] {
  const out: Route[] = []
  walk(APP_DIR, [], out)
  return out.sort((a, b) => a.pattern.localeCompare(b.pattern))
}

const isDashboard = (r: Route) => r.pattern === '/dashboard' || r.pattern.startsWith('/dashboard/')

/** Visitable public routes (everything outside /dashboard). */
export function publicRoutes(): string[] {
  return allRoutes()
    .filter((r) => !isDashboard(r) && r.url)
    .map((r) => r.url!)
}

/** Visitable authenticated routes under /dashboard. */
export function dashboardRoutes(): string[] {
  return allRoutes()
    .filter((r) => isDashboard(r) && r.url)
    .map((r) => r.url!)
}

/**
 * Dynamic routes with no substitution — i.e. routes this suite does NOT cover.
 * Reported rather than assumed away, so the coverage gap stays visible.
 */
export function uncoveredDynamicRoutes(): string[] {
  return allRoutes()
    .filter((r) => !r.url)
    .map((r) => r.pattern)
}
