// Cultivate service worker.
// Goal: kill the screen-to-screen navigation lag in the installed PWA by serving
// Next.js's immutable, content-hashed build assets from a cache (cache-first)
// instead of re-downloading the JS/CSS bundles on every navigation.
//
// SAFETY: we ONLY cache same-origin GET requests for immutable static assets
// (/_next/static/**, icons, manifest). HTML/RSC navigations, API routes, Supabase
// auth, and every non-GET request fall through to the network untouched — so there
// is no risk of serving a stale page or a wrong user's data. New deploys ship new
// hashed filenames, so the cache can never serve outdated code.
const CACHE = 'cultivate-static-v1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Drop caches from older SW versions so a cache-name bump fully takes over.
    const keys = await caches.keys()
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    await self.clients.claim()
  })())
})

function isImmutableStatic(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.json'
  )
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return // never touch POST/PUT/etc (auth, mutations)

  let url
  try { url = new URL(req.url) } catch { return }
  if (url.origin !== self.location.origin) return // only our own origin
  if (!isImmutableStatic(url)) return // HTML/RSC/API → straight to network

  // Cache-first for immutable hashed assets.
  event.respondWith((async () => {
    const cached = await caches.match(req)
    if (cached) return cached
    try {
      const res = await fetch(req)
      if (res && res.ok) {
        const cache = await caches.open(CACHE)
        cache.put(req, res.clone())
      }
      return res
    } catch (err) {
      // Offline and not cached — let the request surface its own network error.
      throw err
    }
  })())
})

// ── Web Push (reminders) ─────────────────────────────────────────────────────
// Added 2026-09-26. Same worker as the cache above — one service worker per scope,
// never a second registration. Payload comes from src/lib/notifications/push.ts:
//   { title, body, route, tag }
// `route` is an in-app path (e.g. /dashboard/log?focus=school), never an absolute URL,
// so the same payload works on any origin. A push MUST display a notification
// (userVisibleOnly), so there is no silent path here by design.
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Cultivate', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Cultivate'
  const route = typeof data.route === 'string' && data.route.startsWith('/') ? data.route : '/dashboard'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || `cultivate-${Date.now()}`,
      renotify: true,
      data: { route },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const route = (event.notification.data && event.notification.data.route) || '/dashboard'
  const target = new URL(route, self.location.origin).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const w of windows) {
      if (w.url.startsWith(self.location.origin) && 'focus' in w) {
        try { await w.navigate(target) } catch { /* cross-state navigation can fail; focus anyway */ }
        return w.focus()
      }
    }
    return self.clients.openWindow(target)
  })())
})
