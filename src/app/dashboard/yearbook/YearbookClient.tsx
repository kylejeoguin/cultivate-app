'use client'

import { useState, useEffect, useRef, useContext, createContext, Fragment, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { isSold, homesteadRevenue } from '@/lib/revenue'
import { photoSrc } from '@/lib/photoUrls'
import PhotoUploader from './PhotoUploader'
import PhotoManager from './PhotoManager'
import type { Child, SchoolYear, Subject } from '@/lib/types'

// Quick presets that fill the custom-range date inputs.
function calendarYearRange(year: number) {
  return { start: `${year}-01-01`, end: `${year}-12-31` }
}

// ── Types ────────────────────────────────────────────────────────────────────

interface DailyLog {
  id: string; child_id: string; log_date: string; notes: string | null
  hours: number | null; subject_ids: string[]; is_homestead_day: boolean
  photo_urls?: string[]
}
interface Activity {
  id: string; child_id: string; activity_date: string; title: string
  description: string | null; type: string | null; hours: number | null
}
interface PortfolioItem {
  id: string; child_id: string; title: string; description: string | null
  item_date: string; is_featured: boolean; file_url: string | null
  file_type?: 'image' | 'document' | 'link' | null
}
interface LivestockLog {
  id: string; log_date: string; animal_type: string; animal_name: string | null
  quantity: number | null; unit: string | null; notes: string | null
  disposition: string | null; sale_amount: number | null
}
interface GardenEntry {
  id: string; crop_name: string; variety: string | null; status: string
  date_planted: string | null; actual_harvest: string | null; notes: string | null
  disposition: string | null; sale_amount: number | null
}
interface PreservationLog {
  id: string; log_date: string; item_name: string; method: string
  quantity: number | null; unit: string | null; notes: string | null
  disposition: string | null; sale_amount: number | null
}
interface Project {
  id: string; title: string; description: string | null; category: string
  status: string; updated_at: string
}

interface Props {
  canDownload: boolean
  activeTab: 'homeschool' | 'homestead'
  childNotes: Record<string, string>
  noteYearId: string | null
  photoSlots: Record<string, string>
  slotScope: string | null
  slotSchoolYearId: string | null
  childList: Child[]
  schoolYears: SchoolYear[]
  activeYear: SchoolYear | undefined
  rangeStart: string
  rangeEnd: string
  usingCustomRange: boolean
  logs: DailyLog[]
  activities: Activity[]
  portfolio: PortfolioItem[]
  subjects: Subject[]
  livestock: LivestockLog[]
  garden: GardenEntry[]
  preservation: PreservationLog[]
  photos: PhotoRow[]
  projects: Project[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}
function monthKey(d: string) { return d.slice(0, 7) }
function monthLabel(key: string) {
  const [y, m] = key.split('-')
  return new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

const METHOD_LABELS: Record<string, string> = {
  canning: 'Canning', freezing: 'Freezing', dehydrating: 'Dehydrating',
  fermenting: 'Fermenting', other: 'Other',
}

// ── Keepsake yearbook ─────────────────────────────────────────────────────────
// A yearbook is a keepsake, not a report. Everything below renders on warm "paper"
// sheets (cream bg, warm-brown ink) with serif display type, soft photo frames, and
// gentle earth tones — a light object regardless of the app's dark theme. Styling is
// plain Tailwind utilities (including arbitrary hex like bg-[#fbf7ef]); font-serif
// gives the Georgia-based keepsake type. NOTE: the app's global print CSS still
// flattens colored card backgrounds to white for the PDF (photos + layout survive) —
// a colored-PDF pass is a deferred nicety.

// ── Keepsake yearbook: data helpers ───────────────────────────────────────────

interface Photo { url: string; caption: string; date: string; childId: string }

// A photo from the attributed photos table (per-child via child_ids).
export type PhotoRow = { url: string; caption: string | null; taken_on: string; child_ids: string[] }

// The yearbook renders many photos at once AND prints them, so full-res phone photos (2–5 MB
// each) make the book slow to load and — critically — heavy enough that iOS Safari's
// print-to-PDF silently drops the later pages (the per-student spreads at the end). So every
// image is requested at a print-friendly width — a ~5–6× smaller payload with no visible quality
// loss on the page or in a home print.
//
// ⚠️ This used to build a `/render/image/public/` URL by hand. That endpoint requires a PUBLIC
// bucket, and `log-photos` went private on 2026-08-05 (it was serving children's photos to
// anyone with the URL). photoSrc() now routes through /api/photo/view, which signs with the
// caller's session and applies the same resize. Non-Supabase URLs (the demo account's external
// placeholders) still pass through untouched.
function ybImage(url: string | null | undefined, width = 1600): string {
  return photoSrc(url, width)
}

// Every image we can surface for the book, sorted oldest→newest so collages read
// chronologically. childId=null gathers the whole family. Sources, in precedence order:
//  1. the photos table — each row is tagged with the child(ren) IN it (child_ids), so a
//     solo photo lands on one kid and a group photo on several. Untagged rows (empty
//     child_ids) are family-only (shown when childId=null, not pinned to a child).
//  2. legacy daily_log.photo_urls — attributed by the row's child_id, but ONLY for URLs
//     not already owned by the photos table (those are deduped out; the table wins).
//  3. portfolio image items (captioned by title).
function collectPhotos(
  childId: string | null,
  logs: DailyLog[],
  portfolio: PortfolioItem[],
  photos: PhotoRow[] = [],
): Photo[] {
  const out: Photo[] = []
  const emitted = new Set<string>()
  const push = (p: Photo) => {
    const key = `${p.url}|${p.childId}`
    if (emitted.has(key)) return
    emitted.add(key); out.push(p)
  }

  const tableUrls = new Set(photos.map(p => p.url))
  photos.forEach(p => {
    const ids = p.child_ids ?? []
    if (childId === null) {
      push({ url: p.url, caption: p.caption ?? '', date: p.taken_on, childId: ids[0] ?? '' })
    } else if (ids.includes(childId)) {
      push({ url: p.url, caption: p.caption ?? '', date: p.taken_on, childId })
    }
  })

  logs.forEach(l => {
    if (childId && l.child_id !== childId) return
    ;(l.photo_urls ?? []).forEach(u => {
      if (!u || tableUrls.has(u)) return // photos table owns this URL — don't double-count
      push({ url: u, caption: l.notes ?? '', date: l.log_date, childId: l.child_id })
    })
  })
  portfolio.forEach(p => {
    if (childId && p.child_id !== childId) return
    if (p.file_type === 'image' && p.file_url) push({ url: p.file_url, caption: p.title, date: p.item_date, childId: p.child_id })
  })
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

function ageOn(birthdate: string | null, ref: string): number | null {
  if (!birthdate) return null
  const b = new Date(birthdate + 'T12:00:00'); const r = new Date(ref + 'T12:00:00')
  let age = r.getFullYear() - b.getFullYear()
  const m = r.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && r.getDate() < b.getDate())) age--
  return age >= 0 && age < 120 ? age : null
}

const SUBJECT_EMOJI: [RegExp, string][] = [
  [/math/i, '➗'], [/scien/i, '🔬'], [/read|english|language arts|literat|writ/i, '📖'],
  [/hist|social/i, '🏛️'], [/art|draw|paint/i, '🎨'], [/music/i, '🎵'],
  [/\b(pe|gym|physical|health)\b/i, '⚽'], [/bible|faith|relig/i, '✝️'],
  [/geog/i, '🌍'], [/spanish|french|latin/i, '🗣️'], [/nature|garden|farm/i, '🌱'],
]
function subjectEmoji(name: string): string {
  for (const [re, e] of SUBJECT_EMOJI) if (re.test(name)) return e
  return '📚'
}

interface Award { emoji: string; title: string; sub: string }

// Fun "superlative" awards derived entirely from data already logged — no manual
// entry. Every child earns at least a couple; strongest signals win the top slots.
function buildAwards(o: {
  daysLogged: number; topSubject: string | null; photoCount: number
  activitiesCount: number; portfolioCount: number; homesteadDays: number
}): Award[] {
  const pool: Award[] = []
  if (o.topSubject) pool.push({ emoji: subjectEmoji(o.topSubject), title: `${o.topSubject} Star`, sub: 'most-loved subject' })
  if (o.photoCount >= 8) pool.push({ emoji: '📸', title: 'Most Photogenic', sub: `${o.photoCount} photos captured` })
  if (o.activitiesCount >= 3) pool.push({ emoji: '🗺️', title: 'Field-Trip Explorer', sub: `${o.activitiesCount} adventures` })
  if (o.portfolioCount >= 3) pool.push({ emoji: '⭐', title: 'Portfolio Pro', sub: `${o.portfolioCount} pieces of work` })
  if (o.homesteadDays >= 5) pool.push({ emoji: '🌾', title: 'Hands-On Hand', sub: `${o.homesteadDays} hands-on days` })
  if (o.daysLogged >= 100) pool.push({ emoji: '💯', title: '100-Day Club', sub: `${o.daysLogged} days of learning` })
  else if (o.daysLogged >= 50) pool.push({ emoji: '🏅', title: '50-Day Club', sub: `${o.daysLogged} days of learning` })
  if (pool.length < 2) pool.push({ emoji: '🌟', title: 'Rising Star', sub: `${o.daysLogged} day${o.daysLogged !== 1 ? 's' : ''} logged` })
  if (pool.length < 2 && o.photoCount > 0) pool.push({ emoji: '📸', title: 'Memory Maker', sub: `${o.photoCount} photos` })
  return pool.slice(0, 4)
}

// Deterministic little scrapbook tilt from an index, so frames feel hand-placed
// but never jump between renders. −2°…+2°.
function tiltFor(i: number): number {
  return [-2, 1.5, -1, 2, -1.5, 1][i % 6]
}

// ── Keepsake yearbook: shared UI ──────────────────────────────────────────────

// One "page" of the book: a warm paper sheet floating on the app surface. Every sheet
// is a flex COLUMN so its content can fill the full letter page in print (the page is
// min-height:100vh there — see globals.css). `center` vertically centers the content
// (cover, closing, message); content pages instead let a photo wall grow to fill.
function Sheet({ children, className = '', breakAfter = false, center = false }: {
  children: ReactNode; className?: string; breakAfter?: boolean; center?: boolean
}) {
  return (
    <section
      className={`yb-page flex flex-col ${center ? 'justify-center' : ''} bg-[#fbf7ef] text-[#3a2f24] rounded-2xl border border-[#ece2cf] shadow-[0_10px_40px_-16px_rgba(60,45,25,.4)] px-6 sm:px-10 py-9 mb-8 sm:aspect-[17/22] sm:overflow-hidden print:aspect-auto print:h-screen print:overflow-hidden print:mb-0 print:rounded-none print:border-0 print:shadow-none ${breakAfter ? 'print-page-break' : ''} ${className}`}
    >
      {children}
    </section>
  )
}

// A serif section heading with flanking hairlines — the recurring "spread title".
function SpreadTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="text-center mb-7">
      <div className="flex items-center gap-3 justify-center">
        <span className="h-px w-8 bg-[#d8c8a8]" />
        <h2 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#3a2f24]">{children}</h2>
        <span className="h-px w-8 bg-[#d8c8a8]" />
      </div>
      {sub && <p className="font-sans text-[11px] uppercase tracking-[0.2em] text-[#a08b6a] mt-2">{sub}</p>}
    </div>
  )
}

