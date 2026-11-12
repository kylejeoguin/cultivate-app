'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Child } from '@/lib/types'
import { todayLocalISO } from '@/lib/use-today'

const MAX_FILE_MB = 15
const MAX_FILES = 40

function fmtDate(d: string): string {
  const dt = new Date(d + 'T12:00:00')
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

type Pending = {
  id: string
  file: File
  preview: string
  takenOn: string      // yyyy-mm-dd — EXIF capture date when available, else file date
  childIds: string[]   // who's in this photo
  fromExif: boolean    // did we get the date from EXIF (vs. a fallback)?
}

// Bulk "shoebox" photo upload for the yearbook. Reads each photo's EXIF capture date so
// old photos land in the right month/year automatically (with a manual override), lets
// the user tag who's in each, and writes straight to the photos table (source='bulk') —
// the same table the log flow uses, so attribution + the yearbook work identically.
export default function PhotoUploader({ childList, rangeStart, rangeEnd }: {
  childList: Child[]
  // The dates currently shown in the yearbook — so after upload we can tell the user when
  // their photos land outside this window (and offer to jump to them).
  rangeStart: string
  rangeEnd: string
}) {
  const router = useRouter()
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Pending[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [bulkDate, setBulkDate] = useState('')
  // Set after a successful upload → shows a confirmation (count + date span) instead of
  // silently closing on a view where the photos might be out of range.
  const [result, setResult] = useState<{ count: number; minDate: string; maxDate: string } | null>(null)

  const reset = useCallback(() => {
    setItems(prev => { prev.forEach(p => URL.revokeObjectURL(p.preview)); return [] })
    setError(''); setProgress(0); setBulkDate('')
  }, [])

  function close() {
    if (busy) return
    reset()
    setResult(null)
    setOpen(false)
  }

  // Close on Escape or a click outside the panel (matches the app's other pop-ups, and
  // keeps the overlay/panel divs free of click handlers a11y-lint would flag). Never
  // closes mid-upload.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) { reset(); setOpen(false) } }
    const onDown = (e: MouseEvent) => {
      if (!busy && panelRef.current && !panelRef.current.contains(e.target as Node)) { reset(); setOpen(false) }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown) }
  }, [open, busy, reset])

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    setError('')
    const files = Array.from(e.target.files ?? [])
    if (fileRef.current) fileRef.current.value = '' // allow re-picking the same files
    if (!files.length) return

    const room = MAX_FILES - items.length
    if (room <= 0) { setError(`Up to ${MAX_FILES} photos at a time.`); return }
    const take = files.slice(0, room)
    const oversized = take.find(f => f.size > MAX_FILE_MB * 1024 * 1024)
    if (oversized) { setError(`${oversized.name} is over ${MAX_FILE_MB}MB`); return }

    // Seed entries UNDATED; the real capture date comes from EXIF below. We deliberately do
    // NOT fall back to the file's last-modified date — that's just when the file was copied
    // to the device (≈ upload day), which silently mis-dated old photos. A photo with no
    // date metadata stays blank and the user sets it (upload is blocked until they do).
    const seeded: Pending[] = take.map((file, i) => ({
      id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`,
      file,
      preview: URL.createObjectURL(file),
      takenOn: '',
      childIds: [],
      fromExif: false,
    }))
    setItems(prev => [...prev, ...seeded])

    // EXIF capture date (lazy-load the parser so it's not in the base yearbook bundle).
    // Try the several tags cameras/phones use, most-original first. exifr returns a Date
    // built from the EXIF wall-clock; todayLocalISO reads its local Y/M/D (no tz shift).
    try {
      const exifr = (await import('exifr')).default
      await Promise.all(seeded.map(async s => {
        try {
          const meta = await exifr.parse(s.file, { pick: ['DateTimeOriginal', 'CreateDate', 'DateTimeDigitized'] })
          const dt: Date | undefined = meta?.DateTimeOriginal ?? meta?.CreateDate ?? meta?.DateTimeDigitized
          if (dt instanceof Date && !isNaN(dt.getTime())) {
            setItems(prev => prev.map(p => p.id === s.id ? { ...p, takenOn: todayLocalISO(dt), fromExif: true } : p))
          }
        } catch { /* no readable EXIF — leave it undated for the user to set */ }
      }))
    } catch { /* parser failed to load — items stay undated */ }
  }

  function update(id: string, patch: Partial<Pending>) {
    setItems(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))
  }
  function toggleChild(id: string, childId: string) {
    setItems(prev => prev.map(p => {
      if (p.id !== id) return p
      const has = p.childIds.includes(childId)
      return { ...p, childIds: has ? p.childIds.filter(c => c !== childId) : [...p.childIds, childId] }
    }))
  }
  function remove(id: string) {
    setItems(prev => { const t = prev.find(p => p.id === id); if (t) URL.revokeObjectURL(t.preview); return prev.filter(p => p.id !== id) })
  }
  // Fill ONLY the photos that have no date yet, so it never clobbers a good EXIF date.
  function applyBulkDate() {
    if (!bulkDate) return
    setItems(prev => prev.map(p => p.takenOn ? p : { ...p, takenOn: bulkDate, fromExif: false }))
  }

  async function upload() {
    if (!items.length) return
    setBusy(true); setError(''); setProgress(0)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Please sign in again.'); setBusy(false); return }

    let done = 0
    const failures: string[] = []
    for (const it of items) {
      const ext = it.file.name.split('.').pop() ?? 'jpg'
      const path = `${user.id}/bulk-${it.takenOn}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage.from('log-photos')
        .upload(path, it.file, { contentType: it.file.type, upsert: false })
      if (upErr) { failures.push(it.file.name); done++; setProgress(done); continue }

      const { data: urlData } = supabase.storage.from('log-photos').getPublicUrl(path)
      if (urlData?.publicUrl) {
        const { error: insErr } = await supabase.from('photos').insert({
          user_id: user.id,
          url: urlData.publicUrl,
          taken_on: it.takenOn,
          caption: null,
          child_ids: it.childIds,
          source: 'bulk',
        })
        if (insErr) failures.push(it.file.name)
      }
      done++; setProgress(done)
    }

    setBusy(false)
    if (failures.length) {
      setError(`${failures.length} photo${failures.length !== 1 ? 's' : ''} couldn't be saved. The rest were added.`)
      setItems(prev => prev.filter(p => failures.includes(p.file.name)))
      router.refresh()
      return
    }
    // Success — summarize (count + date span) rather than silently closing, so the user
    // gets confirmation even when the photos land outside the year they're viewing.
    const dates = items.map(i => i.takenOn).sort()
    setResult({ count: items.length, minDate: dates[0], maxDate: dates[dates.length - 1] })
    reset()
    router.refresh() // reveals any that fall inside the current view immediately
  }

  // Jump the yearbook to a range that spans every photo just uploaded.
  function viewUploaded() {
    if (!result) return
    reset(); setResult(null); setOpen(false)
    router.push(`/dashboard/yearbook?start=${result.minDate}&end=${result.maxDate}`)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 bg-card border border-line-strong rounded-lg px-3 py-1.5 text-sm text-content hover:border-green-600 transition-colors shrink-0"
      >
        📷<span className="hidden sm:inline">Add photos</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div
            ref={panelRef}
            className="bg-card border border-line-strong rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-line">
              <div>
                <h2 className="text-base font-bold text-content">Add photos to the yearbook</h2>
                <p className="text-xs text-subtle mt-0.5">We read each photo&rsquo;s date so it lands in the right month. Tag who&rsquo;s in it (optional).</p>
              </div>
              <button onClick={close} aria-label="Close" className="text-subtle hover:text-content w-8 h-8 rounded-full flex items-center justify-center text-lg shrink-0">✕</button>
            </div>

            {result && (() => {
              const outOfRange = result.minDate < rangeStart || result.maxDate > rangeEnd
              return (
                <div className="px-5 py-8 text-center space-y-4">
                  <div className="text-4xl">✓</div>
                  <div>
                    <h3 className="text-lg font-bold text-content">Added {result.count} photo{result.count !== 1 ? 's' : ''}</h3>
                    <p className="text-sm text-subtle mt-1">
                      {result.minDate === result.maxDate ? `Dated ${fmtDate(result.minDate)}.` : `Dated ${fmtDate(result.minDate)} – ${fmtDate(result.maxDate)}.`}
                    </p>
                  </div>
                  {outOfRange && (
                    <p className="text-sm text-amber-600 dark:text-amber-400">
                      Some fall outside the dates you&rsquo;re viewing ({fmtDate(rangeStart)} – {fmtDate(rangeEnd)}), so they won&rsquo;t all appear here yet.
                    </p>
                  )}
                  <div className="flex flex-col gap-2 pt-1 max-w-xs mx-auto">
                    {outOfRange && (
                      <button onClick={viewUploaded} className="bg-green-700 hover:bg-green-600 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors">
                        View the photos I just added
                      </button>
                    )}
                    <button onClick={close} className="text-sm text-subtle hover:text-content py-1.5">Done</button>
                  </div>
                </div>
              )
            })()}

            {!result && (
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {items.length === 0 ? (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full border-2 border-dashed border-line-strong rounded-xl py-12 text-sm text-subtle hover:text-content hover:border-green-600 transition-colors flex flex-col items-center gap-2"
                >
                  <span className="text-3xl">🗂️</span>
                  Choose photos from your device
                  <span className="text-xs text-subtle">Up to {MAX_FILES} at once · {MAX_FILE_MB}MB each</span>
                </button>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <button onClick={() => fileRef.current?.click()} className="text-xs text-green-700 dark:text-green-400 hover:underline">＋ Add more</button>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-subtle">Date the undated:</span>
                      <input type="date" value={bulkDate} onChange={e => setBulkDate(e.target.value)}
                        className="bg-surface border border-line-strong rounded-md px-2 py-1 text-xs text-content focus:outline-none focus:border-green-600" />
                      <button onClick={applyBulkDate} disabled={!bulkDate} className="text-xs text-green-700 dark:text-green-400 hover:underline disabled:opacity-40">Apply</button>
                    </div>
                  </div>

                  {items.map(it => (
                    <div key={it.id} className={`flex gap-3 rounded-lg p-2.5 border ${it.takenOn ? 'bg-elevated/50 border-line' : 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800'}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={it.preview} alt="" className="w-16 h-16 object-cover rounded-md border border-line-strong shrink-0" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <input type="date" value={it.takenOn} onChange={e => update(it.id, { takenOn: e.target.value, fromExif: false })}
                            className="bg-surface border border-line-strong rounded-md px-2 py-1 text-xs text-content focus:outline-none focus:border-green-600" />
                          {it.takenOn === ''
                            ? <span className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">⚠ no date in photo — set it</span>
                            : it.fromExif
                              ? <span className="text-[11px] text-subtle">📷 from photo</span>
                              : <span className="text-[11px] text-subtle">set by you</span>}
                          <button onClick={() => remove(it.id)} className="ml-auto text-xs text-subtle hover:text-red-500">Remove</button>
                        </div>
                        {childList.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {childList.map(c => {
                              const sel = it.childIds.includes(c.id)
                              return (
                                <button key={c.id} type="button" onClick={() => toggleChild(it.id, c.id)}
                                  className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${sel ? 'bg-green-700 text-white' : 'bg-elevated text-muted hover:bg-line-strong'}`}>
                                  {c.name}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              )}

              {error && <p className="text-red-500 text-sm">{error}</p>}
            </div>
            )}

            {!result && (() => {
              const undated = items.filter(i => !i.takenOn).length
              return (
                <div className="px-5 py-4 border-t border-line flex items-center justify-between gap-3">
                  <button onClick={close} disabled={busy} className="text-sm text-subtle hover:text-content disabled:opacity-50">Cancel</button>
                  <button
                    onClick={upload}
                    disabled={busy || items.length === 0 || undated > 0}
                    className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
                  >
                    {busy
                      ? `Uploading ${progress}/${items.length}…`
                      : undated > 0
                        ? `${undated} need${undated === 1 ? 's' : ''} a date`
                        : `Add ${items.length || ''} photo${items.length !== 1 ? 's' : ''}`}
                  </button>
                </div>
              )
            })()}

            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple onChange={handleFiles} className="hidden" />
          </div>
        </div>
      )}
    </>
  )
}
