'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { Child, SchoolYear } from '@/lib/types'

const CERTIFICATE_TYPES = [
  // Academic
  { id: 'reading', icon: '📚', label: 'Reading Achievement', description: 'Outstanding dedication to reading and literacy', color: 'blue' },
  { id: 'math', icon: '🔢', label: 'Math Milestone', description: 'Excellence in mathematical thinking and problem solving', color: 'purple' },
  { id: 'writing', icon: '✍️', label: 'Writing Excellence', description: 'Exceptional growth and skill in written expression', color: 'teal' },
  { id: 'science', icon: '🔬', label: 'Science Explorer', description: 'Curiosity, observation, and the spirit of discovery', color: 'green' },
  { id: 'history', icon: '🌍', label: 'History Scholar', description: 'Deep engagement with history and the world around us', color: 'amber' },
  { id: 'arts', icon: '🎨', label: 'Creative Arts', description: 'Exceptional creativity and artistic expression', color: 'rose' },
  // Homestead — unique to Cultivate
  { id: 'homestead', icon: '🌾', label: 'Homestead Helper', description: 'Dedicated work and contribution to family homestead life', color: 'amber' },
  { id: 'garden', icon: '🌱', label: 'Garden Grower', description: 'Patient care, curiosity, and skill in growing food from seed to harvest', color: 'green' },
  { id: 'preservation', icon: '🫙', label: 'Preservation Pro', description: 'Skill and dedication in preserving the homestead harvest', color: 'orange' },
  { id: 'animals', icon: '🐓', label: 'Animal Keeper', description: 'Responsible, compassionate care for the animals in our keeping', color: 'brown' },
  { id: 'life_skills', icon: '🛠️', label: 'Life Skills', description: 'Practical wisdom, resourcefulness, and hands-on learning', color: 'stone' },
  // General
  { id: 'general', icon: '⭐', label: 'General Achievement', description: 'Outstanding effort, growth, and dedication to learning', color: 'gold' },
  { id: 'diploma', icon: '🎓', label: 'Diploma', description: '', color: 'gold' },
  { id: 'custom', icon: '🏅', label: 'Custom', description: '', color: 'green' },
]

const COLOR_STYLES: Record<string, { border: string; accent: string; badge: string }> = {
  blue: { border: 'border-blue-300', accent: 'text-blue-700', badge: 'bg-blue-50 border-blue-200' },
  purple: { border: 'border-purple-300', accent: 'text-purple-700', badge: 'bg-purple-50 border-purple-200' },
  teal: { border: 'border-teal-300', accent: 'text-teal-700', badge: 'bg-teal-50 border-teal-200' },
  green: { border: 'border-green-300', accent: 'text-green-700', badge: 'bg-green-50 border-green-200' },
  amber: { border: 'border-amber-300', accent: 'text-amber-700', badge: 'bg-amber-50 border-amber-200' },
  rose: { border: 'border-rose-300', accent: 'text-rose-700', badge: 'bg-rose-50 border-rose-200' },
  orange: { border: 'border-orange-300', accent: 'text-orange-700', badge: 'bg-orange-50 border-orange-200' },
  brown: { border: 'border-yellow-700', accent: 'text-yellow-900', badge: 'bg-yellow-50 border-yellow-300' },
  stone: { border: 'border-stone-400', accent: 'text-subtle', badge: 'bg-stone-50 border-stone-300' },
  gold: { border: 'border-yellow-400', accent: 'text-yellow-700', badge: 'bg-yellow-50 border-yellow-200' },
}