// `fill` makes the frame fill its container (a photo-wall cell): the image grows to
// the cell's full height and object-covers it, so a page of photos fills the sheet with
// big images instead of small fixed tiles.
function Photograph({ photo, tilt = 0, aspect, fill = false, className = '' }: {
  photo: Photo; tilt?: number; aspect?: string; fill?: boolean; className?: string
}) {
  return (
    <figure
      className={`bg-[#fffdf8] p-2 border border-[#ece2cf] rounded-[3px] shadow-[0_6px_16px_-8px_rgba(60,45,25,.35)] ${fill ? 'h-full w-full flex flex-col' : ''} ${className}`}
      style={tilt ? { transform: `rotate(${tilt}deg)` } : undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={ybImage(photo.url)}
        alt={photo.caption || ''}
        className={`block w-full rounded-[1px] ${fill ? 'flex-1 min-h-0 object-cover' : ''}`}
        style={fill ? undefined : (aspect ? { aspectRatio: aspect, objectFit: 'cover' } : undefined)}
      />
      {photo.caption && <figcaption className="font-serif text-[12px] leading-snug text-[#6b5d4c] mt-[7px] px-0.5 line-clamp-2">{photo.caption}</figcaption>}
    </figure>
  )
}

// Clamp a measured aspect ratio (w/h) to a sane range so an odd panorama or a very tall
// shot can't break the row math; the image still object-covers whatever cell it lands in.
function clampRatio(r: number): number {
  if (!isFinite(r) || r <= 0) return 1
  // Keep cells in a keepsake-friendly band (≈2:3 … 3:2). Real phone photos live here; a rare
  // panorama or very-tall shot is nudged in (a hair of cover-crop) rather than becoming a
  // skinny sliver that chops faces and looks wrong on the page.
  return Math.min(1.5, Math.max(0.66, r))
}

// A short, stable, deterministic key derived from a photo's URL (FNV-1a → base36). Used to
// name a collage tile's editable slot by the DEFAULT photo it shows — so an override follows
// its photo if the month later gains a photo and the frozen layout repaginates, rather than
// mis-attaching to whatever default lands in a given grid position.
function shortHash(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0).toString(36)
}

