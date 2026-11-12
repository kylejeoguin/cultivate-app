'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Child, SchoolYear } from '@/lib/types'

interface Props {
  childList: Child[]
  years: SchoolYear[]
  initialUsed: number
  limit: number
  isTrial: boolean
}

const COLOR_MAP: Record<string, string> = {
  green: 'bg-green-600', sky: 'bg-sky-600', amber: 'bg-amber-600',
  rose: 'bg-rose-600', violet: 'bg-violet-600', teal: 'bg-teal-600',
}
function childBg(color: string | null) { return COLOR_MAP[color ?? 'green'] ?? 'bg-green-600' }

// One target = the group, or a specific child id.
type Target = 'group' | string

export default function IdeasClient({ childList, initialUsed, limit, isTrial }: Props) {
  const [used, setUsed] = useState(initialUsed)
  const [ideas, setIdeas] = useState<Record<Target, string[]>>({})
  const [loading, setLoading] = useState<Target | null>(null)
  const [errors, setErrors] = useState<Record<Target, string>>({})

  const remaining = Math.max(0, limit - used)
  const exhausted = remaining <= 0

  async function spark(target: Target) {
    if (loading || exhausted) return
    setLoading(target)
    setErrors(e => ({ ...e, [target]: '' }))
    try {
      const res = await fetch('/api/spark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(target === 'group' ? { mode: 'group' } : { mode: 'individual', childId: target }),
      })
      const data = await res.json()
      if (typeof data.used === 'number') setUsed(data.used)
      if (res.status === 429) {
        setErrors(e => ({ ...e, [target]: 'limit' }))
        return
      }
      if (data.ideas?.length) {
        setIdeas(prev => ({ ...prev, [target]: data.ideas }))
      } else {
        setErrors(e => ({ ...e, [target]: data.error && data.error !== 'limit' ? data.error : 'Could not generate ideas. Try again.' }))
      }
    } catch {
      setErrors(e => ({ ...e, [target]: 'Something went wrong.' }))
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Daily usage meter */}
      <div className="flex items-center justify-between bg-card/60 border border-line/60 rounded-xl px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-subtle">Ideas today</span>
          <span className="font-semibold text-content">{used} / {limit}</span>
        </div>
        {exhausted ? (
          <span className="text-xs text-subtle">Resets tomorrow</span>
        ) : (
          <span className="text-xs text-green-600 dark:text-green-400 font-medium">{remaining} left</span>
        )}
      </div>

      {exhausted && isTrial && (
        <div className="bg-green-50 border border-green-200 dark:bg-green-950/20 dark:border-green-800/40 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-sm text-green-800 dark:text-green-300">
            You&apos;ve used today&apos;s trial ideas. Subscribers get plenty more every day.
          </p>
          <Link href="/pricing" className="shrink-0 text-xs font-semibold bg-green-700 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg transition-colors">
            Upgrade
          </Link>
        </div>
      )}

      {/* GROUP spark — the dominant mode for a homeschool-homestead (together-time). */}
      <SparkCard
        title="The whole family"
        subtitle="Multi-age ideas the whole crew can do together today."
        badge="Everyone"
        accentBar
        loading={loading === 'group'}
        disabled={exhausted && !ideas['group']}
        error={errors['group']}
        ideas={ideas['group']}
        onSpark={() => spark('group')}
        buttonLabel="✦ Spark family ideas"
      />

      {/* Per-student */}
      <div>
        <div className="flex items-center gap-3 my-2">
          <div className="h-px bg-line/60 flex-1" />
          <span className="text-xs font-semibold text-subtle uppercase tracking-widest">Or one student</span>
          <div className="h-px bg-line/60 flex-1" />
        </div>
        <div className="space-y-3">
          {childList.map(child => (
            <SparkCard
              key={child.id}
              title={child.name}
              subtitle={[child.grade_level, child.learning_style].filter(Boolean).join(' · ') || 'Tailored to this student'}
              avatar={<span className={`w-7 h-7 rounded-full ${childBg(child.color)} flex items-center justify-center text-xs font-bold text-white shrink-0`}>{child.name.charAt(0).toUpperCase()}</span>}
              loading={loading === child.id}
              disabled={exhausted && !ideas[child.id]}
              error={errors[child.id]}
              ideas={ideas[child.id]}
              onSpark={() => spark(child.id)}
              buttonLabel="✦ Spark"
            />
          ))}
        </div>
      </div>

      <p className="text-xs text-subtle text-center pt-2">
        Ideas are suggestions to riff on — <Link href="/dashboard" className="text-green-600 dark:text-green-400 hover:underline">log what you end up doing →</Link>
      </p>
    </div>
  )
}

function SparkCard({
  title, subtitle, badge, avatar, accentBar, loading, disabled, error, ideas, onSpark, buttonLabel,
}: {
  title: string
  subtitle?: string
  badge?: string
  avatar?: React.ReactNode
  accentBar?: boolean
  loading: boolean
  disabled: boolean
  error?: string
  ideas?: string[]
  onSpark: () => void
  buttonLabel: string
}) {
  return (
    <div className={`bg-card/60 border rounded-xl overflow-hidden ${accentBar ? 'border-green-200 dark:border-green-800/50' : 'border-line'}`}>
      <div className="px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {avatar}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-content truncate">{title}</span>
              {badge && <span className="text-[10px] font-medium uppercase tracking-wide text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/40 px-1.5 py-0.5 rounded-full">{badge}</span>}
            </div>
            {subtitle && <div className="text-xs text-subtle truncate">{subtitle}</div>}
          </div>
        </div>
        <button
          onClick={onSpark}
          disabled={loading || disabled}
          className="shrink-0 px-3 py-2 bg-green-100 hover:bg-green-200 border border-green-300 text-green-800 dark:bg-green-800/50 dark:hover:bg-green-700/50 dark:border-green-800/60 dark:text-green-300 text-sm font-medium rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? 'Thinking…' : ideas?.length ? 'Refresh' : buttonLabel}
        </button>
      </div>

      {(loading || error || ideas?.length) && (
        <div className="px-4 pb-4 pt-1 border-t border-line/60">
          {loading && (
            <div className="flex items-center gap-2 py-4">
              <span className="inline-block w-3.5 h-3.5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-subtle text-sm">Thinking…</span>
            </div>
          )}
          {!loading && error === 'limit' && (
            <p className="text-amber-600 dark:text-amber-400 text-xs py-2">You&apos;re out of ideas for today — resets tomorrow.</p>
          )}
          {!loading && error && error !== 'limit' && (
            <p className="text-amber-600 dark:text-amber-400 text-xs py-2">{error}</p>
          )}
          {!loading && ideas && ideas.length > 0 && (
            <ul className="space-y-2.5 pt-3">
              {ideas.map((idea, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="text-green-600 text-xs mt-0.5 shrink-0">→</span>
                  <span className="text-sm text-content leading-snug">{idea}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
