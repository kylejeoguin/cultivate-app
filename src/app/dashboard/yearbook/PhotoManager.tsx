'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { photoSrc } from '@/lib/photoUrls'
import type { Child } from '@/lib/types'

type PhotoItem = {
  id: string
  url: string
  caption: string
  taken_on: string
  child_ids: string[]
  source: string
}

// Fine-tune already-saved photos: fix a date, edit the caption, re-tag who's in it, or delete
// one. Reads/writes the SAME photos table the log flow + bulk uploader use, so changes flow
// straight into the yearbook's per-child attribution. Edits/deletes go through /api/photo
// (server-side, ownership-checked; delete also removes the storage file).
export default function PhotoManager({ childList }: { childList: Child[] }) {
  const router = useRouter()
  const supabase = createClient()
  const panelRef = useRef<HTMLDivElement>(null)

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<PhotoItem[]>([])
  // Snapshot of each row's saved values, to detect unsaved edits (dirty).
  const [saved, setSaved] = useState<Record<string, { caption: string; taken_on: string; child_ids: string[] }>>({})
  const [filterChild, setFilterChild] = useState<string>('all') // 'all' | childId | 'untagged'
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [capped, setCapped] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const { data, error } = await supabase
      .from('photos')
      .select('id, url, caption, taken_on, child_ids, source')
      .order('taken_on', { ascending: false })
      .limit(1000)
    if (error) { setError('Could not load your photos.'); setLoading(false); return }
    const rows: PhotoItem[] = (data ?? []).map(r => ({
      id: r.id as string,
      url: r.url as string,
      caption: (r.caption as string | null) ?? '',
      taken_on: r.taken_on as string,
      child_ids: (r.child_ids as string[] | null) ?? [],
      source: (r.source as string | null) ?? 'log',
    }))
    setItems(rows)
    setSaved(Object.fromEntries(rows.map(r => [r.id, { caption: r.caption, taken_on: r.taken_on, child_ids: [...r.child_ids] }])))
    setCapped(rows.length >= 1000)
    setLoading(false)
  }, [supabase])

  function openManager() { setOpen(true); load() }

  // Close on Escape or a click outside the panel — but never mid-save. Using document
  // listeners (rather than a handler on the overlay div) keeps the markup a11y-lint-clean,
  // matching the pattern in PhotoUploader.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busyId) setOpen(false) }
    const onDown = (e: MouseEvent) => {
      if (!busyId && panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown) }
  }, [open, busyId])

  function setField(id: string, patch: Partial<PhotoItem>) {
    setItems(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))
  }
  function toggleChild(id: string, childId: string) {
    setItems(prev => prev.map(p => {
      if (p.id !== id) return p
      const has = p.child_ids.includes(childId)
      return { ...p, child_ids: has ? p.child_ids.filter(c => c !== childId) : [...p.child_ids, childId] }
    }))
  }

  function isDirty(p: PhotoItem): boolean {
    const s = saved[p.id]
    if (!s) return false
    return s.caption !== p.caption || s.taken_on !== p.taken_on
      || s.child_ids.length !== p.child_ids.length || s.child_ids.some(id => !p.child_ids.includes(id))
  }

  async function save(p: PhotoItem) {
    setBusyId(p.id); setError('')
    const res = await fetch('/api/photo', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, caption: p.caption, taken_on: p.taken_on, child_ids: p.child_ids }),
    })
    setBusyId(null)
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d?.error || 'Could not save.'); return }
    setSaved(prev => ({ ...prev, [p.id]: { caption: p.caption, taken_on: p.taken_on, child_ids: [...p.child_ids] } }))
    router.refresh()
  }

  async function del(id: string) {
    setBusyId(id); setError('')
    const res = await fetch('/api/photo', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setBusyId(null); setConfirmDelete(null)
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d?.error || 'Could not delete.'); return }
    setItems(prev => prev.filter(p => p.id !== id))
    setSaved(prev => { const n = { ...prev }; delete n[id]; return n })
    router.refresh()
  }

  const shown = items.filter(p =>
    filterChild === 'all' ? true
      : filterChild === 'untagged' ? p.child_ids.length === 0
        : p.child_ids.includes(filterChild)
  )

  return (
    <>
      <button
        onClick={openManager}
        className="flex items-center gap-1.5 bg-card border border-line-strong rounded-lg px-3 py-1.5 text-sm text-content hover:border-green-600 transition-colors shrink-0"
      >
        🗂️<span className="hidden sm:inline">Manage photos</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div ref={panelRef} className="bg-card border border-line-strong rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-line">
              <div>
                <h2 className="text-base font-bold text-content">Manage photos</h2>
                <p className="text-xs text-subtle mt-0.5">Fix a date, edit the caption, re-tag who&rsquo;s in it, or delete a photo.</p>
              </div>
              <button onClick={() => !busyId && setOpen(false)} aria-label="Close" className="text-subtle hover:text-content w-8 h-8 rounded-full flex items-center justify-center text-lg shrink-0">✕</button>
            </div>

            {/* Filter bar */}
            {items.length > 0 && (
              <div className="px-5 py-2.5 border-b border-line flex items-center gap-2 flex-wrap">
                <span className="text-xs text-subtle">Show:</span>
                <button onClick={() => setFilterChild('all')}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${filterChild === 'all' ? 'bg-green-700 text-white' : 'bg-elevated text-muted hover:bg-line-strong'}`}>
                  All ({items.length})
                </button>
                {childList.map(c => (
                  <button key={c.id} onClick={() => setFilterChild(c.id)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${filterChild === c.id ? 'bg-green-700 text-white' : 'bg-elevated text-muted hover:bg-line-strong'}`}>
                    {c.name}
                  </button>
                ))}
                <button onClick={() => setFilterChild('untagged')}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${filterChild === 'untagged' ? 'bg-green-700 text-white' : 'bg-elevated text-muted hover:bg-line-strong'}`}>
                  Untagged
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {loading ? (
                <div className="py-16 text-center text-sm text-subtle">
                  <span className="inline-block w-5 h-5 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                  <p className="mt-2">Loading your photos…</p>
                </div>
              ) : items.length === 0 ? (
                <div className="py-16 text-center text-sm text-subtle">
                  <div className="text-3xl mb-2">📷</div>
                  No photos yet. Add photos from a daily log or the &ldquo;Add photos&rdquo; button.
                </div>
              ) : shown.length === 0 ? (
                <div className="py-12 text-center text-sm text-subtle">No photos match this filter.</div>
              ) : (
                shown.map(p => {
                  const dirty = isDirty(p)
                  return (
                    <div key={p.id} className="flex gap-3 rounded-lg p-2.5 border border-line bg-elevated/40">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photoSrc(p.url, 240)} alt={p.caption || ''} className="w-20 h-20 object-cover rounded-md border border-line-strong shrink-0" loading="lazy" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <input type="date" value={p.taken_on} onChange={e => setField(p.id, { taken_on: e.target.value })}
                            className="bg-surface border border-line-strong rounded-md px-2 py-1 text-xs text-content focus:outline-none focus:border-green-600" />
                          {p.source === 'bulk' && <span className="text-[11px] text-subtle">bulk upload</span>}
                          {confirmDelete === p.id ? (
                            <span className="ml-auto flex items-center gap-2">
                              <span className="text-[11px] text-red-600 dark:text-red-400">Delete?</span>
                              <button onClick={() => del(p.id)} disabled={busyId === p.id}
                                className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline disabled:opacity-50">
                                {busyId === p.id ? 'Deleting…' : 'Yes, delete'}
                              </button>
                              <button onClick={() => setConfirmDelete(null)} className="text-xs text-subtle hover:text-content">Cancel</button>
                            </span>
                          ) : (
                            <button onClick={() => setConfirmDelete(p.id)} className="ml-auto text-xs text-subtle hover:text-red-500">Delete</button>
                          )}
                        </div>
                        <input type="text" value={p.caption} onChange={e => setField(p.id, { caption: e.target.value })}
                          placeholder="Add a caption…" maxLength={500}
                          className="w-full bg-surface border border-line-strong rounded-md px-2 py-1 text-xs text-content placeholder-subtle focus:outline-none focus:border-green-600" />
                        {childList.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] text-subtle">Who&rsquo;s in it?</span>
                            {childList.map(c => {
                              const sel = p.child_ids.includes(c.id)
                              return (
                                <button key={c.id} type="button" onClick={() => toggleChild(p.id, c.id)}
                                  className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${sel ? 'bg-green-700 text-white' : 'bg-elevated text-muted hover:bg-line-strong'}`}>
                                  {c.name}
                                </button>
                              )
                            })}
                          </div>
                        )}
                        {dirty && (
                          <div className="flex items-center gap-2">
                            <button onClick={() => save(p)} disabled={busyId === p.id}
                              className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1 rounded-md transition-colors">
                              {busyId === p.id ? 'Saving…' : 'Save'}
                            </button>
                            <button onClick={() => setField(p.id, { ...saved[p.id], child_ids: [...(saved[p.id]?.child_ids ?? [])] })}
                              className="text-xs text-subtle hover:text-content">Undo</button>
                            <span className="text-[11px] text-amber-600 dark:text-amber-400">Unsaved</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
              {capped && <p className="text-[11px] text-subtle text-center">Showing your most recent 1,000 photos.</p>}
              {error && <p className="text-red-500 text-sm">{error}</p>}
            </div>

            <div className="px-5 py-3 border-t border-line flex items-center justify-between">
              <p className="text-[11px] text-subtle">Changes save per photo and update the yearbook right away.</p>
              <button onClick={() => !busyId && setOpen(false)} className="text-sm text-subtle hover:text-content">Done</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
