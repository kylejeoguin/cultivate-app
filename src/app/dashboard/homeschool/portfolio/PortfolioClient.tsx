'use client'

import { useState, useRef, useEffect } from 'react'
import { todayLocalISO } from '@/lib/use-today'
import { formatDateLong } from '@/lib/dates'
import { createClient } from '@/lib/supabase/client'
import { photoSrc } from '@/lib/photoUrls'
import type { Child, Subject, SchoolYear, PortfolioItem } from '@/lib/types'

const SUBJECT_COLORS: Record<string, string> = {
  'Mathematics': 'bg-blue-100 dark:bg-blue-900/40 border-blue-200 dark:border-blue-800/40 text-blue-800 dark:text-blue-300',
  'Reading': 'bg-purple-100 dark:bg-purple-900/40 border-purple-200 dark:border-purple-800/40 text-purple-800 dark:text-purple-300',
  'Language Arts': 'bg-purple-100 dark:bg-purple-900/40 border-purple-200 dark:border-purple-800/40 text-purple-800 dark:text-purple-300',
  'Science': 'bg-green-100 dark:bg-green-900/40 border-green-200 dark:border-green-800/40 text-green-800 dark:text-green-300',
  'History': 'bg-amber-100 dark:bg-amber-900/40 border-amber-200 dark:border-amber-800/40 text-amber-800 dark:text-amber-300',
  'Social Studies': 'bg-amber-100 dark:bg-amber-900/40 border-amber-200 dark:border-amber-800/40 text-amber-800 dark:text-amber-300',
  'Life Skills': 'bg-rose-100 dark:bg-rose-900/40 border-rose-200 dark:border-rose-800/40 text-rose-800 dark:text-rose-300',
  'Biology': 'bg-green-100 dark:bg-green-900/40 border-green-200 dark:border-green-800/40 text-green-800 dark:text-green-300',
  'default': 'bg-elevated/60 border-line-strong/40 text-muted',
}

function subjectClass(name: string) {
  return SUBJECT_COLORS[name] ?? SUBJECT_COLORS.default
}


interface Props {
  childList: Child[]
  subjects: Subject[]
  activeYears: SchoolYear[]
  items: PortfolioItem[]
}

