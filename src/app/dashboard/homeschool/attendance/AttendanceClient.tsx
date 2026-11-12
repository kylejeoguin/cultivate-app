'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Child, Attendance, SchoolYear } from '@/lib/types'
import { todayLocalISO } from '@/lib/use-today'

const STATUS_LABELS: Record<string, string> = {
  present: 'Present',
  absent: 'Absent',
  excused: 'Excused',
}

const STATUS_COLORS: Record<string, string> = {
  present: 'bg-green-700',
  absent: 'bg-red-700',
  excused: 'bg-amber-600',
}

const MO_REQUIREMENT = 'Missouri requires 1,000 hours per year (or 600 hours with a Certificate of Eligibility).'

function getMonthLabel(year: number, month: number) {
  return new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function buildCalendar(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  return { firstDay, daysInMonth }
}

export default function AttendanceClient({
  childList,
  attendance: initialAttendance,
  activeYears,
}: {
  childList: Child[]
  attendance: Attendance[]
  activeYears: SchoolYear[]
}) {
  const router = useRouter()
  const supabase = createClient()

  const [selectedChild, setSelectedChild] = useState(childList[0]?.id ?? '')
  // Init the calendar to the UTC month for SSR-stable hydration, then correct
  // to the user's LOCAL current month on mount.
  const [viewYear, setViewYear] = useState(() => new Date().getUTCFullYear())
  const [viewMonth, setViewMonth] = useState(() => new Date().getUTCMonth())
  const [today, setToday] = useState(() => new Date().toISOString().slice(0, 10))
  useEffect(() => {
    const d = new Date()
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
    setToday(todayLocalISO())
  }, [])
  const [attendance, setAttendance] = useState(initialAttendance)
  const [saving, setSaving] = useState<string | null>(null)

  const activeYear = activeYears.find(y => y.child_id === selectedChild)
  const childAttendance = attendance.filter(a => a.child_id === selectedChild)

  const presentCount = childAttendance.filter(a => a.status === 'present').length
  const absentCount = childAttendance.filter(a => a.status === 'absent').length
  const excusedCount = childAttendance.filter(a => a.status === 'excused').length

  const byDate: Record<string, Attendance> = {}
  childAttendance.forEach(a => { byDate[a.attendance_date] = a })

  const { firstDay, daysInMonth } = buildCalendar(viewYear, viewMonth)

  function padDate(d: number) {
    const m = String(viewMonth + 1).padStart(2, '0')
    const day = String(d).padStart(2, '0')
    return `${viewYear}-${m}-${day}`
  }

  async function toggleDay(day: number) {
    const dateStr = padDate(day)
    const existing = byDate[dateStr]
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    setSaving(dateStr)

    if (!existing) {
      const { data, error } = await supabase
        .from('attendance')
        .insert({
          user_id: user.id,
          child_id: selectedChild,
          school_year_id: activeYear?.id ?? null,
          attendance_date: dateStr,
          status: 'present',
        })
        .select()
        .single()
      if (!error && data) {
        setAttendance(prev => [...prev, data as Attendance])
      }
    } else {
      const next = existing.status === 'present' ? 'absent' : existing.status === 'absent' ? 'excused' : null
      if (next === null) {
        await supabase.from('attendance').delete().eq('id', existing.id)
        setAttendance(prev => prev.filter(a => a.id !== existing.id))
      } else {
        await supabase.from('attendance').update({ status: next }).eq('id', existing.id)
        setAttendance(prev => prev.map(a => a.id === existing.id ? { ...a, status: next } : a))
      }
    }
    setSaving(null)
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  return (
    <div className="min-h-screen bg-surface text-content">
      <nav className="border-b border-line/60 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/homeschool" className="text-subtle hover:text-content text-sm transition-colors">← Homeschool</Link>
          <span className="text-subtle">/</span>
          <span className="text-sm font-semibold text-green-600 dark:text-green-400">Attendance</span>
        </div>
        {activeYear && (
          <span className="text-subtle text-xs">{activeYear.name}</span>
        )}
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-8">
        {/* Child selector */}
        {childList.length > 1 && (
          <div className="flex gap-2 mb-6">
            {childList.map(c => (
              <button
                key={c.id}
                onClick={() => setSelectedChild(c.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedChild === c.id ? 'bg-green-700 text-white' : 'bg-elevated text-content hover:bg-elevated'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {/* Year totals */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="bg-card border border-line rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">{presentCount}</div>
            <div className="text-xs text-muted mt-1">Days Present</div>
          </div>
          <div className="bg-card border border-line rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-red-600 dark:text-red-400">{absentCount}</div>
            <div className="text-xs text-muted mt-1">Days Absent</div>
          </div>
          <div className="bg-card border border-line rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-amber-600 dark:text-amber-400">{excusedCount}</div>
            <div className="text-xs text-muted mt-1">Days Excused</div>
          </div>
        </div>

        {activeYear?.state === 'MO' && (
          <div className="bg-card border border-amber-200 dark:border-amber-900/50 rounded-lg px-4 py-3 text-xs text-amber-700 dark:text-amber-300 mb-6">
            <span className="font-semibold">Missouri:</span> {MO_REQUIREMENT}
          </div>
        )}

        {/* Calendar */}
        <div className="bg-card border border-line rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevMonth} className="text-muted hover:text-content px-2 py-1 transition-colors">←</button>
            <h3 className="font-semibold">{getMonthLabel(viewYear, viewMonth)}</h3>
            <button onClick={nextMonth} className="text-muted hover:text-content px-2 py-1 transition-colors">→</button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
              <div key={d} className="text-xs text-subtle py-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
              const dateStr = padDate(day)
              const record = byDate[dateStr]
              const isToday = dateStr === today
              const isFuture = dateStr > today

              return (
                <button
                  key={day}
                  disabled={isFuture || saving === dateStr}
                  onClick={() => !isFuture && toggleDay(day)}
                  className={`
                    aspect-square rounded-lg text-xs font-medium transition-colors relative
                    ${isFuture ? 'text-subtle cursor-default' : 'hover:opacity-80 cursor-pointer'}
                    ${isToday ? 'ring-1 ring-green-500' : ''}
                    ${record ? STATUS_COLORS[record.status] : isFuture ? '' : 'bg-elevated text-muted'}
                    ${saving === dateStr ? 'opacity-50' : ''}
                  `}
                >
                  {day}
                </button>
              )
            })}
          </div>

          <div className="flex gap-4 mt-4 justify-center">
            {Object.entries(STATUS_LABELS).map(([status, label]) => (
              <div key={status} className="flex items-center gap-1.5">
                <div className={`w-3 h-3 rounded ${STATUS_COLORS[status]}`} />
                <span className="text-xs text-muted">{label}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-elevated" />
              <span className="text-xs text-muted">Click to mark</span>
            </div>
          </div>
        </div>

        <p className="text-xs text-subtle mt-4 text-center">
          Tap a day to cycle: unmarked → present → absent → excused → remove
        </p>
      </main>
    </div>
  )
}