// A justified photo collage that keeps every tile close to its photo's TRUE aspect ratio, so
// nothing is chopped and no cell comes out a skinny sliver. We measure each photo's real ratio
// as it loads (naturalWidth/Height reflect EXIF rotation) and clamp it to a keepsake-friendly
// band, then lay photos into rows Flickr-style: each row targets an equal aspect-sum, and a
// row's HEIGHT is DERIVED FROM ITS CONTENT (grow ∝ 1/rowSum — a row of wide photos is short, a
// row of tall photos is taller) rather than forced by a rhythm. With the row count chosen to
// close the layout at the page's proportion, every cell resolves to ~its own (clamped) shape
// while the wall still fills the whole sheet exactly. Variety comes from rows holding different
// numbers of photos — organic, never a rigid grid, and (unlike the old seeded rhythm) never an
// extreme cell. `slotPrefix` turns each tile into an editable slot keyed by the tile's DEFAULT
// photo, so the frozen layout — measured from `photos` — never re-flows when a tile is
// overridden. `pool` is the candidate set offered in a tile's picker (defaults to `photos`).
// The wall fills its flex parent (a full page), so its parent must give it a height — every
// caller renders it as the flex-1 body of a Sheet.
function PhotoWall({ photos, slotPrefix, pool, childId = null, className = '' }: {
  photos: Photo[]; slotPrefix?: string; pool?: Photo[]; childId?: string | null; className?: string
}) {
  const urlsKey = photos.map(p => p.url).join('|')
  const [ratios, setRatios] = useState<number[]>(() => photos.map(() => 1))

  useEffect(() => {
    let alive = true
    const urls = urlsKey ? urlsKey.split('|') : []
    Promise.all(urls.map(url => new Promise<number>(resolve => {
      const img = new Image()
      img.onload = () => resolve(clampRatio(img.naturalWidth / img.naturalHeight))
      img.onerror = () => resolve(1)
      img.src = ybImage(url)
    }))).then(rs => { if (alive) setRatios(rs) })
    return () => { alive = false }
  }, [urlsKey])

  if (photos.length === 0) return null

  const items = photos.map((p, i) => ({ photo: p, ratio: ratios[i] ?? 1 }))
  const totalAspect = items.reduce((s, it) => s + it.ratio, 0)
  const PAGE_ASPECT = 0.78 // letter content area (w/h), portrait
  const rowsN = Math.max(1, Math.round(Math.sqrt(totalAspect / PAGE_ASPECT)))
  const target = totalAspect / rowsN // equal aspect-sum per row ⇒ cells resolve to ~natural shape

  // Greedy justified packing: add photos to a row until its aspect-sum reaches the target, then
  // start a new row. Crucially this does NOT force a fixed row count with all leftovers dumped
  // into a final row — that's what crammed a whole row of skinny slivers. Every row lands near
  // the target, so no cell is squeezed. Never end a row on a lone narrow portrait (it would
  // stretch too wide once the row is justified to full width).
  const rows: { photo: Photo; ratio: number }[][] = []
  let row: { photo: Photo; ratio: number }[] = []
  let acc = 0
  items.forEach((it, i) => {
    row.push(it); acc += it.ratio
    const okToBreak = row.length >= 2 || row[0].ratio >= 1.3
    if (i < items.length - 1 && acc >= target && okToBreak) { rows.push(row); row = []; acc = 0 }
  })
  if (row.length) {
    // A lone leftover portrait would stretch full-width and crop hard. Don't fold it into the
    // previous row (that just crams a row of skinny slivers) — BORROW the previous row's last
    // photo to pair with it (4+1 → 3+2). Only if the previous row is already small do we merge.
    if (rows.length && row.length === 1 && row[0].ratio < 1.3) {
      const prev = rows[rows.length - 1]
      if (prev.length > 2) row.unshift(prev.pop()!)
      else { prev.push(...row); row = [] }
    }
    if (row.length) rows.push(row)
  }

  // Each row's height ∝ 1/rowSum — this is what makes every cell resolve to ~its own aspect.
  // Normalize the row grows to sum to the row count (and cell grows to the item count) so
  // flexbox always distributes the FULL free space (grow factors summing to < 1 leave a gap).
  const rowInv = rows.map(row => 1 / (row.reduce((s, it) => s + it.ratio, 0) || 1))
  const invSum = rowInv.reduce((s, v) => s + v, 0) || 1

  return (
    <div className={`flex-1 min-h-0 flex flex-col gap-3 ${className}`}>
      {rows.map((row, ri) => {
        const rowSum = row.reduce((s, it) => s + it.ratio, 0) || 1
        const rowGrow = (rowInv[ri] / invSum) * rows.length
        return (
          <div key={ri} className="min-h-[120px] sm:min-h-0 flex gap-3" style={{ flexGrow: rowGrow, flexBasis: 0 }}>
            {row.map(({ photo, ratio }, ci) => (
              // Plain block (not flex): a flex cell would let the figure shrink to the image's
              // natural width; as a block the child fills the whole (frozen) cell. When the wall
              // is editable, the tile is an EditablePhoto keyed by its default photo.
              <div key={ci} className="min-w-0" style={{ flexGrow: (ratio / rowSum) * row.length, flexBasis: 0 }}>
                {slotPrefix ? (
                  <EditablePhoto
                    fill
                    slotKey={`${slotPrefix}:${shortHash(photo.url)}`}
                    defaultUrl={photo.url}
                    pool={pool ?? photos}
                    childId={childId}
                    frameRatio={ratio}
                    label="this"
                  />
                ) : (
                  <Photograph photo={{ ...photo, caption: '' }} fill />
                )}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ── Editable photos ───────────────────────────────────────────────────────────
// Any hero/feature photo can be swapped by the user. The override is stored per slot_key
// (render = override ?? default), so regenerating keeps hand-picked photos. KEY RULES:
//  • The slot's FRAME is fixed — swapping a photo never resizes the slot, so no other
//    photo on the page moves.
//  • A same-orientation photo fills the frame (cover); a cross-orientation photo is shown
//    WHOLE with a soft mat (contain) — never chopped.

interface SlotCtx {
  slots: Record<string, string>
  yearId: string | null
  save: (slotKey: string, photoUrl: string, childId?: string | null) => Promise<boolean>
  reset: (slotKey: string) => Promise<boolean>
}
const SlotContext = createContext<SlotCtx | null>(null)

// Measure one image's aspect ratio (w/h). naturalWidth/Height reflect EXIF orientation.
function useRatio(url: string | undefined): number | null {
  const [ratio, setRatio] = useState<number | null>(null)
  useEffect(() => {
    if (!url) return
    let alive = true
    const img = new Image()
    img.onload = () => { if (alive) setRatio(img.naturalWidth / img.naturalHeight || 1) }
    img.onerror = () => { if (alive) setRatio(1) }
    img.src = ybImage(url)
    return () => { alive = false }
  }, [url])
  return ratio
}

// A tap-to-swap photo. `pool` = the candidate photos offered in the picker.
//  • Default (framed) mode: a fixed-aspect frame (frameRatio) — used for the cover hero,
//    each child's spotlight portrait, and the letter photos. The frame never resizes on
//    swap, so nothing around it moves.
//  • `fill` mode: no aspect of its own — the figure fills its parent cell (a photo-wall
//    tile). The cell's size is the frozen frame. A collage tile ALWAYS covers (fills + gentle
//    crop) whatever photo lands in it, including a cross-orientation swap — the cells sit in a
//    natural aspect band so the crop is modest, and this reads as an intentional photo rather
//    than the floating letterbox mat a `contain` would leave. The Change affordance is a
//    compact icon that reveals on hover/focus so a dense collage stays clean.
function EditablePhoto({ slotKey, defaultUrl, pool, childId = null, frameRatio, tilt = 0, label, monogram, fill = false, className = '' }: {
  slotKey: string; defaultUrl: string | null; pool: Photo[]; childId?: string | null
  frameRatio: number; tilt?: number; label: string; monogram?: string; fill?: boolean; className?: string
}) {
  const ctx = useContext(SlotContext)
  const [picking, setPicking] = useState(false)
  const override = ctx?.slots[slotKey]
  const url = override ?? defaultUrl ?? undefined
  const ratio = useRatio(url)
  // Editing is available when there's a scope to attach the choice to (a school year OR a
  // custom range — ctx.yearId now holds either) AND real photos to choose from.
  const canEdit = !!ctx?.yearId && pool.length > 0

  // Collage tiles (`fill`) always cover — see note above. A FRAMED feature photo (cover hero,
  // spotlight portrait, letter photos) keeps the orientation-aware rule: it fills when the photo
  // matches the frame's orientation, otherwise shows the whole photo on a soft mat so a
  // purpose-shaped slot never chops a cross-orientation shot.
  const fit: 'cover' | 'contain' = fill ? 'cover'
    : (ratio == null ? 'cover' : ((frameRatio >= 1) === (ratio >= 1) ? 'cover' : 'contain'))

  return (
    <figure
      className={`relative bg-[#fffdf8] p-2 border border-[#ece2cf] rounded-[3px] shadow-[0_6px_16px_-8px_rgba(60,45,25,.35)] ${fill ? 'group h-full w-full flex flex-col' : ''} ${className}`}
      style={{ aspectRatio: fill ? undefined : String(frameRatio), transform: tilt ? `rotate(${tilt}deg)` : undefined }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={ybImage(url)} alt={label} className={`rounded-[1px] ${fill ? 'flex-1 min-h-0 w-full' : 'w-full h-full'}`} style={{ objectFit: fit }} />
      ) : (
        <div className={`${fill ? 'flex-1 min-h-0' : 'w-full h-full'} flex items-center justify-center bg-[#f4ecdb] rounded`}>
          <span className="font-serif text-6xl text-[#c9b487]">{monogram ?? label.charAt(0)}</span>
        </div>
      )}
      {canEdit && (
        fill ? (
          <button
            type="button"
            onClick={() => setPicking(true)}
            aria-label={`Change ${label} photo`}
            className="print:hidden absolute top-2 right-2 w-7 h-7 flex items-center justify-center bg-[#3a2f24]/85 hover:bg-[#3a2f24] text-[#f7f1e6] text-[13px] font-sans rounded-full shadow-md opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity focus:outline-none focus:ring-2 focus:ring-white/80"
          >
            <span aria-hidden="true">⇄</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setPicking(true)}
            aria-label={`Change ${label} photo`}
            className="print:hidden absolute bottom-3 right-3 flex items-center gap-1 bg-[#3a2f24]/85 hover:bg-[#3a2f24] text-[#f7f1e6] text-[11px] font-sans rounded-full pl-2 pr-2.5 py-1 shadow-md transition-colors focus:outline-none focus:ring-2 focus:ring-white/80"
          >
            <span aria-hidden="true">⇄</span> Change
          </button>
        )
      )}
      {/* Portalled to <body>: this figure carries a `transform` (the tilt), which would
          otherwise become the containing block for the fixed-position modal and trap it
          inside the photo instead of covering the screen. */}
      {picking && ctx && typeof document !== 'undefined' && createPortal(
        <PhotoPicker
          title={`Choose ${label} photo`}
          pool={pool}
          currentUrl={url}
          hasOverride={override != null}
          onPick={(u) => ctx.save(slotKey, u, childId)}
          onReset={() => ctx.reset(slotKey)}
          onClose={() => setPicking(false)}
        />,
        document.body,
      )}
    </figure>
  )
}

// Accessible photo chooser: focus-trapped dialog, Esc to close, keyboard-navigable grid.
function PhotoPicker({ title, pool, currentUrl, hasOverride, onPick, onReset, onClose }: {
  title: string; pool: Photo[]; currentUrl?: string; hasOverride: boolean
  onPick: (url: string) => Promise<boolean>; onReset: () => Promise<boolean>; onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    panel?.querySelector<HTMLElement>('button')?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key === 'Tab' && panel) {
        const f = Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled])'))
        if (!f.length) return
        const first = f[0], last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.() }
  }, [onClose])

  // Unique photos, newest first (most likely what you want for a hero). The current pick
  // floats to the top so it's easy to find.
  const seen = new Set<string>()
  const options = pool
    .filter(p => p.url && !seen.has(p.url) && seen.add(p.url))
    .sort((a, b) => b.date.localeCompare(a.date))
    .sort((a, b) => (a.url === currentUrl ? -1 : b.url === currentUrl ? 1 : 0))

  return (
    <div className="print:hidden fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div ref={panelRef} className="relative bg-[#fbf7ef] text-[#3a2f24] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col border border-[#e6d8bd]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e6d8bd] shrink-0">
          <h2 className="font-serif text-lg font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-[#8a7a5f] hover:text-[#3a2f24] rounded-full w-8 h-8 flex items-center justify-center text-lg focus:outline-none focus:ring-2 focus:ring-[#4c6444]">✕</button>
        </div>
        {error && (
          <div role="alert" className="px-5 py-2.5 bg-red-50 border-b border-red-200 shrink-0">
            <p className="font-sans text-sm text-red-700">{error}</p>
          </div>
        )}
        {options.length > 0 ? (
          // flex-1 + min-h-0 lets this scroll region shrink inside the flex column so it
          // actually scrolls (without min-h-0 a flex child refuses to shrink and its rows
          // get crushed into an overlapping pile). Each tile has a fixed square FOOTPRINT (so
          // the grid stays tidy) but the photo is shown CONTAINED on a soft mat — portraits read
          // tall, landscapes read wide — so you can tell a photo's orientation at a glance
          // instead of every option looking like a cropped square.
          <div className="flex-1 min-h-0 overflow-y-auto p-4 grid grid-cols-3 sm:grid-cols-4 auto-rows-max gap-3">
            {options.map(p => {
              const selected = p.url === currentUrl
              return (
                <button
                  key={p.url}
                  type="button"
                  onClick={async () => {
                    setBusy(true); setError('')
                    const ok = await onPick(p.url)
                    setBusy(false)
                    if (ok) onClose(); else setError('That photo couldn’t be saved. Please try again.')
                  }}
                  disabled={busy}
                  aria-pressed={selected}
                  className={`relative aspect-square rounded-lg overflow-hidden border-2 bg-[#efe7d6] flex items-center justify-center transition-colors disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[#4c6444] ${selected ? 'border-[#4c6444]' : 'border-transparent hover:border-[#d8c8a8]'}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ybImage(p.url, 400)} alt={p.caption || 'Photo option'} loading="lazy" className="max-w-full max-h-full object-contain" />
                  {selected && <span className="absolute top-1 right-1 bg-[#4c6444] text-white text-[11px] rounded-full w-5 h-5 flex items-center justify-center shadow" aria-hidden="true">✓</span>}
                </button>
              )
            })}
          </div>
        ) : (
          <p className="p-10 text-center font-serif italic text-[#8a7a5f]">No other photos to choose from yet.</p>
        )}
        {hasOverride && (
          <div className="px-5 py-3 border-t border-[#e6d8bd] shrink-0">
            <button
              onClick={async () => {
                setBusy(true); setError('')
                const ok = await onReset()
                setBusy(false)
                if (ok) onClose(); else setError('Couldn’t reset the photo. Please try again.')
              }}
              disabled={busy}
              className="font-sans text-sm text-[#a08b6a] hover:text-[#4c6444] transition-colors disabled:opacity-60 focus:outline-none focus:underline"
            >
              ↺ Use the default photo
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Gate modal ───────────────────────────────────────────────────────────────

function GateModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center px-6">
      <div className="bg-card border border-line-strong rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
        <div className="text-4xl mb-4">📖</div>
        <h2 className="text-lg font-bold mb-2">Unlock Yearbook Download</h2>
        <p className="text-muted text-sm mb-6 leading-relaxed">
          Yearbook downloads are included with your Cultivate subscription. Start your free 7-day trial to unlock downloads and all features.
        </p>
        <div className="space-y-3">
          <Link href="/pricing" className="block w-full py-3 bg-green-700 hover:bg-green-600 text-white font-semibold rounded-xl transition-colors text-sm">
            View Plans →
          </Link>
          <button onClick={onClose} className="text-subtle hover:text-content text-sm transition-colors">
            Maybe later
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export default function YearbookClient({
  canDownload, activeTab, childNotes, noteYearId, photoSlots, slotScope, slotSchoolYearId, childList, schoolYears, activeYear,
  rangeStart, rangeEnd, usingCustomRange, logs, activities, portfolio, subjects,
  livestock, garden, preservation, photos, projects,
}: Props) {
  const router = useRouter()
  const [showGate, setShowGate] = useState(false)
  const [tab, setTab] = useState<'homeschool' | 'homestead'>(activeTab)
  const [showRange, setShowRange] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [fromDate, setFromDate] = useState(rangeStart)
  const [toDate, setToDate] = useState(rangeEnd)

  // User photo overrides (editable slots). Kept in local state so a swap updates instantly.
  // Re-sync when the year (thus the slot set) changes via the during-render reset pattern —
  // photoSlots keeps a stable identity across client re-renders, so this only fires on an
  // actual navigation and never clobbers an optimistic swap.
  const [slots, setSlots] = useState<Record<string, string>>(photoSlots)
  const [slotsSource, setSlotsSource] = useState(photoSlots)
  if (slotsSource !== photoSlots) { setSlotsSource(photoSlots); setSlots(photoSlots) }

  async function saveSlot(slotKey: string, photoUrl: string, childId: string | null = null): Promise<boolean> {
    if (!slotScope) return false
    try {
      const res = await fetch('/api/yearbook-slot', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotKey, photoUrl, scope: slotScope, schoolYearId: slotSchoolYearId, childId }),
      })
      if (!res.ok) return false
      setSlots(s => ({ ...s, [slotKey]: photoUrl }))
      return true
    } catch { return false }
  }
  async function resetSlot(slotKey: string): Promise<boolean> {
    if (!slotScope) return false
    try {
      const res = await fetch('/api/yearbook-slot', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotKey, scope: slotScope }),
      })
      if (!res.ok) return false
      setSlots(s => { const n = { ...s }; delete n[slotKey]; return n })
      return true
    } catch { return false }
  }
  const slotCtx: SlotCtx = { slots, yearId: slotScope, save: saveSlot, reset: resetSlot }

  function applyRange(start: string, end: string) {
    if (!start || !end || start > end) return
    setShowRange(false)
    router.push(`/dashboard/yearbook?start=${start}&end=${end}&tab=${tab}`)
  }
  function goToYear(yearId: string) {
    setShowRange(false)
    router.push(`/dashboard/yearbook?year_id=${yearId}&tab=${tab}`)
  }
  const thisYear = new Date(rangeStart).getFullYear()

  // Close the period dropdown on an outside click. (A full-screen backdrop element was
  // intercepting clicks on the menu items, so the quick picks didn't fire — this ref-based
  // handler closes on outside clicks without overlaying the menu.)
  const rangeRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!showRange) return
    function onDown(e: MouseEvent) {
      if (rangeRef.current && !rangeRef.current.contains(e.target as Node)) setShowRange(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [showRange])

  const subjectMap: Record<string, string> = {}
  subjects.forEach(s => { subjectMap[s.id] = s.name })

  async function handlePrint() {
    if (!canDownload) { setShowGate(true); return }
    if (preparing) return
    // window.print() captures the DOM AS-IS — it does NOT wait for images to finish
    // loading/decoding. A cold or photo-heavy book therefore prints blank photos and can
    // drop whole pages whose height depends on an image (that's why photos and the per-student
    // pages came and went between prints, and why desktop was slow — it was loading the
    // full-size photos DURING the print render).
    const imgs = Array.from(document.querySelectorAll('.yb-page img')) as HTMLImageElement[]
    // Fast path: everything's already decoded (true once you've viewed the book) → print
    // synchronously so the click still counts as a user gesture (iOS needs that for print()).
    if (imgs.every(img => img.complete && img.naturalWidth > 0)) { window.print(); return }
    // Cold book: wait for every image to finish first (hard timeout so a slow/broken image
    // can never hang us), then print.
    setPreparing(true)
    try {
      const settled = imgs.map(img =>
        img.complete && img.naturalWidth > 0
          ? Promise.resolve()
          : new Promise<void>(resolve => {
              const done = () => resolve()
              img.addEventListener('load', done, { once: true })
              img.addEventListener('error', done, { once: true })
            })
      )
      await Promise.race([
        Promise.all(settled),
        new Promise<void>(resolve => setTimeout(resolve, 12000)),
      ])
      // One more paint so the ratio-driven collage layout settles after the last image lands.
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    } finally {
      setPreparing(false)
    }
    window.print()
  }

  function switchTab(t: 'homeschool' | 'homestead') {
    setTab(t)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', t)
    router.replace(url.toString(), { scroll: false })
  }

  // Full calendar year (Jan 1–Dec 31, same year) gets a clean "2026" label; any other custom
  // window shows "Custom range"; otherwise fall back to the school-year name.
  const isFullCalendarYear =
    rangeStart.slice(5) === '01-01' && rangeEnd.slice(5) === '12-31' &&
    rangeStart.slice(0, 4) === rangeEnd.slice(0, 4)
  const yearLabel = usingCustomRange
    ? (isFullCalendarYear ? rangeStart.slice(0, 4) : 'Custom range')
    : (activeYear?.name ?? `${new Date(rangeStart).getFullYear()}`)
  const dateRange = `${fmtDate(rangeStart)} – ${fmtDate(rangeEnd)}`

  return (
    <SlotContext.Provider value={slotCtx}>
      {showGate && <GateModal onClose={() => setShowGate(false)} />}

      <div className="min-h-screen bg-surface text-content print:bg-[#fbf7ef] print:text-stone-900">
        {/* Nav — wraps on narrow screens so the control cluster (period picker + upload +
            manage + Download PDF) never runs off the right edge of a phone. */}
        <nav className="print:hidden border-b border-line/60 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <Link href="/dashboard" className="text-subtle hover:text-content text-sm transition-colors shrink-0">← Dashboard</Link>
          <div className="flex flex-wrap items-center justify-end gap-2 min-w-0">
            {/* Period / date-range picker */}
            <div className="relative" ref={rangeRef}>
              <button
                onClick={() => setShowRange(v => !v)}
                className="flex items-center gap-1.5 bg-card border border-line-strong rounded-lg px-3 py-1.5 text-sm text-content hover:border-green-600 transition-colors"
              >
                📅 <span className="max-w-[8rem] sm:max-w-[10rem] truncate">{yearLabel}</span>
                <span className="text-subtle text-xs">▾</span>
              </button>
              {showRange && (
                <div className="absolute right-0 mt-2 z-40 w-72 max-w-[calc(100vw-2rem)] bg-card border border-line-strong rounded-xl p-4 shadow-2xl">
                  <p className="text-xs font-semibold text-subtle uppercase tracking-wider mb-2">Quick picks</p>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {schoolYears.map(y => (
                      <button
                        key={y.id}
                        onClick={() => goToYear(y.id)}
                        className="text-xs bg-elevated hover:bg-elevated/70 text-muted px-2.5 py-1 rounded-full transition-colors"
                      >
                        {y.name}
                      </button>
                    ))}
                    {[thisYear, thisYear - 1].map(yr => {
                      const r = calendarYearRange(yr)
                      return (
                        <button
                          key={yr}
                          onClick={() => applyRange(r.start, r.end)}
                          className="text-xs bg-elevated hover:bg-elevated/70 text-muted px-2.5 py-1 rounded-full transition-colors"
                        >
                          {yr} (Jan–Dec)
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-xs font-semibold text-subtle uppercase tracking-wider mb-2">Custom range</p>
                  <div className="flex items-center gap-2 mb-3">
                    <input
                      type="date"
                      value={fromDate}
                      onChange={e => setFromDate(e.target.value)}
                      className="flex-1 min-w-0 bg-surface border border-line-strong rounded-lg px-2 py-1.5 text-xs text-content focus:outline-none focus:border-green-600"
                    />
                    <span className="text-subtle text-xs shrink-0">to</span>
                    <input
                      type="date"
                      value={toDate}
                      onChange={e => setToDate(e.target.value)}
                      className="flex-1 min-w-0 bg-surface border border-line-strong rounded-lg px-2 py-1.5 text-xs text-content focus:outline-none focus:border-green-600"
                    />
                  </div>
                  <button
                    onClick={() => applyRange(fromDate, toDate)}
                    disabled={!fromDate || !toDate || fromDate > toDate}
                    className="w-full bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold py-2 rounded-lg transition-colors"
                  >
                    Generate yearbook
                  </button>
                </div>
              )}
            </div>
            <PhotoUploader childList={childList} rangeStart={rangeStart} rangeEnd={rangeEnd} />
            <PhotoManager childList={childList} />
            <button
              onClick={handlePrint}
              disabled={preparing}
              className="flex items-center gap-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-70 disabled:cursor-wait text-white text-sm font-semibold px-3 sm:px-4 py-1.5 rounded-lg transition-colors shrink-0"
            >
              {preparing
                ? <>⏳<span className="ml-0.5">Preparing…</span></>
                : <>{canDownload ? '⬇' : '🔒'}<span className="hidden sm:inline ml-0.5">Download</span> PDF</>}
            </button>
          </div>
        </nav>

        {/* Tab bar */}
        <div className="print:hidden border-b border-line/60 px-6 flex gap-1">
          {(['homeschool', 'homestead'] as const).map(t => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors capitalize ${
                tab === t
                  ? 'border-green-500 text-content'
                  : 'border-transparent text-subtle hover:text-content'
              }`}
            >
              {t === 'homeschool' ? '📚 Homeschool' : '🌾 Homestead'}
            </button>
          ))}
        </div>

        <main className="font-serif max-w-3xl mx-auto px-4 sm:px-6 py-8 print:px-0 print:py-0 print:max-w-none">
          {tab === 'homeschool'
            ? <HomeschoolYearbook
                childList={childList}
                childNotes={childNotes}
                noteYearId={noteYearId}
                subjectMap={subjectMap}
                yearLabel={yearLabel}
                dateRange={dateRange}
                rangeEnd={rangeEnd}
                logs={logs}
                activities={activities}
                portfolio={portfolio}
                photos={photos}
              />
            : <HomesteadYearbook
                yearLabel={yearLabel}
                dateRange={dateRange}
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                livestock={livestock}
                garden={garden}
                preservation={preservation}
                projects={projects}
              />
          }
        </main>
      </div>
    </SlotContext.Provider>
  )
}

// ── Homeschool tab — the keepsake ─────────────────────────────────────────────

const AWARD_TINTS: { background: string; borderColor: string }[] = [
  { background: '#eef1e6', borderColor: '#d3ddbf' }, // sage
  { background: '#f7ecd6', borderColor: '#e7d3ac' }, // gold
  { background: '#f6e6dd', borderColor: '#e6c7b4' }, // terracotta
  { background: '#e7edf0', borderColor: '#cdd9e0' }, // sky
]

// A single child's tribute spread: portrait, name, a warm one-line recap, and the
// superlative awards their year earned. Everything is derived from logged data.
function ChildFeature({ child, logs, activities, portfolio, subjectMap, refDate, photoRows }: {
  child: Child
  logs: DailyLog[]
  activities: Activity[]
  portfolio: PortfolioItem[]
  subjectMap: Record<string, string>
  refDate: string
  photoRows: PhotoRow[]
}) {
  const cLogs = logs.filter(l => l.child_id === child.id)
  const cActs = activities.filter(a => a.child_id === child.id)
  const cPort = portfolio.filter(p => p.child_id === child.id)
  const photos = collectPhotos(child.id, logs, portfolio, photoRows)
  const daysLogged = cLogs.length
  const totalHours = Math.round(cLogs.reduce((s, l) => s + (l.hours ?? 0), 0) * 10) / 10
  const homesteadDays = cLogs.filter(l => l.is_homestead_day).length

  const usage: Record<string, number> = {}
  cLogs.forEach(l => (l.subject_ids ?? []).forEach(id => {
    const n = subjectMap[id]; if (n) usage[n] = (usage[n] ?? 0) + 1
  }))
  const topSubject = Object.entries(usage).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null

  const awards = buildAwards({
    daysLogged, topSubject, photoCount: photos.length,
    activitiesCount: cActs.length, portfolioCount: cPort.length, homesteadDays,
  })
  const age = ageOn(child.birthdate, refDate)
  const subtitle = [child.grade_level, age != null ? `Age ${age}` : null].filter(Boolean).join(' · ')
  const portrait = photos[0] ?? null
  const strip = photos.slice(1, 5) // a slim 4-up filmstrip under the bio

  const narrative = daysLogged > 0
    ? `This year, ${child.name} logged ${daysLogged} day${daysLogged !== 1 ? 's' : ''}${totalHours ? ` and ${totalHours} hours of learning` : ''}${topSubject ? `, with ${topSubject} leading the way` : ''}.`
    : `${child.name}'s story is just getting started — every day you log adds a page.`

  return (
    <Sheet breakAfter center={strip.length === 0}>
      {/* A PHONE-initiated print doesn't trigger the sm: breakpoint, so this falls back to the
          mobile-stacked layout (portrait on top, bio below). The bug was the portrait going
          FULL-WIDTH on top — huge enough to shove the name/narrative/awards off the bottom of the
          sheet, where overflow:hidden clipped them. Fix = cap the portrait in print (print:w-[240px])
          so it stays modest whether the layout ends up stacked (phone) or side-by-side (desktop,
          where sm:flex-row applies). We do NOT force flex-row: at phone width that squeezes the bio
          into a ~90px column and the awards wrap and overflow instead. */}
      <div className="flex flex-col sm:flex-row gap-7 print:gap-4 items-start">
        {/* Portrait — editable; frame is a fixed 4:5 so swapping never moves the awards. */}
        <div className="w-full sm:w-[270px] sm:shrink-0 print:w-[200px] print:shrink-0">
          <EditablePhoto
            slotKey={`child:${child.id}:hero`}
            defaultUrl={portrait?.url ?? null}
            pool={photos}
            childId={child.id}
            frameRatio={4 / 5}
            tilt={-1.5}
            label={child.name}
            monogram={child.name.charAt(0)}
          />
        </div>
        {/* Bio + awards */}
        <div className="flex-1 min-w-0 w-full">
          <p className="font-sans text-[11px] uppercase tracking-[0.22em] text-[#a08b6a] mb-1">Featured Student</p>
          <h2 className="font-serif text-5xl print:text-4xl font-bold text-[#3a2f24] leading-tight">{child.name}</h2>
          {subtitle && <p className="font-serif text-lg text-[#6b5d4c] italic mt-1.5">{subtitle}</p>}
          <p className="font-serif text-[17px] text-[#57493a] leading-relaxed mt-5 print:mt-3">{narrative}</p>
          <div className="grid grid-cols-2 gap-3.5 mt-6 print:mt-4">
            {awards.map((a, i) => (
              <div key={i} className="rounded-xl px-4 py-4 print:py-3 border" style={AWARD_TINTS[i % AWARD_TINTS.length]}>
                <div className="text-3xl leading-none">{a.emoji}</div>
                <div className="font-serif font-bold text-base mt-2 text-[#3a2f24]">{a.title}</div>
                <div className="font-sans text-[10px] uppercase tracking-wider text-[#8a7a5f] mt-0.5">{a.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {strip.length > 0 && (
        // A slim, fixed-height filmstrip (equal cells) — not the page-justified wall, which
        // would over-stack a wide short band into tiny rows. Each tile is editable + covers.
        <div className="mt-7 print:mt-4 shrink-0 flex gap-3 h-40 sm:h-44 print:h-24">
          {strip.map((p) => (
            <div key={p.url} className="flex-1 min-w-0">
              <EditablePhoto
                fill
                slotKey={`wall:child:${child.id}:strip:${shortHash(p.url)}`}
                defaultUrl={p.url}
                pool={photos}
                childId={child.id}
                frameRatio={1}
                label="this"
              />
            </div>
          ))}
        </div>
      )}
    </Sheet>
  )
}

// The parent's "Dear [Name]" message — the one hand-written, emotional page of the
// keepsake (never AI-generated). Editable inline; saves to yearbook_notes via the API.
// An un-filled page shows an on-screen invite but NEVER prints (no blank pages in the PDF).
function ChildMessage({ child, noteYearId, initialMessage, photos }: {
  child: Child; noteYearId: string | null; initialMessage: string; photos: Photo[]
}) {
  const [message, setMessage] = useState(initialMessage)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initialMessage)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const canEdit = !!noteYearId

  async function save() {
    if (!noteYearId) return
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/yearbook-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ childId: child.id, schoolYearId: noteYearId, message: draft.trim() }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as { error?: string }))
        setError(j.error || 'Could not save. Please try again.')
        return
      }
      setMessage(draft.trim())
      setEditing(false)
    } catch {
      setError('Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // Nothing written and can't edit → render nothing at all.
  if (!message && !canEdit) return null

  const messagePhotos = photos.slice(0, 3)

  return (
    <Sheet breakAfter center className={`relative ${!message ? 'print:hidden' : ''}`}>
      {canEdit && !editing && (
        <button
          onClick={() => { setDraft(message); setEditing(true) }}
          className="print:hidden absolute top-5 right-5 font-sans text-[11px] uppercase tracking-wider text-[#a08b6a] hover:text-[#4c6444] border border-[#e6d8bd] rounded-full px-3 py-1 transition-colors z-10"
        >
          {message ? '✎ Edit' : '✎ Write a note'}
        </button>
      )}
      <div className="text-center mb-8">
        <p className="font-sans text-[11px] uppercase tracking-[0.22em] text-[#a08b6a] mb-3">A note for you</p>
        <h2 className="font-serif text-4xl sm:text-5xl font-bold text-[#3a2f24]">Dear {child.name},</h2>
      </div>

      {editing ? (
        <div className="max-w-xl mx-auto w-full">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={8}
            maxLength={5000}
            placeholder={`Write ${child.name} a note about their year — what you're proud of, a favorite memory, your hopes for them…`}
            className="w-full bg-[#fffdf8] border border-[#e6d8bd] rounded-xl p-4 font-serif text-[15px] text-[#3a2f24] leading-relaxed focus:outline-none focus:border-[#4c6444] resize-y"
          />
          {error && <p className="font-sans text-xs text-red-700 mt-2">{error}</p>}
          <div className="flex items-center gap-3 justify-end mt-3">
            <button onClick={() => setEditing(false)} className="font-sans text-sm text-[#a08b6a] hover:text-[#6b5d4c] transition-colors">Cancel</button>
            <button
              onClick={save}
              disabled={saving}
              className="font-sans text-sm font-semibold bg-[#4c6444] hover:bg-[#3f5539] disabled:opacity-50 text-white px-4 py-2 rounded-lg transition-colors"
            >
              {saving ? 'Saving…' : 'Save note'}
            </button>
          </div>
        </div>
      ) : message ? (
        <>
          <div className="max-w-xl mx-auto w-full">
            <p className="font-serif text-[19px] text-[#463a2c] leading-[1.95] whitespace-pre-wrap">{message}</p>
            <p className="font-serif italic text-lg text-right text-[#6b5d4c] mt-7">With love,</p>
          </div>
          {messagePhotos.length > 0 && (
            <div className="flex justify-center gap-4 mt-10 max-w-xl mx-auto w-full">
              {messagePhotos.map((p, i) => (
                <div key={i} className="w-1/3 max-w-[190px]">
                  <EditablePhoto
                    slotKey={`child:${child.id}:letter:${i}`}
                    defaultUrl={p.url}
                    pool={photos}
                    childId={child.id}
                    frameRatio={1}
                    tilt={tiltFor(i)}
                    label={`${child.name}'s`}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="print:hidden text-center max-w-md mx-auto">
          <p className="font-serif italic text-[#8a7a5f] leading-relaxed">
            This is the heart of the keepsake — a few words from you to {child.name} about their year.
            Tap &ldquo;Write a note&rdquo; to add it.
          </p>
        </div>
      )}
    </Sheet>
  )
}

// ── Month pages ───────────────────────────────────────────────────────────────
// Each month is TWO letter pages (even count → prints + binds cleanly):
//   (1) MonthPhotosPage — 90–100% photos of that month + a few logged-note lines.
//   (2) MonthSecondPage — the month's activity/activities → else that month's best
//       work → else overflow photos. Always rendered so pagination stays even.

const MONTH_PAGE = 12     // photos per month page (a full wall)
const MONTH_MAX_PAGES = 2 // cap a photo-heavy month so the book stays a reasonable length

// A month page: a title + a photo wall that fills the whole sheet + a few logged-note
// lines for reference. Best-work/portfolio images already flow into the photo pool, so
// there's no separate "activities/best work" page (and no repetitive tag chips). A
// photo-heavy month spills to a second "continued" page; a month with no photos isn't
// rendered at all (nothing to show → no empty page).
function MonthPhotosPage({ month, photos, pool, noteLines, continued = false }: {
  month: string; photos: Photo[]; pool: Photo[]; noteLines: string[]; continued?: boolean
}) {
  return (
    <Sheet breakAfter>
      <div className="flex items-baseline gap-3 mb-4">
        <h3 className="font-serif text-3xl font-bold text-[#4c6444]">{monthLabel(month)}</h3>
        {continued && <span className="font-sans text-[11px] uppercase tracking-wider text-[#a08b6a] italic">continued</span>}
        <span className="flex-1 h-px bg-[#e6d8bd]" />
      </div>
      {/* Editable tiles: slot key is per-month + per-default-photo (survives repagination if
          the month gains a photo); the picker offers any of that month's photos. */}
      <PhotoWall photos={photos} slotPrefix={`wall:month:${month}`} pool={pool} />
      {noteLines.length > 0 && (
        <div className="mt-5 border-t border-[#ece2cf] pt-3 flex flex-wrap gap-x-5 gap-y-1 justify-center">
          {noteLines.map((n, i) => (
            <span key={i} className="font-serif italic text-[13px] text-[#8a7a5f]">&ldquo;{n}&rdquo;</span>
          ))}
        </div>
      )}
    </Sheet>
  )
}

// The contents page — a warm, honest "in this book" index. No page numbers (the book
// is a flowing render, not a paginated document), but every section is named so the
// reader knows the shape of the keepsake. Sits right after the cover.
function ContentsPage({ months, childList }: { months: string[]; childList: Child[] }) {
  return (
    <Sheet breakAfter center>
      <SpreadTitle sub="In this book">Contents</SpreadTitle>
      <div className="max-w-lg mx-auto w-full space-y-12">
        {months.length > 0 && (
          <div>
            <p className="font-sans text-xs uppercase tracking-[0.2em] text-[#a08b6a] mb-4">The Year, Month by Month</p>
            <div className="flex flex-wrap gap-x-6 gap-y-2.5">
              {months.map(m => (
                <span key={m} className="font-serif text-xl text-[#57493a]">{monthLabel(m)}</span>
              ))}
            </div>
          </div>
        )}
        {childList.length > 0 && (
          <div>
            <p className="font-sans text-xs uppercase tracking-[0.2em] text-[#a08b6a] mb-4">Student Spotlights &amp; Letters</p>
            <div className="space-y-2.5">
              {childList.map(c => (
                <p key={c.id} className="font-serif text-xl text-[#57493a]">
                  {c.name}<span className="text-[#a08b6a] italic"> — a spotlight &amp; a letter home</span>
                </p>
              ))}
            </div>
          </div>
        )}
        <div className="text-center pt-2">
          <span className="text-[#c8912f] text-2xl">❧</span>
        </div>
      </div>
    </Sheet>
  )
}

function HomeschoolYearbook({ childList, childNotes, noteYearId, subjectMap, yearLabel, dateRange, rangeEnd, logs, activities, portfolio, photos }: {
  childList: Child[]
  childNotes: Record<string, string>
  noteYearId: string | null
  subjectMap: Record<string, string>
  yearLabel: string
  dateRange: string
  rangeEnd: string
  logs: DailyLog[]
  activities: Activity[]
  portfolio: PortfolioItem[]
  photos: PhotoRow[]
}) {
  const totalHours = Math.round(logs.reduce((s, l) => s + (l.hours ?? 0), 0) * 10) / 10
  const homesteadDays = logs.filter(l => l.is_homestead_day).length

  const allPhotos = collectPhotos(null, logs, portfolio, photos)
  const featuredImg = portfolio.find(p => p.is_featured && p.file_type === 'image' && p.file_url)
  const hero: Photo | null = featuredImg
    ? { url: featuredImg.file_url!, caption: '', date: featuredImg.item_date, childId: featuredImg.child_id }
    : (allPhotos[0] ? { ...allPhotos[0], caption: '' } : null)
  const kidNames = childList.map(c => c.name).join('  ·  ')

  // Photos & note snippets grouped by month. Only months that actually have photos get
  // pages (a photo-first book skips empty months rather than printing a blank sheet).
  const photosByMonth: Record<string, Photo[]> = {}
  allPhotos.forEach(p => { (photosByMonth[monthKey(p.date)] ??= []).push(p) })
  const notesByMonth: Record<string, string[]> = {}
  logs.forEach(l => { if (l.notes && l.notes.trim()) (notesByMonth[monthKey(l.log_date)] ??= []).push(l.notes.trim()) })
  const photoMonths = Object.keys(photosByMonth).sort()

  if (logs.length === 0 && activities.length === 0 && portfolio.length === 0 && photos.length === 0) {
    return (
      <Sheet className="text-center py-16">
        <div className="text-5xl mb-4">📖</div>
        <h2 className="font-serif text-2xl font-bold text-[#3a2f24] mb-2">Your yearbook starts here</h2>
        <p className="font-serif text-[#6b5d4c] mb-6 max-w-sm mx-auto leading-relaxed">
          Log school days and add photos to your daily entries — Cultivate turns them into a keepsake yearbook automatically, no extra work.
        </p>
        <Link href="/dashboard" className="font-sans inline-block bg-[#4c6444] hover:bg-[#3f5539] text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors">
          Log today →
        </Link>
      </Sheet>
    )
  }

  const coverStats = [
    { val: logs.length, label: 'days logged' },
    { val: totalHours || '—', label: 'hours learned' },
    { val: homesteadDays || '—', label: 'hands-on days' },
    { val: activities.length || '—', label: 'activities' },
  ]

  return (
    <>
      {/* ── Cover (vertically centered) ── */}
      <Sheet breakAfter center className="text-center">
        <p className="font-sans text-[11px] uppercase tracking-[0.28em] text-[#a08b6a] mb-6">Cultivate · Homeschool Yearbook</p>
        <p className="font-serif text-[#9a7b3f] text-xl mb-1">The</p>
        <h1 className="font-serif text-6xl sm:text-7xl font-bold tracking-tight text-[#3a2f24] leading-none">{yearLabel}</h1>
        <p className="font-serif text-2xl text-[#6b5d4c] mt-4 italic">{kidNames}</p>
        <div className="flex items-center gap-3 justify-center my-7 text-[#c8912f] text-xl">
          <span className="h-px w-12 bg-[#e0cfa8]" />❧<span className="h-px w-12 bg-[#e0cfa8]" />
        </div>
        {hero && (
          // Fixed 4:3 frame + `fill` so the cover photo COVERS (fills, gentle crop) instead of
          // matting with white bars when it's a portrait shot in a landscape frame. Slightly
          // smaller on print so the whole cover (title → photo → stats) fits one sheet.
          <div className="max-w-md print:max-w-sm mx-auto aspect-[4/3]">
            <EditablePhoto
              fill
              slotKey="cover:hero"
              defaultUrl={hero.url}
              pool={allPhotos}
              frameRatio={4 / 3}
              tilt={-1.5}
              label="cover"
            />
          </div>
        )}
        <p className="font-sans text-sm text-[#a08b6a] mt-7 print:mt-4 tracking-wide">{dateRange}</p>
        {/* print:grid-cols-4 forces ONE stat row when printing — a phone-initiated print doesn't
            hit the sm: breakpoint, so without this the stats fall to a 2×2 block whose second row
            gets clipped off the bottom of the sheet. */}
        <div className="grid grid-cols-2 sm:grid-cols-4 print:grid-cols-4 gap-3 max-w-xl mx-auto mt-9 print:mt-5">
          {coverStats.map(({ val, label }) => (
            <div key={label} className="bg-[#f4ecdb] border border-[#e6d8bd] rounded-xl py-4 print:py-3 px-2">
              <div className="font-serif text-3xl font-bold text-[#4c6444]">{val}</div>
              <div className="font-sans text-[10px] uppercase tracking-wider text-[#a08b6a] mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </Sheet>

      {/* ── Contents ── */}
      <ContentsPage months={photoMonths} childList={childList} />

      {/* ── Per month: 1–2 photo pages that fill the sheet (photo-heavy months spill to a
           "continued" page); no tags, no empty pages. ── */}
      {photoMonths.flatMap((month) => {
        const mp = (photosByMonth[month] ?? []).slice(0, MONTH_PAGE * MONTH_MAX_PAGES)
        const notes = [...new Set(notesByMonth[month] ?? [])].slice(0, 3).map(n => (n.length > 80 ? n.slice(0, 78) + '…' : n))
        const pages: ReactNode[] = []
        for (let i = 0; i < mp.length; i += MONTH_PAGE) {
          pages.push(
            <MonthPhotosPage
              key={`${month}-${i}`}
              month={month}
              photos={mp.slice(i, i + MONTH_PAGE)}
              pool={mp}
              noteLines={i === 0 ? notes : []}
              continued={i > 0}
            />
          )
        }
        return pages
      })}

      {/* ── Per-child finale: the tribute spotlight, then the parent's message. This is
           the emotional close of the book — spotlight (record) → letter (love). ── */}
      {childList.map((child) => (
        <Fragment key={child.id}>
          <ChildFeature
            child={child}
            logs={logs}
            activities={activities}
            portfolio={portfolio}
            subjectMap={subjectMap}
            refDate={rangeEnd}
            photoRows={photos}
          />
          <ChildMessage
            child={child}
            noteYearId={noteYearId}
            initialMessage={childNotes[child.id] ?? ''}
            photos={collectPhotos(child.id, logs, portfolio, photos)}
          />
        </Fragment>
      ))}

      {/* ── Closing (vertically centered) ── */}
      <Sheet center className="text-center">
        <div className="text-4xl mb-4 text-[#c8912f]">❧</div>
        <h2 className="font-serif text-4xl font-bold text-[#3a2f24]">What a Year.</h2>
        <p className="font-serif italic text-xl text-[#6b5d4c] mt-4 max-w-md mx-auto leading-relaxed">
          Every day logged, every photo taken, every lesson learned — it all added up to this. Here&apos;s to the next chapter.
        </p>
        <p className="font-sans text-sm text-[#a08b6a] mt-12">Made with Cultivate · mycultivate.app</p>
        <p className="font-sans text-[11px] text-[#b0a17f] mt-1">{yearLabel} · {dateRange}</p>
      </Sheet>
    </>
  )
}

// ── Homestead tab ─────────────────────────────────────────────────────────────

function HomesteadYearbook({ yearLabel, dateRange, rangeStart, livestock, garden, preservation, projects }: {
  yearLabel: string
  dateRange: string
  rangeStart: string
  rangeEnd: string
  livestock: LivestockLog[]
  garden: GardenEntry[]
  preservation: PreservationLog[]
  projects: Project[]
}) {
  const hasData = livestock.length > 0 || garden.length > 0 || preservation.length > 0 || projects.length > 0
  const year = new Date(rangeStart).getFullYear()

  if (!hasData) {
    return (
      <div className="text-center py-20">
        <div className="text-5xl mb-4">🌾</div>
        <p className="text-muted font-semibold mb-2">No homestead data yet</p>
        <p className="text-subtle text-sm mb-6">Log livestock, garden, and preservation activity to build your homestead wrap-up.</p>
        <Link href="/dashboard" className="text-green-400 hover:text-green-300 text-sm">Log today →</Link>
      </div>
    )
  }

  // Livestock stats
  const animalGroups: Record<string, { count: number; totalQty: number; unit: string | null; revenue: number }> = {}
  livestock.forEach(l => {
    const key = l.animal_name ?? l.animal_type
    if (!animalGroups[key]) animalGroups[key] = { count: 0, totalQty: 0, unit: l.unit, revenue: 0 }
    animalGroups[key].count++
    animalGroups[key].totalQty += l.quantity ?? 0
    animalGroups[key].revenue += isSold(l) ? (l.sale_amount ?? 0) : 0
  })
  // The year's earnings, from animals, produce, and everything they put up.
  const totalRevenue = homesteadRevenue({ livestock, garden, preservation })

  // Garden stats
  const harvested = garden.filter(g => g.status === 'harvested')
  const failed = garden.filter(g => g.status === 'failed')
  const growing = garden.filter(g => g.status === 'planted' || g.status === 'growing')

  // Preservation stats
  const byMethod: Record<string, number> = {}
  preservation.forEach(p => { byMethod[p.method] = (byMethod[p.method] ?? 0) + 1 })
  const topItems = Object.entries(
    preservation.reduce((acc, p) => { acc[p.item_name] = (acc[p.item_name] ?? 0) + 1; return acc }, {} as Record<string, number>)
  ).sort(([,a],[,b]) => b-a).slice(0, 6)

  // Completed projects
  const homesteadProjects = projects.filter(p => p.category === 'homestead')
  const diyProjects = projects.filter(p => p.category === 'home_diy')

  // Livestock by month for a simple activity chart
  const livestockByMonth: Record<string, number> = {}
  livestock.forEach(l => {
    const k = monthKey(l.log_date)
    livestockByMonth[k] = (livestockByMonth[k] ?? 0) + 1
  })
  const preservationByMonth: Record<string, number> = {}
  preservation.forEach(p => {
    const k = monthKey(p.log_date)
    preservationByMonth[k] = (preservationByMonth[k] ?? 0) + 1
  })

  return (
    <>
      {/* Cover */}
      <section className="text-center mb-16 print:min-h-screen print:flex print:flex-col print:justify-center print:items-center">
        <div className="print:hidden text-5xl mb-4">🌾</div>
        <div className="text-xs font-semibold text-amber-500 uppercase tracking-widest mb-3 print:text-amber-700">Cultivate · Homestead</div>
        <h1 className="text-4xl font-bold tracking-tight mb-2 print:text-stone-900">{yearLabel}</h1>
        <p className="text-muted text-lg mb-1 print:text-subtle">Homestead Wrap-Up</p>
        <p className="text-subtle text-sm mb-10 print:text-muted">{dateRange}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 print:grid-cols-4 gap-3 max-w-lg mx-auto">
          {[
            { val: livestock.length, label: 'livestock logs', color: 'text-amber-400' },
            { val: harvested.length, label: 'crops harvested', color: 'text-green-400' },
            { val: preservation.length, label: 'preservation batches', color: 'text-sky-400' },
            { val: homesteadProjects.length + diyProjects.length, label: 'projects done', color: 'text-content' },
          ].map(({ val, label, color }) => (
            <div key={label} className="bg-card/60 print:bg-stone-100 border border-line print:border-stone-200 rounded-xl py-4 px-3 text-center">
              <div className={`text-2xl font-bold ${color} print:text-stone-800`}>{val || '—'}</div>
              <div className="text-xs text-subtle mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Livestock section */}
      {livestock.length > 0 && (
        <section className="mb-12">
          <div className="flex items-center gap-4 mb-5">
            <h2 className="text-xl font-bold print:text-stone-900">Livestock</h2>
            <div className="flex-1 h-px bg-elevated print:bg-stone-200" />
            <span className="text-xs text-subtle">{livestock.length} logs</span>
          </div>
          <div className="space-y-3 mb-4">
            {Object.entries(animalGroups).map(([name, data]) => (
              <div key={name} className="bg-card/60 print:bg-stone-50 border border-line print:border-stone-200 rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-content print:text-stone-800 capitalize">{name}</p>
                  <p className="text-xs text-subtle mt-0.5">
                    {data.count} log{data.count !== 1 ? 's' : ''}
                    {data.totalQty > 0 && ` · ${data.totalQty} ${data.unit ?? ''}`}
                  </p>
                </div>
                {data.revenue > 0 && (
                  <span className="text-sm font-semibold text-emerald-400 print:text-emerald-700">
                    ${data.revenue.toFixed(2)} revenue
                  </span>
                )}
              </div>
            ))}
          </div>
          {totalRevenue > 0 && (
            <div className="bg-emerald-950/30 print:bg-emerald-50 border border-emerald-900/50 print:border-emerald-200 rounded-xl px-4 py-3 text-center">
              <p className="text-xs text-subtle mb-0.5">Total {year} livestock revenue</p>
              <p className="text-2xl font-bold text-emerald-400 print:text-emerald-700">${totalRevenue.toFixed(2)}</p>
            </div>
          )}
        </section>
      )}

      {/* Garden section */}
      {garden.length > 0 && (
        <section className="mb-12">
          <div className="flex items-center gap-4 mb-5">
            <h2 className="text-xl font-bold print:text-stone-900">Garden</h2>
            <div className="flex-1 h-px bg-elevated print:bg-stone-200" />
            <span className="text-xs text-subtle">{garden.length} crops</span>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-card/60 border border-line rounded-xl py-3 text-center">
              <div className="text-xl font-bold text-green-400">{harvested.length}</div>
              <div className="text-xs text-subtle mt-0.5">harvested</div>
            </div>
            <div className="bg-card/60 border border-line rounded-xl py-3 text-center">
              <div className="text-xl font-bold text-amber-400">{growing.length}</div>
              <div className="text-xs text-subtle mt-0.5">still growing</div>
            </div>
            <div className="bg-card/60 border border-line rounded-xl py-3 text-center">
              <div className="text-xl font-bold text-red-400">{failed.length}</div>
              <div className="text-xs text-subtle mt-0.5">failed</div>
            </div>
          </div>
          {harvested.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-subtle uppercase tracking-wider mb-2">What we grew</p>
              <div className="flex flex-wrap gap-2">
                {harvested.map((g, i) => (
                  <span key={i} className="text-xs bg-green-950/40 print:bg-green-50 border border-green-900/50 print:border-green-200 text-green-300 print:text-green-800 px-2.5 py-1 rounded-full capitalize">
                    {g.crop_name}{g.variety ? ` (${g.variety})` : ''}
                  </span>
                ))}
              </div>
            </div>
          )}
          {failed.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-subtle uppercase tracking-wider mb-2">Lessons learned</p>
              <div className="flex flex-wrap gap-2">
                {failed.map((g, i) => (
                  <span key={i} className="text-xs bg-elevated text-subtle px-2.5 py-1 rounded-full capitalize">
                    {g.crop_name} — failed
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Preservation section */}
      {preservation.length > 0 && (
        <section className="mb-12">
          <div className="flex items-center gap-4 mb-5">
            <h2 className="text-xl font-bold print:text-stone-900">Food Preservation</h2>
            <div className="flex-1 h-px bg-elevated print:bg-stone-200" />
            <span className="text-xs text-subtle">{preservation.length} batches</span>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {Object.entries(byMethod).sort(([,a],[,b])=>b-a).map(([method, count]) => (
              <div key={method} className="bg-card/60 border border-line rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-content print:text-subtle">{METHOD_LABELS[method] ?? method}</span>
                <span className="text-sm font-bold text-sky-400 print:text-sky-700">{count}</span>
              </div>
            ))}
          </div>
          {topItems.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-subtle uppercase tracking-wider mb-2">Most preserved</p>
              <div className="space-y-1.5">
                {topItems.map(([item, count]) => (
                  <div key={item} className="flex items-center justify-between text-sm">
                    <span className="text-content print:text-subtle capitalize">{item}</span>
                    <span className="text-subtle text-xs">{count} batch{count !== 1 ? 'es' : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Completed projects */}
      {(homesteadProjects.length > 0 || diyProjects.length > 0) && (
        <section className="mb-12">
          <div className="flex items-center gap-4 mb-5">
            <h2 className="text-xl font-bold print:text-stone-900">Projects Completed</h2>
            <div className="flex-1 h-px bg-elevated print:bg-stone-200" />
          </div>
          {homesteadProjects.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-subtle uppercase tracking-wider mb-2">Homestead</p>
              <div className="space-y-2">
                {homesteadProjects.map(p => (
                  <div key={p.id} className="flex items-center gap-3 bg-card/60 border border-line rounded-lg px-4 py-2.5">
                    <span className="text-green-600 text-sm">✓</span>
                    <div>
                      <p className="text-sm font-medium text-content print:text-stone-800">{p.title}</p>
                      {p.description && <p className="text-xs text-subtle">{p.description}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {diyProjects.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-subtle uppercase tracking-wider mb-2">Home & DIY</p>
              <div className="space-y-2">
                {diyProjects.map(p => (
                  <div key={p.id} className="flex items-center gap-3 bg-card/60 border border-line rounded-lg px-4 py-2.5">
                    <span className="text-sky-600 text-sm">✓</span>
                    <div>
                      <p className="text-sm font-medium text-content print:text-stone-800">{p.title}</p>
                      {p.description && <p className="text-xs text-subtle">{p.description}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <section className="text-center py-12 print:min-h-screen print:flex print:flex-col print:justify-center print:items-center">
        <p className="text-subtle text-sm mb-1">Generated by Cultivate · mycultivate.app</p>
        <p className="text-subtle text-xs">{yearLabel} Homestead Wrap-Up · {dateRange}</p>
      </section>
    </>
  )
}
