'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatDateWeekday } from '@/lib/dates'
import type { Child, Subject, SchoolYear } from '@/lib/types'
import { LogCard } from './LogCard'
import { EditLogCard } from './EditLogCard'

interface DailyLog {
  id: string
  child_id: string
  log_date: string
  notes: string | null
  hours: number | null
  subject_ids: string[]
  is_homestead_day: boolean
  created_at: string
  photo_urls?: string[] | null
}


function monthLabel(key: string) {
  const [y, m] = key.split('-')
  return new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export default function HistoryClient({
  initialLogs,
  childList,
  subjects,
  activeYears,
}: {
  initialLogs: DailyLog[]
  childList: Child[]
  subjects: Subject[]
  activeYears: SchoolYear[]
}) {
  const supabase = createClient()
  const [logs, setLogs] = useState<DailyLog[]>(initialLogs)
  const [editingId, setEditingId] = useState<string | null>(null)

  const subjectMap: Record<string, string> = {}
  subjects.forEach(s => { subjectMap[s.id] = s.name })
  const childMap: Record<string, string> = {}
  childList.forEach(c => { childMap[c.id] = c.name })

  // Unique subjects per child for the subject pill selectors
  const subjectsByChild: Record<string, Subject[]> = {}
  subjects.forEach(s => {
    if (!s.child_id) return
    if (!subjectsByChild[s.child_id]) subjectsByChild[s.child_id] = []
    subjectsByChild[s.child_id].push(s)
  })

  const totalHours = Math.round(logs.reduce((sum, l) => sum + (l.hours ?? 0), 0) * 10) / 10
  const homesteadDays = logs.filter(l => l.is_homestead_day).length

  async function deleteLog(id: string) {
    await supabase.from('daily_log').delete().eq('id', id)
    setLogs(prev => prev.filter(l => l.id !== id))
    if (editingId === id) setEditingId(null)
  }

  async function updateLog(id: string, patch: Partial<DailyLog>) {
    const { error } = await supabase.from('daily_log').update(patch).eq('id', id)
    if (!error) {
      setLogs(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l))
      setEditingId(null)
    }
    return error
  }

  const grouped: Record<string, DailyLog[]> = {}
  logs.forEach(log => {
    const key = log.log_date.slice(0, 7)
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(log)
  })

  return (
    <div className="min-h-screen bg-surface text-content">
      <nav className="border-b border-line/60 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/homeschool" className="text-subtle hover:text-content text-sm transition-colors">← Homeschool</Link>
          <span className="text-subtle">/</span>
          <span className="text-sm font-semibold text-green-600 dark:text-green-400">Log History</span>
        </div>
        <Link href="/dashboard" className="bg-green-700 hover:bg-green-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
          + Log Today
        </Link>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-8 pb-24">
        {logs.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-14 h-14 rounded-2xl bg-green-50 dark:bg-green-900/30 flex items-center justify-center text-3xl mx-auto mb-4">📓</div>
            <h2 className="text-lg font-semibold mb-2">No entries yet</h2>
            <p className="text-muted text-sm mb-6">Start logging your school days — it takes under 2 minutes.</p>
            <Link href="/dashboard" className="bg-gradient-to-r from-green-700 to-green-600 hover:from-green-600 hover:to-green-500 text-white font-semibold px-6 py-3 rounded-xl transition-all inline-block shadow-lg shadow-green-900/30">
              Log Today
            </Link>
          </div>
        ) : (
          <>
            {/* Stats strip */}
            <div className="grid grid-cols-3 gap-3 mb-8">
              <div className="bg-card/60 border border-line/60 rounded-xl px-4 py-3 text-center">
                <div className="text-lg font-bold text-green-600 dark:text-green-400">{logs.length}</div>
                <div className="text-xs text-subtle mt-0.5">days logged</div>
              </div>
              <div className="bg-card/60 border border-line/60 rounded-xl px-4 py-3 text-center">
                <div className="text-lg font-bold text-green-600 dark:text-green-400">{totalHours > 0 ? totalHours : '—'}</div>
                <div className="text-xs text-subtle mt-0.5">hours tracked</div>
              </div>
              <div className="bg-card/60 border border-line/60 rounded-xl px-4 py-3 text-center">
                <div className="text-lg font-bold text-amber-600 dark:text-amber-400">{homesteadDays > 0 ? homesteadDays : '—'}</div>
                <div className="text-xs text-subtle mt-0.5">hands-on days</div>
              </div>
            </div>

            <div className="space-y-8">
              {Object.entries(grouped).map(([monthKey, monthLogs]) => (
                <section key={monthKey}>
                  <h3 className="text-xs font-semibold text-subtle uppercase tracking-widest mb-3">
                    {monthLabel(monthKey)} · {monthLogs.length}
                  </h3>
                  <div className="space-y-2">
                    {monthLogs.map(log => (
                      editingId === log.id
                        ? (
                          <EditLogCard
                            key={log.id}
                            log={log}
                            childList={childList}
                            subjects={subjectsByChild[log.child_id] ?? []}
                            subjectMap={subjectMap}
                            onSave={(patch) => updateLog(log.id, patch)}
                            onDelete={() => deleteLog(log.id)}
                            onCancel={() => setEditingId(null)}
                          />
                        ) : (
                          <LogCard
                            key={log.id}
                            log={log}
                            childMap={childMap}
                            subjectMap={subjectMap}
                            multiChild={childList.length > 1}
                            onEdit={() => setEditingId(log.id)}
                          />
                        )
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