function formatToday() {
  return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export default function CertificateClient({
  childList,
  years,
}: {
  childList: Child[]
  years: SchoolYear[]
}) {
  const [selectedChild, setSelectedChild] = useState<string>(childList[0]?.id ?? '')
  const [selectedType, setSelectedType] = useState<string>('reading')
  const [customTitle, setCustomTitle] = useState('')
  const [customDesc, setCustomDesc] = useState('')
  const [customNote, setCustomNote] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  // Date is timezone-dependent, so compute it only after mount to avoid an
  // SSR/client hydration mismatch (server renders UTC date, client renders local).
  const [todayStr, setTodayStr] = useState('')
  useEffect(() => { setTodayStr(formatToday()) }, [])
  const noteDate = todayStr ? `, ${todayStr}` : ''

  const child = childList.find(c => c.id === selectedChild)
  const year = years.find(y => y.child_id === selectedChild)
  const certType = CERTIFICATE_TYPES.find(t => t.id === selectedType)!
  const colorStyle = COLOR_STYLES[certType.color] ?? COLOR_STYLES.green

  const isDiploma = selectedType === 'diploma'
  const title = selectedType === 'custom' ? customTitle : certType.label
  const description = selectedType === 'custom' ? customDesc : certType.description
  const note = customNote || (isDiploma
    ? (todayStr ? `Awarded this ${todayStr}` : 'Awarded this day')
    : `Awarded with pride and joy${noteDate}`)

  function handlePrint() {
    setShowPreview(true)
    setTimeout(() => window.print(), 300)
  }

  return (
    <div className="min-h-screen bg-surface text-content">
      <style>{`
        /* One certificate = one US Letter page. A fixed/full-bleed container used to
           spill onto a blank second page, so the print copy now flows as a normal
           centered block and is the only printed content (B3 — Kyle 2026-06-02). */
        @page { size: letter portrait; margin: 0.5in; }
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background: white !important; }
          .certificate-print {
            display: flex !important;
            justify-content: center;
            align-items: flex-start;
            background: white !important;
            page-break-inside: avoid;
            page-break-after: avoid;
          }
        }
        .print-only { display: none; }
      `}</style>

      {/* Nav */}
      <nav className="no-print border-b border-line/60 px-6 py-4 flex items-center gap-3">
        <Link href="/dashboard/homeschool" className="text-subtle hover:text-content text-sm transition-colors">← Homeschool</Link>
        <span className="text-subtle">/</span>
        <span className="text-sm font-semibold text-green-600 dark:text-green-400">Certificates</span>
      </nav>

      <main className="no-print max-w-2xl mx-auto px-6 py-8 pb-24">
        <div className="mb-6">
          <h2 className="text-xl font-bold mb-1">Certificate Generator</h2>
          <p className="text-muted text-sm">Print an achievement certificate for your learner. Homestead certificates are unique to Cultivate.</p>
        </div>

        {/* Child selector */}
        {childList.length > 1 && (
          <div className="mb-6">
            <span className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">Child</span>
            <div className="flex gap-2 flex-wrap">
              {childList.map(c => (
                <button key={c.id} onClick={() => setSelectedChild(c.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${selectedChild === c.id ? 'bg-green-700 text-white' : 'bg-elevated text-muted hover:bg-elevated'}`}>
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Certificate type */}
        <div className="mb-6">
          <span className="block text-xs font-medium text-muted uppercase tracking-wider mb-3">Certificate Type</span>
          <div className="grid grid-cols-2 gap-2">
            {CERTIFICATE_TYPES.map(type => (
              <button key={type.id} onClick={() => setSelectedType(type.id)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-colors ${
                  selectedType === type.id
                    ? 'bg-green-50 border-green-200 text-content dark:bg-green-900/30 dark:border-green-700/60'
                    : 'bg-card/60 border-line text-muted hover:border-line-strong'
                }`}>
                <span className="text-xl shrink-0">{type.icon}</span>
                <span className="text-sm font-medium leading-tight">{type.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Custom fields */}
        {selectedType === 'custom' && (
          <div className="mb-6 space-y-3">
            <div>
              <label className="block text-xs text-subtle mb-1.5" htmlFor="certificate-title-1">Certificate Title</label>
              <input id="certificate-title-1" type="text" value={customTitle} onChange={e => setCustomTitle(e.target.value)}
                placeholder="e.g. Nature Study Excellence"
                className="w-full bg-card border border-line-strong h-10 rounded-lg px-3 text-content text-sm placeholder-subtle focus:outline-none focus:border-green-600" />
            </div>
            <div>
              <label className="block text-xs text-subtle mb-1.5" htmlFor="description-2">Description</label>
              <textarea id="description-2" value={customDesc} onChange={e => setCustomDesc(e.target.value)} rows={2}
                placeholder="Describe what was achieved..."
                className="w-full bg-card border border-line-strong rounded-lg px-3 py-2 text-content text-sm placeholder-subtle resize-none focus:outline-none focus:border-green-600" />
            </div>
          </div>
        )}

        {/* Optional note */}
        <div className="mb-8">
          <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2" htmlFor="personal-note-optional-3">Personal Note (optional)</label>
          <input id="personal-note-optional-3" type="text" value={customNote} onChange={e => setCustomNote(e.target.value)}
            placeholder={`Awarded with pride and joy${noteDate}`}
            className="w-full bg-card border border-line-strong h-10 rounded-lg px-3 text-content text-sm placeholder-subtle focus:outline-none focus:border-green-600" />
        </div>

        {/* Preview */}
        <div className="mb-6 border border-line rounded-xl p-4">
          <p className="text-xs font-semibold text-subtle uppercase tracking-widest mb-4">Preview</p>
          <CertificateDocument
            childName={child?.name ?? ''}
            title={title}
            description={description}
            note={note}
            icon={certType.icon}
            colorStyle={colorStyle}
            schoolName={year?.name ? `${year.name} Homeschool` : 'Home Education'}
            date={todayStr}
            variant={isDiploma ? 'diploma' : 'certificate'}
            grade={child?.grade_level ?? ''}
          />
        </div>

        <button onClick={handlePrint}
          className="w-full bg-green-700 hover:bg-green-600 text-white font-bold py-3 rounded-xl transition-colors">
          🖨 Print Certificate
        </button>
      </main>

      {/* Print-only full certificate */}
      <div className="print-only certificate-print">
        <CertificateDocument
          childName={child?.name ?? ''}
          title={title}
          description={description}
          note={note}
          icon={certType.icon}
          colorStyle={colorStyle}
          schoolName={year?.name ? `${year.name} Homeschool` : 'Home Education'}
          date={todayStr}
          variant={isDiploma ? 'diploma' : 'certificate'}
          grade={child?.grade_level ?? ''}
          large
        />
      </div>
    </div>
  )
}

function CertificateDocument({
  childName, title, description, note, icon, colorStyle, schoolName, date, large = false,
  variant = 'certificate', grade = '',
}: {
  childName: string
  title: string
  description: string
  note: string
  icon: string
  colorStyle: { border: string; accent: string; badge: string }
  schoolName: string
  date: string
  large?: boolean
  variant?: 'certificate' | 'diploma'
  grade?: string
}) {
  // Passed in from the parent (computed post-mount) so SSR/client hydration match.
  const today = date
  const isDiploma = variant === 'diploma'
  // Diploma completion line — folds in grade level when the child has one set.
  const completionLine = `has satisfactorily completed${grade ? ` the ${grade} grade` : ' the prescribed'} course of home study`

  return (
    <div className={`bg-white text-gray-900 ${large ? 'w-[720px] p-12' : 'w-full p-6'}`}
      style={{ fontFamily: 'Georgia, serif' }}>
      {/* Outer border */}
      <div className={`border-4 ${colorStyle.border} rounded-lg p-${large ? '8' : '5'} text-center space-y-${large ? '6' : '4'}`}>
        {/* Inner decorative border */}
        <div className={`border-2 ${colorStyle.border} rounded-md p-${large ? '6' : '4'} space-y-${large ? '5' : '3'}`}>

          {/* Header */}
          <p className={`text-xs uppercase tracking-[0.3em] text-gray-500 ${large ? 'text-sm' : ''}`}>
            {schoolName} · Cultivate
          </p>

          {/* Icon */}
          <div className={`${large ? 'text-6xl' : 'text-4xl'} leading-none`}>{icon}</div>

          {isDiploma ? (
            <>
              {/* Diploma heading */}
              <div>
                <p className={`${large ? 'text-sm' : 'text-xs'} uppercase tracking-[0.2em] text-gray-500 mb-1`}>
                  Home Education
                </p>
                <h1 className={`${large ? 'text-4xl' : 'text-2xl'} font-bold ${colorStyle.accent} tracking-wide`}>Diploma</h1>
              </div>

              {/* Conferred upon */}
              <div>
                <p className={`${large ? 'text-sm' : 'text-xs'} text-gray-500 mb-1`}>This diploma certifies that</p>
                <p className={`${large ? 'text-4xl' : 'text-2xl'} font-bold text-gray-900`}
                  style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontStyle: 'italic' }}>
                  {childName || 'Child Name'}
                </p>
              </div>

              {/* Completion statement */}
              <p className={`${large ? 'text-base' : 'text-sm'} text-gray-600 max-w-md mx-auto leading-relaxed`}>
                {completionLine}.
              </p>
            </>
          ) : (
            <>
              {/* Certificate of Achievement */}
              <div>
                <p className={`${large ? 'text-sm' : 'text-xs'} uppercase tracking-[0.2em] text-gray-500 mb-1`}>
                  Certificate of Achievement
                </p>
                <h1 className={`${large ? 'text-3xl' : 'text-xl'} font-bold ${colorStyle.accent}`}>{title}</h1>
              </div>

              {/* Awarded to */}
              <div>
                <p className={`${large ? 'text-sm' : 'text-xs'} text-gray-500 mb-1`}>This certificate is proudly presented to</p>
                <p className={`${large ? 'text-4xl' : 'text-2xl'} font-bold text-gray-900`}
                  style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontStyle: 'italic' }}>
                  {childName || 'Child Name'}
                </p>
              </div>

              {/* Description */}
              {description && (
                <p className={`${large ? 'text-base' : 'text-xs'} text-gray-600 max-w-sm mx-auto leading-relaxed italic`}>
                  &ldquo;{description}&rdquo;
                </p>
              )}
            </>
          )}

          {/* Divider */}
          <div className="flex items-center gap-3 justify-center">
            <div className={`h-px flex-1 ${colorStyle.border} border-t`} />
            <span className="text-gray-400 text-xs">✦</span>
            <div className={`h-px flex-1 ${colorStyle.border} border-t`} />
          </div>

          {/* Date and note */}
          <div className={`space-y-${large ? '3' : '2'}`}>
            <p className={`${large ? 'text-sm' : 'text-xs'} text-gray-500`}>{note}</p>

            {/* Signature line */}
            <div className={`flex items-end justify-center gap-${large ? '16' : '10'} mt-${large ? '6' : '4'}`}>
              <div className="text-center">
                <div className={`border-b border-gray-400 ${large ? 'w-36 mb-1' : 'w-24 mb-0.5'}`} />
                <p className={`${large ? 'text-xs' : 'text-[10px]'} text-gray-400 uppercase tracking-wider`}>Parent / Educator</p>
              </div>
              <div className="text-center">
                <p className={`${large ? 'text-sm' : 'text-xs'} font-medium text-gray-700 ${large ? 'mb-1' : 'mb-0.5'}`}>{today}</p>
                <div className={`border-b border-gray-400 ${large ? 'w-36' : 'w-24'}`} />
                <p className={`${large ? 'text-xs' : 'text-[10px]'} text-gray-400 uppercase tracking-wider mt-0.5`}>Date</p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <p className={`${large ? 'text-xs' : 'text-[10px]'} text-gray-300 pt-2`}>
            Generated by Cultivate · mycultivate.app
          </p>
        </div>
      </div>
    </div>
  )
}
