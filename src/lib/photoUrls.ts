// Resolving stored photo references into something the browser can actually fetch.
//
// BACKGROUND (RLS audit 2026-08-05): the `log-photos` bucket used to be PUBLIC, so every photo
// was readable by anyone with the URL — no key, no session. These are photographs of children
// attached to homeschool records. The bucket is now private, which means the absolute
// `/object/public/...` URLs already persisted in `daily_log.photo_urls`, `yearbook_slots.photo_url`
// and `photos.url` no longer resolve on their own.
//
// WHY WE DIDN'T BACKFILL THE DATABASE: 649 of the 671 stored references belong to the seeded demo
// account and are external `picsum.photos` placeholders, not our storage at all. Any resolver has
// to pass foreign URLs through untouched regardless — so the stored string simply stays a stable
// IDENTIFIER and gets resolved at render time. That also means the three upload sites need no
// change: `getPublicUrl()` still returns the same string on a private bucket, it just stops being
// directly fetchable.
//
// WHY A ROUTE INSTEAD OF SIGNING IN THE COMPONENTS: signing is async, and scattering
// `await createSignedUrl` through five render paths would turn every `<img src>` into loading
// state, effect churn, and a batching problem (the yearbook paints dozens of images at once).
// Routing through `/api/photo/view` keeps `photoSrc()` a PURE STRING function, so each call site
// stays a one-line change and the auth check stays on the server.

export const PHOTO_BUCKET = 'log-photos'

// Every shape a stored reference can take. Legacy rows hold the `/object/public/` form; the
// yearbook additionally rewrote URLs to the `/render/image/public/` resize endpoint, so a stored
// or in-flight value can be either. Order matters only in that all are checked.
const PATH_MARKERS = [
  `/storage/v1/object/public/${PHOTO_BUCKET}/`,
  `/storage/v1/render/image/public/${PHOTO_BUCKET}/`,
  `/storage/v1/object/${PHOTO_BUCKET}/`,
]

/**
 * The in-bucket path for a stored reference, or null if this isn't one of our photos.
 * Null is the normal, expected answer for the demo account's external placeholders.
 */
export function photoStoragePath(url: string | null | undefined): string | null {
  if (!url) return null
  for (const marker of PATH_MARKERS) {
    const at = url.indexOf(marker)
    if (at === -1) continue
    // Drop any existing query (the old resize endpoint appended ?width=&quality=).
    const rest = url.slice(at + marker.length)
    const path = rest.split('?')[0]
    return path || null
  }
  return null
}

/**
 * What to put in `<img src>`.
 *
 * Our photos become a same-origin URL that authenticates the caller and redirects to a
 * short-lived signed URL. Anything else — external demo placeholders, blob: previews from
 * `URL.createObjectURL`, empty values — is returned untouched, which is what keeps the seeded
 * demo account and the local upload previews working.
 *
 * `maxSize` requests a resized render, meaning "longest side at most N px", aspect ratio
 * preserved. The yearbook prints many photos at once and full-res phone originals are heavy
 * enough that iOS Safari's print-to-PDF silently drops the later pages, so asking for the size
 * you'll actually display matters. Omit it to get the original.
 */
export function photoSrc(url: string | null | undefined, maxSize?: number): string {
  if (!url) return ''
  const path = photoStoragePath(url)
  if (!path) return url
  const q = new URLSearchParams({ p: path })
  if (maxSize) q.set('w', String(maxSize))
  return `/api/photo/view?${q.toString()}`
}