export default function PortfolioClient({ childList, subjects, activeYears, items: initialItems }: Props) {
  const supabase = createClient()
  const [items, setItems] = useState<PortfolioItem[]>(initialItems)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedChild, setSelectedChild] = useState<string>(childList[0]?.id ?? '')
  const [filterChild, setFilterChild] = useState<string>('all')
  const [filterSubject, setFilterSubject] = useState<string>('all')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // File upload state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadPreview, setUploadPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  // Form state
  const [form, setForm] = useState({
    title: '',
    description: '',
    item_date: new Date().toISOString().split('T')[0],
    child_id: childList[0]?.id ?? '',
    subject_ids: [] as string[],
    is_featured: false,
    file_url: '',
    file_type: null as PortfolioItem['file_type'],
  })

  // item_date init above is UTC-stable for SSR; correct to LOCAL today on mount.
  useEffect(() => { setForm(f => ({ ...f, item_date: todayLocalISO() })) }, [])

  function resetForm() {
    setForm({
      title: '',
      description: '',
      item_date: todayLocalISO(),
      child_id: childList[0]?.id ?? '',
      subject_ids: [],
      is_featured: false,
      file_url: '',
      file_type: null,
    })
    setEditingId(null)
    setError('')
    setUploadFile(null)
    setUploadPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 20 * 1024 * 1024) { setError('File must be under 20MB'); return }
    setUploadFile(file)
    const isImage = file.type.startsWith('image/')
    if (isImage) {
      const reader = new FileReader()
      reader.onload = ev => setUploadPreview(ev.target?.result as string)
      reader.readAsDataURL(file)
    } else {
      setUploadPreview(null)
    }
    setForm(f => ({ ...f, file_url: '', file_type: isImage ? 'image' : 'document' }))
  }

  async function uploadPortfolioFile(userId: string): Promise<string | null> {
    if (!uploadFile) return null
    setUploading(true)
    const ext = uploadFile.name.split('.').pop() ?? 'bin'
    const path = `portfolio/${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage
      .from('log-photos')
      .upload(path, uploadFile, { contentType: uploadFile.type, upsert: false })
    setUploading(false)
    if (error) { setError(error.message); return null }
    const { data } = supabase.storage.from('log-photos').getPublicUrl(path)
    return data.publicUrl
  }

  function openEdit(item: PortfolioItem) {
    setForm({
      title: item.title,
      description: item.description ?? '',
      item_date: item.item_date,
      child_id: item.child_id,
      subject_ids: item.subject_ids ?? [],
      is_featured: item.is_featured,
      file_url: item.file_url ?? '',
      file_type: item.file_type,
    })
    setEditingId(item.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function toggleSubject(id: string) {
    setForm(f => ({
      ...f,
      subject_ids: f.subject_ids.includes(id)
        ? f.subject_ids.filter(s => s !== id)
        : [...f.subject_ids, id],
    }))
  }

  // Child-scoped subjects
  const childSubjects = subjects.filter(s => s.child_id === form.child_id)

  // Filtered items
  const displayItems = items.filter(item => {
    if (filterChild !== 'all' && item.child_id !== filterChild) return false
    if (filterSubject !== 'all' && !item.subject_ids?.includes(filterSubject)) return false
    return true
  })

  const featuredItems = displayItems.filter(i => i.is_featured)
  const regularItems = displayItems.filter(i => !i.is_featured)

  async function handleSave() {
    if (!form.title.trim()) { setError('Title is required.'); return }
    if (!form.child_id) { setError('Select a child.'); return }
    if (!form.item_date) { setError('Date is required.'); return }

    setSaving(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    // Upload file if selected
    let fileUrl = form.file_url.trim() || null
    let fileType = form.file_type
    if (uploadFile) {
      const uploaded = await uploadPortfolioFile(user.id)
      if (!uploaded) { setSaving(false); return }
      fileUrl = uploaded
      fileType = uploadFile.type.startsWith('image/') ? 'image' : 'document'
    }

    const year = activeYears.find(y => y.child_id === form.child_id)
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      item_date: form.item_date,
      child_id: form.child_id,
      school_year_id: year?.id ?? null,
      subject_ids: form.subject_ids,
      is_featured: form.is_featured,
      file_url: fileUrl,
      file_type: fileUrl ? (fileType ?? 'link') : null,
    }

    if (editingId) {
      const { data, error: err } = await supabase
        .from('portfolio_items')
        .update(payload)
        .eq('id', editingId)
        .select()
        .single()
      if (err) { setError(err.message); setSaving(false); return }
      setItems(prev => prev.map(i => i.id === editingId ? data as PortfolioItem : i))
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error: err } = await supabase
        .from('portfolio_items')
        .insert({ ...payload, user_id: user!.id })
        .select()
        .single()
      if (err) { setError(err.message); setSaving(false); return }
      setItems(prev => [data as PortfolioItem, ...prev])
    }

    setSaving(false)
    resetForm()
    setShowForm(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this portfolio item?')) return
    await supabase.from('portfolio_items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  async function toggleFeatured(item: PortfolioItem) {
    const { data } = await supabase
      .from('portfolio_items')
      .update({ is_featured: !item.is_featured })
      .eq('id', item.id)
      .select()
      .single()
    if (data) setItems(prev => prev.map(i => i.id === item.id ? data as PortfolioItem : i))
  }

  const subjectMap: Record<string, string> = {}
  subjects.forEach(s => { subjectMap[s.id] = s.name })

  const childMap: Record<string, string> = {}
  childList.forEach(c => { childMap[c.id] = c.name })

  return (
    <main className="max-w-2xl lg:max-w-4xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold mb-1">Portfolio</h2>
          <p className="text-muted text-sm">
            Work samples and accomplishments — required for PA, FL, MD, DC, and HI evaluations.
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(s => !s) }}
          className="shrink-0 px-4 py-2 bg-green-100 dark:bg-green-800/60 hover:bg-green-200 dark:hover:bg-green-700/60 border border-green-300 dark:border-green-700/50 text-green-800 dark:text-green-300 hover:text-green-900 dark:hover:text-green-200 rounded-lg text-sm font-medium transition-colors"
        >
          {showForm ? 'Cancel' : '+ Add item'}
        </button>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="bg-card border border-line-strong rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-content">
            {editingId ? 'Edit portfolio item' : 'New portfolio item'}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs text-subtle mb-1.5" htmlFor="title-1">Title <span className="text-green-500">*</span></label>
              <input id="title-1"
                type="text"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Nature journal — spring wildflowers"
                className="w-full h-10 px-3.5 bg-surface border border-line-strong rounded-lg text-content text-sm placeholder-subtle focus:outline-none focus:border-green-600"
              />
            </div>

            <div>
              <label className="block text-xs text-subtle mb-1.5" htmlFor="student-1">Student</label>
              <select id="student-1"
                value={form.child_id}
                onChange={e => setForm(f => ({ ...f, child_id: e.target.value, subject_ids: [] }))}
                className="w-full h-10 px-3.5 bg-surface border border-line-strong rounded-lg text-content text-sm focus:outline-none focus:border-green-600"
              >
                {childList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs text-subtle mb-1.5" htmlFor="date-2">Date</label>
              <input id="date-2"
                type="date"
                value={form.item_date}
                onChange={e => setForm(f => ({ ...f, item_date: e.target.value }))}
                className="appearance-none w-full h-10 px-3.5 bg-surface border border-line-strong rounded-lg text-content text-sm focus:outline-none focus:border-green-600"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs text-subtle mb-1.5" htmlFor="description-3">Description</label>
              <textarea id="description-3"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="What did they do? What did they learn? Why does this belong in the portfolio?"
                rows={3}
                className="w-full px-3.5 py-2.5 bg-surface border border-line-strong rounded-lg text-content text-sm placeholder-subtle focus:outline-none focus:border-green-600 resize-none"
              />
            </div>

            {/* Subject tags */}
            {childSubjects.length > 0 && (
              <div className="sm:col-span-2">
                <span className="block text-xs text-subtle mb-2">Subjects covered</span>
                <div className="flex flex-wrap gap-2">
                  {childSubjects.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleSubject(s.id)}
                      className={`px-3 py-1 rounded-full border text-xs transition-colors ${
                        form.subject_ids.includes(s.id)
                          ? 'bg-green-100 dark:bg-green-900/50 border-green-300 dark:border-green-700/60 text-green-800 dark:text-green-300'
                          : 'bg-elevated/50 border-line-strong/40 text-subtle hover:text-content'
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* File upload or link */}
            <div className="sm:col-span-2">
              <span className="block text-xs text-subtle mb-2">
                Work sample <span className="text-subtle font-normal">(optional — upload a photo/doc or paste a link)</span>
              </span>
              <div className="space-y-2">
                {/* Upload button */}
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,application/pdf,.doc,.docx"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="portfolio-upload"
                  />
                  <label htmlFor="portfolio-upload"
                    className="flex items-center gap-2 px-4 py-2.5 bg-surface border border-line-strong border-dashed rounded-lg text-subtle hover:text-content hover:border-line-strong cursor-pointer transition-colors text-sm">
                    <span className="text-base">📎</span>
                    {uploadFile ? uploadFile.name : 'Upload photo or document (PDF, image)'}
                  </label>
                </div>

                {/* Image preview */}
                {uploadPreview && (
                  <div className="relative inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={uploadPreview} alt="" className="w-24 h-24 object-cover rounded-lg border border-line-strong" />
                    <button onClick={() => { setUploadFile(null); setUploadPreview(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-elevated border border-line-strong rounded-full text-xs text-muted hover:text-red-600 dark:hover:text-red-400 flex items-center justify-center">✕</button>
                  </div>
                )}

                {/* OR link */}
                {!uploadFile && (
                  <input
                    type="url"
                    value={form.file_url}
                    onChange={e => setForm(f => ({ ...f, file_url: e.target.value }))}
                    placeholder="Or paste a link (Google Drive, photo, etc.)"
                    className="w-full h-10 px-3.5 bg-surface border border-line-strong rounded-lg text-content text-sm placeholder-subtle focus:outline-none focus:border-green-600"
                  />
                )}
              </div>
            </div>

            {/* Featured toggle */}
            <div className="sm:col-span-2">
              <button
                type="button"
                aria-pressed={form.is_featured}
                className="flex items-center gap-3 cursor-pointer text-left"
                onClick={() => setForm(f => ({ ...f, is_featured: !f.is_featured }))}
              >
                <span
                  className={`w-10 h-5 rounded-full transition-colors flex items-center ${form.is_featured ? 'bg-green-600' : 'bg-elevated'}`}
                >
                  <span className={`w-4 h-4 rounded-full bg-white shadow transition-transform mx-0.5 ${form.is_featured ? 'translate-x-5' : 'translate-x-0'}`} />
                </span>
                <span className="text-sm text-content">Mark as featured</span>
                <span className="text-xs text-subtle">— highlighted in portfolio, good for evaluator submission</span>
              </button>
            </div>
          </div>

          {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white font-semibold rounded-lg text-sm transition-colors"
            >
              {uploading ? 'Uploading...' : saving ? 'Saving…' : editingId ? 'Save changes' : 'Add to portfolio'}
            </button>
            <button
              onClick={() => { resetForm(); setShowForm(false) }}
              className="px-5 py-2 text-subtle hover:text-content text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      {items.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {childList.length > 1 && (
            <select
              value={filterChild}
              onChange={e => setFilterChild(e.target.value)}
              className="h-8 px-3 bg-card border border-line rounded-lg text-muted text-xs focus:outline-none focus:border-green-600"
            >
              <option value="all">All students</option>
              {childList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <select
            value={filterSubject}
            onChange={e => setFilterSubject(e.target.value)}
            className="h-8 px-3 bg-card border border-line rounded-lg text-muted text-xs focus:outline-none focus:border-green-600"
          >
            <option value="all">All subjects</option>
            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <span className="text-xs text-subtle self-center">
            {displayItems.length} item{displayItems.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Empty state */}
      {items.length === 0 && !showForm && (
        <div className="text-center py-16 space-y-4">
          <div className="text-5xl">📁</div>
          <div>
            <p className="font-semibold text-content mb-2">No portfolio items yet</p>
            <p className="text-subtle text-sm max-w-sm mx-auto">
              A portfolio documents your child&apos;s best work throughout the year.
              Some states require it for annual evaluation — and it&apos;s a great record regardless.
            </p>
          </div>
          <div className="bg-card border border-line rounded-xl p-4 text-left max-w-md mx-auto">
            <p className="text-xs font-semibold text-subtle uppercase tracking-wider mb-2">Good portfolio items include:</p>
            <ul className="space-y-1.5 text-xs text-muted">
              <li>→ Written work — essays, stories, nature journal entries</li>
              <li>→ Math work — problems solved, calculations documented</li>
              <li>→ Projects — science experiments, homestead builds</li>
              <li>→ Photos — field trips, hands-on work, completed projects</li>
              <li>→ Reading logs — books read with brief descriptions</li>
            </ul>
          </div>
          <button
            onClick={() => { resetForm(); setShowForm(true) }}
            className="inline-block px-5 py-2.5 bg-green-100 dark:bg-green-800/60 hover:bg-green-200 dark:hover:bg-green-700/60 border border-green-300 dark:border-green-700/50 text-green-800 dark:text-green-300 rounded-lg text-sm font-medium transition-colors"
          >
            Add first portfolio item →
          </button>
        </div>
      )}

      {/* Featured items */}
      {featuredItems.length > 0 && (
        <section className="space-y-3">
          <p className="text-xs font-semibold text-subtle uppercase tracking-widest">Featured</p>
          <div className="space-y-3">
            {featuredItems.map(item => (
              <PortfolioCard
                key={item.id}
                item={item}
                subjectMap={subjectMap}
                childMap={childMap}
                showChild={childList.length > 1}
                expanded={expandedId === item.id}
                onExpand={() => setExpandedId(id => id === item.id ? null : item.id)}
                onEdit={() => openEdit(item)}
                onDelete={() => handleDelete(item.id)}
                onToggleFeatured={() => toggleFeatured(item)}
                featured
              />
            ))}
          </div>
        </section>
      )}

      {/* Regular items */}
      {regularItems.length > 0 && (
        <section className="space-y-3">
          {featuredItems.length > 0 && (
            <p className="text-xs font-semibold text-subtle uppercase tracking-widest">All items</p>
          )}
          <div className="space-y-2">
            {regularItems.map(item => (
              <PortfolioCard
                key={item.id}
                item={item}
                subjectMap={subjectMap}
                childMap={childMap}
                showChild={childList.length > 1}
                expanded={expandedId === item.id}
                onExpand={() => setExpandedId(id => id === item.id ? null : item.id)}
                onEdit={() => openEdit(item)}
                onDelete={() => handleDelete(item.id)}
                onToggleFeatured={() => toggleFeatured(item)}
                featured={false}
              />
            ))}
          </div>
        </section>
      )}

      {/* State requirements note */}
      {items.length > 0 && (
        <p className="text-xs text-subtle pb-4">
          States requiring annual portfolio evaluation include PA, FL, MD, DC, and HI.
          Always verify current requirements at{' '}
          <a href="https://hslda.org/legal" target="_blank" rel="noopener noreferrer" className="underline hover:text-muted">hslda.org/legal</a>.
        </p>
      )}
    </main>
  )
}

function PortfolioCard({
  item, subjectMap, childMap, showChild, expanded, featured,
  onExpand, onEdit, onDelete, onToggleFeatured,
}: {
  item: PortfolioItem
  subjectMap: Record<string, string>
  childMap: Record<string, string>
  showChild: boolean
  expanded: boolean
  featured: boolean
  onExpand: () => void
  onEdit: () => void
  onDelete: () => void
  onToggleFeatured: () => void
}) {
  return (
    <div className={`bg-card border rounded-xl transition-colors ${featured ? 'border-green-200 dark:border-green-900/60' : 'border-line'}`}>
      <button
        onClick={onExpand}
        className="w-full text-left px-4 py-3.5 flex items-start justify-between gap-3"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {featured && <span className="text-green-600 dark:text-green-400 text-xs font-semibold">★ Featured</span>}
            <span className="text-sm font-semibold text-content">{item.title}</span>
          </div>
          <p className="text-xs text-subtle mt-0.5">
            {formatDateLong(item.item_date)}
            {showChild && childMap[item.child_id] ? ` · ${childMap[item.child_id]}` : ''}
          </p>
          {item.subject_ids?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {item.subject_ids.slice(0, 4).map(id => (
                <span key={id} className={`px-2 py-0.5 rounded-full border text-xs ${subjectClass(subjectMap[id] ?? '')}`}>
                  {subjectMap[id] ?? id}
                </span>
              ))}
              {item.subject_ids.length > 4 && (
                <span className="px-2 py-0.5 rounded-full border border-line-strong/40 text-xs text-subtle">
                  +{item.subject_ids.length - 4}
                </span>
              )}
            </div>
          )}
        </div>
        <span className={`text-subtle text-xs mt-0.5 transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-line/60 pt-3">
          {item.description && (
            <p className="text-sm text-content leading-relaxed">{item.description}</p>
          )}
          {item.file_url && item.file_type === 'image' && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoSrc(item.file_url, 800)} alt={item.title} className="w-full max-h-64 object-cover rounded-lg border border-line" />
          )}
          {item.file_url && (
            <a
              href={photoSrc(item.file_url)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 transition-colors"
            >
              <span>↗</span>
              {item.file_type === 'image' ? 'View full image' : item.file_type === 'document' ? 'View document' : 'View work sample'}
            </a>
          )}
          <div className="flex items-center gap-3 pt-1">
            <button onClick={onEdit} className="text-xs text-subtle hover:text-content transition-colors">Edit</button>
            <button onClick={onToggleFeatured} className="text-xs text-subtle hover:text-content transition-colors">
              {featured ? 'Remove from featured' : 'Mark as featured'}
            </button>
            <button onClick={onDelete} className="text-xs text-red-500/60 hover:text-red-600 dark:hover:text-red-400 transition-colors ml-auto">Delete</button>
          </div>
        </div>
      )}
    </div>
  )
}
