import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import { getCachedUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Child, SchoolYear, Subject, StateRequirement } from '@/lib/types'
import { getSuggestions } from '@/lib/suggestions'
import PrintButton from '@/app/dashboard/PrintButton'
import PrintFrame from '@/app/dashboard/PrintFrame'
import { getDeadlineAlert } from '@/lib/stateDeadlines'
import {
  parseGradeLevel,
  applicableAnnualHours,
  bandLabel,
  distributedSubjectHours,
  coreHoursFromDistribution,
  roundBreakdown,
} from '@/lib/compliance'

interface DailyLog {
  id: string
  child_id: string
  school_year_id: string | null
  log_date: string
  hours: number | null
  subject_ids: string[]
  subject_hours: Record<string, number> | null
}

interface AttendanceRow {
  child_id: string
  school_year_id: string | null
  attendance_date: string
  status: string
}

// A log/attendance row counts toward the active school year if it's tagged to that year
// (school_year_id — robust to summer/boundary logging) OR its date falls within the year's
// range (catches rows saved before a year was set up). Without this, hours/attendance from a
// PRIOR year or a mis-dated entry silently inflate the current year's compliance numbers.
function belongsToYear(syId: string | null, dateStr: string, year?: SchoolYear): boolean {
  if (!year) return true
  return syId === year.id || (dateStr >= year.start_date && dateStr <= year.end_date)
}

interface HomesteadCreditRow {
  child_ids: string[]
  subject_ids: string[]
  credit_hours: number | null
}

function daysBetween(a: string, b: Date) {
  return Math.max(0, Math.floor((b.getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24)))
}

function hoursStatus(gap: number): 'ahead' | 'close' | 'behind' | 'critical' {
  if (gap <= 0) return 'ahead'
  if (gap <= 10) return 'close'
  if (gap <= 30) return 'behind'
  return 'critical'
}

export default async function ReportsPage() {
  const supabase = await createClient()
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const [
    { data: children },
    { data: activeYears },
    { data: subjects },
    logList,
    attendanceList,
    livestockCredits,
    gardenCredits,
    preservationCredits,
    choreCredits,
  ] = await Promise.all([
    supabase.from('children').select('*').order('created_at'),
    supabase.from('school_years').select('*').eq('is_active', true),
    supabase.from('subjects').select('*').eq('is_active', true),
    // Paginated — these grow past the 1000-row cap and feed hour/day totals.
    fetchAllRows<DailyLog>((from, to) => supabase.from('daily_log').select('id, child_id, school_year_id, log_date, hours, subject_ids, subject_hours').order('log_date').range(from, to)),
    fetchAllRows<AttendanceRow>((from, to) => supabase.from('attendance').select('child_id, school_year_id, attendance_date, status').range(from, to)),
    fetchAllRows<HomesteadCreditRow>((from, to) => supabase.from('livestock_logs').select('child_ids, subject_ids, credit_hours').eq('school_credit', true).range(from, to)),
    fetchAllRows<HomesteadCreditRow>((from, to) => supabase.from('garden_entries').select('child_ids, subject_ids, credit_hours').eq('school_credit', true).range(from, to)),
    fetchAllRows<HomesteadCreditRow>((from, to) => supabase.from('preservation_logs').select('child_ids, subject_ids, credit_hours').eq('school_credit', true).range(from, to)),
    // Recurring chores marked done by a student for credit — same credit shape, 4th source.
    fetchAllRows<HomesteadCreditRow>((from, to) => supabase.from('chore_completions').select('child_ids, subject_ids, credit_hours').eq('school_credit', true).range(from, to)),
  ])

  const childList = (children ?? []) as Child[]
  const yearList = (activeYears ?? []) as SchoolYear[]
  const subjectList = (subjects ?? []) as Subject[]

  const allHomesteadCredits: HomesteadCreditRow[] = [
    ...livestockCredits,
    ...gardenCredits,
    ...preservationCredits,
    ...choreCredits,
  ]

  const states = [...new Set(yearList.map(y => y.state).filter(Boolean))]
  const { data: stateReqRows } = states.length
    ? await supabase.from('state_requirements').select('*').in('state', states)
    : { data: [] }

  const stateRequirements: Record<string, StateRequirement> = {}
  for (const row of (stateReqRows ?? [])) {
    stateRequirements[row.state] = row as StateRequirement
  }

  const subjectMap: Record<string, string> = {}
  subjectList.forEach(s => { subjectMap[s.id] = s.name })

  // Every child's Subject Coverage table draws from the SAME set of subjects (this + each
  // child's required state subjects), so the tables are consistent across all children in the
  // account — a subject one child covers shows for every child (at 0h if they haven't). Subjects
  // are stored per-child, so without this the lists diverge (an older child accrues more).
  const householdSubjects = [...new Set(subjectList.map(s => s.name.trim()).filter(Boolean))]

  const today = new Date()

  return (
    <div className="min-h-screen bg-surface text-content print:bg-white print:text-stone-900">
      <nav className="border-b border-line/60 px-6 py-4 flex items-center justify-between no-print">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/homeschool" className="text-subtle hover:text-content text-sm transition-colors">← Homeschool</Link>
          <span className="text-subtle">/</span>
          <span className="text-sm font-semibold">Reports</span>
        </div>
        <PrintButton />
      </nav>

      <PrintFrame>
      <main className="max-w-2xl lg:max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div className="hidden print:block mb-6 pb-4 border-b border-stone-300">
          <h1 className="text-xl font-bold text-stone-900">Cultivate</h1>
          <p className="text-sm text-subtle">mycultivate.app</p>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold mb-1">Reports</h2>
            <p className="text-muted text-sm">
              Year-to-date summary.{' '}
              <Link href="/dashboard/homeschool/transcript" className="text-green-500 hover:underline">Download transcript →</Link>
            </p>
          </div>
        </div>

        {/* No children state */}
        {childList.length === 0 && (
          <div className="text-center py-16 space-y-4">
            <div className="text-5xl">📄</div>
            <div>
              <p className="font-semibold text-content mb-1">No students set up yet</p>
              <p className="text-subtle text-sm max-w-xs mx-auto">
                Add your first child to start tracking hours, subjects, and compliance.
              </p>
            </div>
            <Link
              href="/dashboard/homeschool/setup"
              className="inline-block px-5 py-2.5 bg-green-800/60 hover:bg-green-700/60 border border-green-700/50 text-green-300 rounded-lg text-sm font-medium transition-colors"
            >
              Set up your first student →
            </Link>
          </div>
        )}

        {childList.map(child => {
          const year = yearList.find(y => y.child_id === child.id)
          const stateReq = year ? stateRequirements[year.state] : null
          const childLogs = logList.filter(l => l.child_id === child.id && belongsToYear(l.school_year_id, l.log_date, year))
          const presentDays = attendanceList.filter(a => a.child_id === child.id && a.status === 'present' && belongsToYear(a.school_year_id, a.attendance_date, year)).length
          const absentDays = attendanceList.filter(a => a.child_id === child.id && a.status === 'absent' && belongsToYear(a.school_year_id, a.attendance_date, year)).length

          const dailyHours = childLogs.reduce((sum, l) => sum + (l.hours ?? 0), 0)
          const homesteadCreditHours = allHomesteadCredits
            .filter(c => c.child_ids?.includes(child.id))
            .reduce((sum, c) => sum + (c.credit_hours ?? 0), 0)
          const totalHours = Math.round((dailyHours + homesteadCreditHours) * 10) / 10

          const subjectCounts: Record<string, number> = {}
          childLogs.forEach(l => {
            (l.subject_ids ?? []).forEach(id => {
              const name = subjectMap[id]
              if (name) subjectCounts[name] = (subjectCounts[name] ?? 0) + 1
            })
          })
          allHomesteadCredits
            .filter(c => c.child_ids?.includes(child.id))
            .forEach(c => {
              (c.subject_ids ?? []).forEach(id => {
                const name = subjectMap[id]
                if (name) subjectCounts[name] = (subjectCounts[name] ?? 0) + 1
              })
            })

          const topSubjects = Object.entries(subjectCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)

          // ── Requirement model (richer schema 2026-06-14) ──────────────
          const reqType = stateReq?.requirement_type ?? null
          const gradeNum = parseGradeLevel(child.grade_level)
          // Grade-aware annual-hours target (handles MT/NE/NY/PA grade bands).
          const hoursTarget = stateReq ? applicableAnnualHours(stateReq, gradeNum) : null
          const hoursBand = stateReq ? bandLabel(stateReq, gradeNum) : null
          const daysTarget = stateReq?.annual_days ?? null

          // Pace expectation across the ACTUAL school-year window (not a flat /365).
          const yearLen = year ? Math.max(1, daysBetween(year.start_date, new Date(year.end_date))) : 365
          const daysElapsed = year ? Math.min(yearLen, daysBetween(year.start_date, today)) : 0
          const paceFrac = year ? Math.min(1, daysElapsed / yearLen) : 0

          // Hours leg (used by hours / either-or / both / days+hrs-per-day pace).
          const expectedHours = hoursTarget && daysElapsed > 0 ? Math.round(hoursTarget * paceFrac) : null
          const hoursGap = expectedHours !== null ? Math.round((expectedHours - totalHours) * 10) / 10 : null
          const hoursPct = hoursTarget ? Math.min(100, Math.round((totalHours / hoursTarget) * 100)) : null
          const hoursStatusVal = hoursGap !== null ? hoursStatus(hoursGap) : null

          // Days leg.
          const daysPct = daysTarget ? Math.min(100, Math.round((presentDays / daysTarget) * 100)) : null
          const expectedDays = daysTarget ? Math.round(daysTarget * paceFrac) : null

          // Either-or / both: is each leg satisfied for the year?
          const hoursMet = hoursTarget ? totalHours >= hoursTarget : false
          const daysMet = daysTarget ? presentDays >= daysTarget : false

          // Per-day minimum states (CO/GA/ND/SC/TN): average hours per logged day.
          const avgHoursPerDay = presentDays > 0 ? Math.round((totalHours / presentDays) * 10) / 10 : null

          // ── Subject hours — distribute EVERY logged hour to its subject(s) so the
          //    breakdown sums to the total (explicit split where the parent set one, else an
          //    even split across the session's subjects; homestead credits included). ───────
          const childCredits = allHomesteadCredits.filter(c => c.child_ids?.includes(child.id))
          const { byName: subjHoursExact, anyEstimated } = distributedSubjectHours(childLogs, childCredits, id => subjectMap[id])
          // Round for display so the per-subject rows sum EXACTLY to the total (no 0.1 drift).
          const subjHours = roundBreakdown(subjHoursExact)
          const hasLoggedHours = Object.keys(subjHours).length > 0

          // Core-subject hours (MO 600) from the SAME distribution (stays consistent with the table).
          const coreHours = coreHoursFromDistribution(subjHours)
          const coreHoursReq = stateReq?.core_hours ?? null
          const coreHoursAtHome = stateReq?.core_hours_at_home ?? null
          const corePct = coreHoursReq ? Math.min(100, Math.round((coreHours / coreHoursReq) * 100)) : null

          const requiredSubjects = stateReq?.subjects.filter(s => s.required) ?? []
          const avgCount = topSubjects.length
            ? topSubjects.reduce((s, [, c]) => s + c, 0) / topSubjects.length
            : 0
          const subjectGaps = requiredSubjects.filter(s => {
            const count = subjectCounts[s.name] ?? 0
            return count < avgCount * 0.5
          })

          // Subject-coverage rows in HOURS, INCLUDING zero-hour subjects, drawn from the SHARED
          // household set + this child's required state subjects — so every child's table lists
          // the same subjects (Kyle's ask), each with their own hours. Sorted hours desc.
          const subjectRows: [string, number][] = [...new Set([
            ...householdSubjects,
            ...requiredSubjects.map(s => s.name),
            ...Object.keys(subjHours),
          ])]
            .map(name => [name, subjHours[name] ?? 0] as [string, number])
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))

          const requiredDays = year?.days_per_week
            ? Math.round(((today.getTime() - new Date(year.start_date).getTime()) / (1000 * 60 * 60 * 24 * 7)) * year.days_per_week)
            : null

          const hasNoLogs = childLogs.length === 0 && homesteadCreditHours === 0
          // Whether this state has ANY binding instructional-time target to show a pass/fail for.
          const hasTimeRequirement = reqType != null && reqType !== 'none' && reqType !== 'advisory'

          return (
            <section key={child.id} className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold">{child.name}</h3>
                {year && (
                  <span className="text-xs text-subtle">
                    {year.name} · {year.state}
                    {hoursTarget && (
                      <span className="text-subtle"> · {hoursTarget.toLocaleString()}h{hoursBand ? ` (${hoursBand})` : ''}</span>
                    )}
                  </span>
                )}
              </div>

              {/* Plain-English requirement — the authoritative statement for this state */}
              {stateReq?.requirement_summary && (
                <div className="bg-elevated/40 border border-line/60 rounded-lg px-4 py-3">
                  <p className="text-sm text-content leading-relaxed">{stateReq.requirement_summary}</p>
                  <p className="text-xs text-subtle mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    {stateReq.citation && <span>{stateReq.citation}</span>}
                    {!stateReq.is_enforced && <span className="text-amber-500/80">· on the books but generally unenforced</span>}
                    {stateReq.is_advisory && <span className="text-amber-500/80">· guideline, not a binding mandate</span>}
                    {stateReq.needs_signoff && <span className="text-amber-500/80">· verifying exact figures — confirm at HSLDA</span>}
                  </p>
                </div>
              )}

              {/* Filing deadline alert */}
              {year && (() => {
                const alert = getDeadlineAlert(year.state, today)
                if (!alert) return null
                return (
                  <div className={`border rounded-xl px-4 py-3 flex items-start gap-3 ${
                    alert.urgent
                      ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800/40'
                      : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40'
                  }`}>
                    <span className={`text-lg shrink-0 mt-0.5 ${alert.urgent ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}>
                      {alert.urgent ? '🚨' : '📋'}
                    </span>
                    <div className="flex-1">
                      <p className={`text-sm font-semibold ${alert.urgent ? 'text-red-800 dark:text-red-300' : 'text-amber-800 dark:text-amber-300'}`}>
                        {year.state} — {alert.label}
                        {alert.daysUntil !== null && (
                          <span className="font-normal ml-2 text-xs">
                            ({alert.daysUntil === 0 ? 'due today' : `${alert.daysUntil} day${alert.daysUntil === 1 ? '' : 's'}`})
                          </span>
                        )}
                        {alert.deadlineDate && (
                          <span className="font-normal ml-2 text-xs text-subtle">
                            {alert.deadlineDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                          </span>
                        )}
                      </p>
                      {alert.notes && (
                        <p className="text-xs text-subtle mt-0.5">{alert.notes}</p>
                      )}
                      <a
                        href="https://hslda.org/legal"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-green-500 hover:underline mt-1 inline-block"
                      >
                        Verify requirements at HSLDA →
                      </a>
                    </div>
                  </div>
                )
              })()}

              {/* No logs yet — with example */}
              {hasNoLogs && (
                <div className="bg-card border border-line rounded-xl p-5 space-y-4">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">📝</span>
                    <div>
                      <p className="font-semibold text-content mb-1">No logs yet for {child.name}</p>
                      <p className="text-subtle text-sm">
                        Start logging to see hours, subject coverage, and compliance tracking here.
                      </p>
                    </div>
                  </div>
                  <div className="bg-elevated/50 border border-line-strong/50 rounded-lg p-4">
                    <p className="text-xs font-semibold text-subtle uppercase tracking-wider mb-2">Example log entry</p>
                    <p className="text-sm text-content italic">
                      &ldquo;{child.name} and I worked through long division this morning, then spent the afternoon
                      processing chickens together — she weighed and recorded each one.&rdquo;
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {['Mathematics', 'Life Skills', 'Biology'].map(s => (
                        <span key={s} className="px-2 py-0.5 bg-green-100 dark:bg-green-900/40 border border-green-200 dark:border-green-800/40 rounded-full text-xs text-green-800 dark:text-green-300">{s}</span>
                      ))}
                      <span className="px-2 py-0.5 bg-elevated border border-line-strong rounded-full text-xs text-muted">AI-tagged</span>
                    </div>
                  </div>
                  <Link
                    href="/dashboard"
                    className="block w-full py-2.5 text-center bg-green-800/50 hover:bg-green-700/50 border border-green-700/40 text-green-300 hover:text-green-200 rounded-lg text-sm font-medium transition-colors"
                  >
                    Log {child.name}&apos;s first day →
                  </Link>
                </div>
              )}

              {/* Stats row */}
              {!hasNoLogs && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatCard label="Days Present" value={presentDays} color="green" />
                  <StatCard label="Days Absent" value={absentDays} color="stone" />
                  {totalHours > 0 && <StatCard label="Hours Logged" value={totalHours} color="blue" />}
                  {homesteadCreditHours > 0 && <StatCard label="Hands-on Credit" value={homesteadCreditHours} color="amber" />}
                </div>
              )}

              {/* ── HOURS leg (hours · both · either-or) ───────────────── */}
              {!hasNoLogs && (reqType === 'hours' || reqType === 'days_and_hours' || reqType === 'days_or_hours') && hoursTarget && expectedHours !== null && hoursGap !== null && (
                <div className={`border rounded-xl p-4 space-y-3 ${
                  hoursMet ? 'bg-card border-line' :
                  hoursStatusVal === 'critical' ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800/40' :
                  hoursStatusVal === 'behind' ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40' :
                  hoursStatusVal === 'close' ? 'bg-amber-50 dark:bg-amber-950/10 border-amber-200 dark:border-amber-900/30' :
                  'bg-card border-line'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                      Hours this year{hoursBand ? ` · ${hoursBand}` : ''}
                    </span>
                    <span className={`text-xs font-semibold ${
                      hoursMet ? 'text-green-600 dark:text-green-400' :
                      hoursStatusVal === 'critical' ? 'text-red-700 dark:text-red-400' :
                      hoursStatusVal === 'behind' ? 'text-amber-700 dark:text-amber-400' :
                      hoursStatusVal === 'close' ? 'text-amber-800 dark:text-amber-300' :
                      'text-green-600 dark:text-green-400'
                    }`}>
                      {totalHours}h of {hoursTarget.toLocaleString()}h
                    </span>
                  </div>

                  <div className="w-full bg-elevated rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        hoursMet ? 'bg-green-500' :
                        hoursStatusVal === 'critical' ? 'bg-red-500' :
                        hoursStatusVal === 'behind' ? 'bg-amber-500' :
                        hoursStatusVal === 'close' ? 'bg-amber-400' :
                        'bg-green-500'
                      }`}
                      style={{ width: `${hoursPct}%` }}
                    />
                  </div>

                  <div className="space-y-1.5">
                    {hoursMet ? (
                      <p className="text-sm text-green-600 dark:text-green-400 font-medium">✓ {hoursTarget.toLocaleString()}h requirement met for the year</p>
                    ) : hoursStatusVal === 'ahead' ? (
                      <p className="text-sm text-green-600 dark:text-green-400 font-medium">✓ On track — {Math.abs(hoursGap)}h ahead of pace ({expectedHours}h expected by now)</p>
                    ) : hoursStatusVal === 'close' ? (
                      <p className="text-sm text-amber-800 dark:text-amber-300 font-medium">Almost there — {hoursGap}h behind pace. One solid week catches this up.</p>
                    ) : hoursStatusVal === 'behind' ? (
                      <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">{hoursGap}h behind pace for {year?.state} ({hoursTarget.toLocaleString()}h/year).</p>
                    ) : (
                      <p className="text-sm text-red-700 dark:text-red-400 font-medium">{hoursGap}h behind — at this pace you&apos;ll fall short of {year?.state}&apos;s {hoursTarget.toLocaleString()}h requirement.</p>
                    )}

                    {!hoursMet && (hoursStatusVal === 'behind' || hoursStatusVal === 'critical') && (
                      <p className="text-xs text-subtle">
                        To catch up: log {Math.ceil(hoursGap / 30)} more hour{Math.ceil(hoursGap / 30) !== 1 ? 's' : ''} per day for the next 30 days, or{' '}
                        <Link href="/dashboard" className="text-green-500 hover:underline">start logging now →</Link>
                      </p>
                    )}
                    {homesteadCreditHours > 0 && (
                      <p className="text-xs text-amber-700 dark:text-amber-400/70">Includes {homesteadCreditHours}h from Homestead logs</p>
                    )}
                  </div>
                </div>
              )}

              {/* ── DAYS leg (days · days+hrs/day · both · either-or) ───── */}
              {!hasNoLogs && (reqType === 'days' || reqType === 'days_plus_hours_per_day' || reqType === 'days_and_hours' || reqType === 'days_or_hours') && daysTarget && (
                <div className={`border rounded-xl p-4 space-y-2 ${daysMet ? 'bg-card border-line' : 'bg-card border-line'}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted">Days requirement</span>
                    <span className={`text-xs font-semibold ${daysMet ? 'text-green-600 dark:text-green-400' : 'text-subtle'}`}>{presentDays} of {daysTarget} days</span>
                  </div>
                  <div className="w-full bg-elevated rounded-full h-2">
                    <div className="bg-green-600 h-2 rounded-full transition-all" style={{ width: `${daysPct}%` }} />
                  </div>
                  <p className="text-xs text-subtle">
                    {daysMet ? `✓ ${year?.state}'s ${daysTarget}-day requirement met` : `${daysPct}% of ${year?.state}'s ${daysTarget}-day school year${expectedDays ? ` · ~${expectedDays} expected by now` : ''}`}
                  </p>
                  {reqType === 'days_plus_hours_per_day' && stateReq?.hours_per_day != null && (
                    <p className={`text-xs pt-1 border-t border-line/60 mt-1 ${avgHoursPerDay != null && avgHoursPerDay < stateReq.hours_per_day ? 'text-amber-600 dark:text-amber-400' : 'text-subtle'}`}>
                      {year?.state} requires each day to average at least {stateReq.hours_per_day} instructional hours
                      {avgHoursPerDay != null ? ` — you're averaging ${avgHoursPerDay}h per logged day.` : '.'}
                      <span className="text-subtle"> There is no statutory total-hours number for {year?.state}.</span>
                    </p>
                  )}
                </div>
              )}

              {/* Either-or / both framing */}
              {!hasNoLogs && reqType === 'days_or_hours' && (daysTarget || hoursTarget) && (
                <p className="text-xs text-subtle px-1">
                  {year?.state} is satisfied by <span className="font-semibold">either</span> measure
                  {daysTarget && hoursTarget ? ` (${daysTarget} days or ${hoursTarget.toLocaleString()} hours)` : ''} —{' '}
                  {daysMet ? <span className="text-green-600 dark:text-green-400 font-medium">✓ days requirement met.</span>
                    : hoursMet ? <span className="text-green-600 dark:text-green-400 font-medium">✓ hours requirement met.</span>
                    : 'meeting one is enough.'}
                </p>
              )}
              {!hasNoLogs && reqType === 'days_and_hours' && (
                <p className="text-xs text-subtle px-1">{year?.state} requires <span className="font-semibold">both</span> the days and the hours minimums.</p>
              )}

              {/* ── CORE-SUBJECT HOURS (MO 600 rule) — from the distributed subject hours ── */}
              {!hasNoLogs && coreHoursReq && hasLoggedHours && (
                <div className={`border rounded-xl p-4 space-y-2 ${coreHours >= coreHoursReq ? 'bg-card border-line' : corePct! >= Math.round(paceFrac * 100) - 10 ? 'bg-card border-line' : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40'}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted">Core-subject hours</span>
                    <span className={`text-xs font-semibold ${coreHours >= coreHoursReq ? 'text-green-600 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}`}>{coreHours}h of {coreHoursReq}h</span>
                  </div>
                  <div className="w-full bg-elevated rounded-full h-2">
                    <div className={`h-2 rounded-full transition-all ${coreHours >= coreHoursReq ? 'bg-green-500' : 'bg-amber-500'}`} style={{ width: `${corePct}%` }} />
                  </div>
                  <p className="text-xs text-subtle">
                    {coreHours >= coreHoursReq
                      ? `✓ At least ${coreHoursReq} of your hours are in the 5 core subjects (reading, language arts, math, science, social studies).`
                      : `${year?.state} requires at least ${coreHoursReq} of the ${hoursTarget?.toLocaleString()} hours in the 5 core subjects (reading, language arts, math, science, social studies).`}
                    {coreHoursAtHome ? ` At least ${coreHoursAtHome} of those core hours must occur at your home location.` : ''}
                  </p>
                  {anyEstimated && (
                    <p className="text-xs text-subtle/80 italic">Sessions where you didn&apos;t set time per subject are split evenly across that session&apos;s subjects. Set per-subject time on the log for exact tracking.</p>
                  )}
                </div>
              )}

              {/* ── ADVISORY (KS/RI/MA) — benchmark, not pass/fail ──────── */}
              {!hasNoLogs && reqType === 'advisory' && (
                <div className="bg-amber-50 dark:bg-amber-950/10 border border-amber-200 dark:border-amber-900/30 rounded-xl p-4">
                  <p className="text-sm text-content">{year?.state} has no binding hours or days mandate — the figure above is a guideline, not a hard requirement.</p>
                  {totalHours > 0 && <p className="text-xs text-subtle mt-1">For reference, you&apos;ve logged {totalHours}h this year.</p>}
                </div>
              )}

              {/* ── NONE — no instructional-time minimum ────────────────── */}
              {!hasNoLogs && reqType === 'none' && (
                <div className="bg-card border border-line rounded-xl p-4">
                  <p className="text-sm text-content">✓ {year?.state} has no required minimum instructional hours or days.</p>
                  <p className="text-xs text-subtle mt-1">
                    {totalHours > 0 ? `You've logged ${totalHours}h so far — ` : ''}keep records for your own planning{stateReq?.testing_required ? ' plus the assessment requirements below' : ''}.
                  </p>
                </div>
              )}

              {/* ── TESTING / ASSESSMENT ────────────────────────────────── */}
              {!hasNoLogs && stateReq?.testing_required && (
                <div className="bg-card border border-line rounded-xl px-4 py-3 flex items-start gap-2.5">
                  <span className="text-base shrink-0">📋</span>
                  <p className="text-xs text-subtle">
                    {stateReq.testing_note || `${year?.state} requires standardized testing or assessment${stateReq.testing_grades?.length ? ` (grades ${stateReq.testing_grades.join(', ')})` : ''}.`}
                  </p>
                </div>
              )}

              {/* Subject gaps — action-linked. Clean, legible in both themes (light amber tint
                  in light mode, dark in dark) with token-based body text. */}
              {!hasNoLogs && subjectGaps.length > 0 && childLogs.length >= 5 && (
                <div className="bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/40 rounded-xl p-4 space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">
                      {subjectGaps.length} commonly-expected subject{subjectGaps.length !== 1 ? 's' : ''} look{subjectGaps.length === 1 ? 's' : ''} light
                    </h4>
                    <p className="text-xs text-muted">
                      These are commonly expected in {year?.state}{' '}and are underrepresented in your logs compared to what you&apos;ve been covering. Always confirm your state&apos;s required subjects at HSLDA.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {subjectGaps.map(s => (
                      <span key={s.name} className="px-3 py-1 rounded-full text-xs font-medium bg-amber-100 border border-amber-300 text-amber-800 dark:bg-amber-900/40 dark:border-amber-800 dark:text-amber-300">
                        {s.name}
                      </span>
                    ))}
                  </div>

                  {/* Suggestions — specific and actionable */}
                  {subjectGaps.some(s => getSuggestions(s.name).length > 0) && (
                    <div className="space-y-4 pt-3 border-t border-amber-200 dark:border-amber-900/40">
                      <p className="text-xs font-semibold text-muted">
                        Work around the place that counts — log these this week:
                      </p>
                      {subjectGaps.map(s => {
                        const suggestions = getSuggestions(s.name).slice(0, 2)
                        if (!suggestions.length) return null
                        return (
                          <div key={s.name}>
                            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1.5">{s.name}</p>
                            <ul className="space-y-1.5">
                              {suggestions.map((suggestion, i) => (
                                <li key={i} className="flex gap-2 text-xs text-muted">
                                  <span className="text-amber-600 dark:text-amber-500 shrink-0 mt-px">→</span>
                                  {suggestion}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )
                      })}
                      <Link
                        href="/dashboard"
                        className="block w-full py-2 text-center text-xs font-medium text-green-700 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 border border-line-strong hover:bg-elevated rounded-lg transition-colors"
                      >
                        Log an activity now →
                      </Link>
                    </div>
                  )}
                </div>
              )}

              {/* Attendance progress */}
              {!hasNoLogs && requiredDays !== null && requiredDays > 0 && (
                <div className="bg-card border border-line rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted">Attendance</span>
                    <span className="text-xs text-subtle">{presentDays} present · ~{requiredDays} expected so far</span>
                  </div>
                  <div className="w-full bg-elevated rounded-full h-2">
                    <div
                      className="bg-green-600 h-2 rounded-full transition-all"
                      style={{ width: `${Math.min(100, Math.round((presentDays / Math.max(1, requiredDays)) * 100))}%` }}
                    />
                  </div>
                  <p className="text-xs text-subtle">
                    {Math.round((presentDays / Math.max(1, requiredDays)) * 100)}% of estimated year-to-date pace
                  </p>
                </div>
              )}

              {/* Subject coverage — in HOURS (every logged hour distributed to its subjects),
                  including subjects with zero hours so coverage gaps are visible. */}
              {!hasNoLogs && subjectRows.length > 0 && (() => {
                const max = Math.max(...subjectRows.map(([, v]) => v), 0) || 1
                const withHours = subjectRows.filter(([, v]) => v > 0).length
                return (
                  <div className="bg-card border border-line rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">Subject Coverage (hours)</h4>
                      <span className="text-xs text-subtle">{withHours} of {subjectRows.length} subjects logged</span>
                    </div>
                    <div className="space-y-2">
                      {subjectRows.map(([name, val]) => {
                        const isRequired = requiredSubjects.some(s => s.name === name)
                        const isGap = subjectGaps.some(s => s.name === name)
                        const isZero = val === 0
                        return (
                          <div key={name} className="flex items-center gap-3">
                            <span className={`text-sm w-36 shrink-0 truncate ${isGap ? 'text-amber-600 dark:text-amber-400' : isZero ? 'text-subtle' : 'text-content'}`}>
                              {name}
                              {isRequired && !isGap && <span className="text-subtle text-xs ml-1">✓</span>}
                              {isGap && <span className="text-amber-500 text-xs ml-1">⚠</span>}
                            </span>
                            <div className="flex-1 bg-elevated rounded-full h-1.5">
                              <div
                                className={`h-1.5 rounded-full ${isGap ? 'bg-amber-600' : 'bg-green-600'}`}
                                style={{ width: `${Math.round((val / max) * 100)}%` }}
                              />
                            </div>
                            <span className={`text-xs w-12 text-right ${isZero ? 'text-subtle/70' : 'text-subtle'}`}>{val}h</span>
                          </div>
                        )
                      })}
                    </div>
                    {requiredSubjects.length > 0 && (
                      <p className="text-xs text-subtle">✓ commonly expected in {year?.state} · ⚠ looks light</p>
                    )}
                    {anyEstimated && (
                      <p className="text-xs text-subtle/80 italic">Sessions where you didn&apos;t set time per subject are split evenly across that session&apos;s subjects. Set per-subject time on the log for exact tracking.</p>
                    )}
                  </div>
                )
              })()}
            </section>
          )
        })}

        {/* Transcript CTA */}
        {childList.length > 0 && (
          <Link
            href="/dashboard/homeschool/transcript"
            className="block bg-card border border-line hover:border-green-800/60 rounded-xl p-4 text-center transition-colors group"
          >
            <p className="text-muted text-sm group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors">Download Transcript (PDF) →</p>
          </Link>
        )}

        <p className="text-xs text-subtle text-center pb-4">
          State requirement data is for reference only. Homeschool laws change — always verify your state&apos;s current
          requirements at{' '}
          <a href="https://hslda.org/legal" target="_blank" rel="noopener noreferrer" className="underline hover:text-muted transition-colors">hslda.org/legal</a>{' '}
          or your state education department.
        </p>
      </main>
      </PrintFrame>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    green: 'text-green-600 dark:text-green-400',
    amber: 'text-amber-600 dark:text-amber-400',
    blue: 'text-sky-600 dark:text-sky-400',
    stone: 'text-content',
  }
  return (
    <div className="bg-card border border-line rounded-xl p-4 text-center">
      <div className={`text-2xl font-bold ${colors[color] ?? 'text-content'}`}>{value}</div>
      <div className="text-xs text-subtle mt-0.5">{label}</div>
    </div>
  )
}
