import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import { getCachedUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Child, SchoolYear, Subject, StateRequirement } from '@/lib/types'
import PrintButton from './PrintButton'
import PrintFrame from '@/app/dashboard/PrintFrame'
import { MONTHS } from '@/lib/date'
import {
  distributedSubjectHours, coreHoursFromDistribution, roundBreakdown,
  parseGradeLevel, applicableAnnualHours, bandLabel,
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

// Scope a row to the active school year so the transcript's stated Period actually matches
// the hours/attendance/subjects below it: tagged to the year (school_year_id) OR dated within
// its range. Prevents a prior year's or a mis-dated entry from inflating this transcript.
function belongsToYear(syId: string | null, dateStr: string, year?: SchoolYear): boolean {
  if (!year) return true
  return syId === year.id || (dateStr >= year.start_date && dateStr <= year.end_date)
}

interface HomesteadCreditRow {
  child_ids: string[]
  subject_ids: string[]
  credit_hours: number | null
}

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

// "June 2026" from a YYYY-MM-DD verification date — for the liability-rule "Last verified" note.
function verifiedLabel(d: string | null | undefined): string | null {
  if (!d) return null
  const [y, m] = d.split('-').map(Number)
  return y && m ? `${MONTHS[m - 1]} ${y}` : null
}

export default async function TranscriptPage() {
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
    // Paginated — these grow past the 1000-row cap and feed hour/attendance totals.
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

  const generatedDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <style>{`
        @media print {
          /* Hide all UI chrome */
          .no-print { display: none !important; }
          nav { display: none !important; }
          header { display: none !important; }

          /* Clean white background — override root layout dark theme */
          html, body { background: white !important; background-color: white !important; color: black !important; }

          /* Remove dashboard layout bottom padding */
          body > div { padding-bottom: 0 !important; }

          /* Page breaks between children */
          .print-break { break-before: page; }
        }
      `}</style>

      {/* Toolbar — hidden on print */}
      <div className="no-print fixed top-0 left-0 right-0 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between z-10 shadow-sm">
        <Link href="/dashboard/homeschool/reports" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
          ← Back to Reports
        </Link>
        <PrintButton />
      </div>

      {/* Document */}
      <PrintFrame>
      <main className="max-w-2xl mx-auto px-8 pt-24 pb-16 space-y-16">
        {childList.map((child, idx) => {
          const year = yearList.find(y => y.child_id === child.id)
          const stateReq = year ? stateRequirements[year.state] : null
          const childLogs = logList.filter(l => l.child_id === child.id && belongsToYear(l.school_year_id, l.log_date, year))

          const presentDays = attendanceList.filter(a => a.child_id === child.id && a.status === 'present' && belongsToYear(a.school_year_id, a.attendance_date, year)).length
          const absentDays = attendanceList.filter(a => a.child_id === child.id && a.status === 'absent' && belongsToYear(a.school_year_id, a.attendance_date, year)).length
          const totalDays = presentDays + absentDays
          const attendanceRate = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : null

          const dailyHours = Math.round(childLogs.reduce((sum, l) => sum + (l.hours ?? 0), 0) * 10) / 10
          const homesteadCreditHours = Math.round(allHomesteadCredits
            .filter(c => c.child_ids?.includes(child.id))
            .reduce((sum, c) => sum + (c.credit_hours ?? 0), 0) * 10) / 10
          const totalHours = Math.round((dailyHours + homesteadCreditHours) * 10) / 10

          // Distribute every logged hour to its subject(s) (explicit split where set, else an
          // even split across the session's subjects; homestead credits included) so the
          // per-subject hours sum to the total. Consistent with the reports page.
          const childCredits = allHomesteadCredits.filter(c => c.child_ids?.includes(child.id))
          const { byName: subjHoursExact } = distributedSubjectHours(childLogs, childCredits, id => subjectMap[id])
          const subjHours = roundBreakdown(subjHoursExact) // rounded rows sum exactly to the total
          const coreHours = coreHoursFromDistribution(subjHours)
          const hasSubjectHours = Object.keys(subjHours).length > 0

          // ── State requirement model — SAME helpers + fields as the Reports page, so the
          //    transcript can never drift from the report (grade bands, days, per-day, testing). ──
          const reqType = stateReq?.requirement_type ?? null
          const gradeNum = parseGradeLevel(child.grade_level)
          const hoursTarget = stateReq ? applicableAnnualHours(stateReq, gradeNum) : null
          const hoursBand = stateReq ? bandLabel(stateReq, gradeNum) : null
          const daysTarget = stateReq?.annual_days ?? null
          const coreHoursReq = stateReq?.core_hours ?? null
          const coreHoursAtHome = stateReq?.core_hours_at_home ?? null
          const hoursMet = hoursTarget != null && totalHours >= hoursTarget
          const daysMet = daysTarget != null && presentDays >= daysTarget
          const avgHoursPerDay = presentDays > 0 ? Math.round((totalHours / presentDays) * 10) / 10 : null
          const requiredSubjects = stateReq?.subjects.filter(s => s.required) ?? []

          // Which requirement legs apply to this state's type.
          const showHoursReq = hoursTarget != null && (reqType === 'hours' || reqType === 'days_and_hours' || reqType === 'days_or_hours')
          const showDaysReq = daysTarget != null && (reqType === 'days' || reqType === 'days_plus_hours_per_day' || reqType === 'days_and_hours' || reqType === 'days_or_hours')
          const showPerDay = reqType === 'days_plus_hours_per_day' && stateReq?.hours_per_day != null

          // Subject coverage in hours where available, else session counts (prior behavior);
          // required state subjects are always included (at 0) so coverage gaps are visible.
          const sessionCounts: Record<string, number> = {}
          if (!hasSubjectHours) {
            childLogs.forEach(l => (l.subject_ids ?? []).forEach(id => {
              const n = subjectMap[id]; if (n) sessionCounts[n] = (sessionCounts[n] ?? 0) + 1
            }))
          }
          const coverageMap = hasSubjectHours ? subjHours : sessionCounts
          const subjectRows: [string, number][] = [...new Set([
            ...Object.keys(coverageMap),
            ...requiredSubjects.map(s => s.name),
          ])]
            .map(name => [name, coverageMap[name] ?? 0] as [string, number])
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))

          return (
            <section key={child.id} className={idx > 0 ? 'print-break' : ''}>
              {/* Header */}
              <div className="text-center mb-10 pb-6 border-b-2 border-gray-400">
                <p className="text-xs uppercase tracking-widest text-gray-500 mb-2">Home Education · Cultivate</p>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900">Homeschool Transcript</h1>
              </div>

              {/* Student info */}
              <div className="grid grid-cols-2 gap-x-8 gap-y-2 mb-10 text-sm">
                <div className="flex gap-2">
                  <span className="font-semibold text-gray-700 w-24 shrink-0">Student</span>
                  <span className="text-gray-900">{child.name}</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-semibold text-gray-700 w-24 shrink-0">State</span>
                  <span className="text-gray-900">{year?.state ?? '—'}</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-semibold text-gray-700 w-24 shrink-0">School Year</span>
                  <span className="text-gray-900">{year?.name ?? '—'}</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-semibold text-gray-700 w-24 shrink-0">Grade</span>
                  <span className="text-gray-900">{child.grade_level ?? 'Not specified'}</span>
                </div>
                {year && (
                  <div className="flex gap-2 col-span-2">
                    <span className="font-semibold text-gray-700 w-24 shrink-0">Period</span>
                    <span className="text-gray-900">{fmt(year.start_date)} – {fmt(year.end_date)}</span>
                  </div>
                )}
              </div>

              {/* State requirement — the plain-English statement for this student's state */}
              {stateReq?.requirement_summary && (
                <div className="mb-10">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-gray-800 mb-0 pb-2 border-b-2 border-gray-400 bg-gray-50 px-2 py-2 -mx-2">State Requirement</h2>
                  <p className="text-sm text-gray-800 leading-relaxed mt-3">{stateReq.requirement_summary}</p>
                  <p className="text-xs text-gray-500 mt-1.5">
                    {stateReq.citation ? `${stateReq.citation} · ` : ''}
                    {verifiedLabel(stateReq.last_verified) ? `Last verified ${verifiedLabel(stateReq.last_verified)} · ` : ''}
                    Not legal advice — always confirm current requirements at hslda.org/legal.
                  </p>
                </div>
              )}

              {/* Attendance */}
              <div className="mb-10">
                <h2 className="text-xs font-bold uppercase tracking-widest text-gray-800 mb-0 pb-2 border-b-2 border-gray-400 bg-gray-50 px-2 py-2 -mx-2">Attendance</h2>
                <table className="w-full text-sm mt-1">
                  <tbody>
                    <tr className="border-b border-gray-200">
                      <td className="py-2 text-gray-700">Days Present</td>
                      <td className="py-2 text-right font-semibold text-gray-900">{presentDays}</td>
                    </tr>
                    <tr className="border-b border-gray-200">
                      <td className="py-2 text-gray-700">Days Absent</td>
                      <td className="py-2 text-right font-semibold text-gray-900">{absentDays}</td>
                    </tr>
                    <tr className={showDaysReq ? 'border-b border-gray-200' : ''}>
                      <td className="py-2 text-gray-700">Total Days Recorded</td>
                      <td className="py-2 text-right font-semibold text-gray-900">{totalDays}</td>
                    </tr>
                    {showDaysReq && (
                      <tr className={attendanceRate !== null ? 'border-b border-gray-200' : ''}>
                        <td className="py-2 text-gray-700">State Minimum · {year?.state}</td>
                        <td className="py-2 text-right font-semibold text-gray-900">{presentDays} of {daysTarget} days{daysMet ? ' ✓' : ''}</td>
                      </tr>
                    )}
                    {attendanceRate !== null && (
                      <tr>
                        <td className="py-2 text-gray-700">Attendance Rate</td>
                        <td className="py-2 text-right font-semibold text-gray-900">{attendanceRate}%</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Hours */}
              <div className="mb-10">
                <h2 className="text-xs font-bold uppercase tracking-widest text-gray-800 mb-0 pb-2 border-b-2 border-gray-400 bg-gray-50 px-2 py-2 -mx-2">Instructional Hours</h2>
                <table className="w-full text-sm mt-1">
                  <tbody>
                    <tr className="border-b border-gray-200">
                      <td className="py-2 text-gray-700">Daily Log Hours</td>
                      <td className="py-2 text-right font-semibold text-gray-900">{dailyHours}h</td>
                    </tr>
                    {homesteadCreditHours > 0 && (
                      <tr className="border-b border-gray-200">
                        <td className="py-2 text-gray-700">Hands-on Credit Hours</td>
                        <td className="py-2 text-right font-semibold text-gray-900">{homesteadCreditHours}h</td>
                      </tr>
                    )}
                    <tr className="border-b border-gray-300">
                      <td className="py-2 font-bold text-gray-900">Total Hours</td>
                      <td className="py-2 text-right font-bold text-gray-900">{totalHours}h</td>
                    </tr>
                    {showHoursReq && (
                      <tr className="border-b border-gray-200">
                        <td className="py-2 text-gray-700">State Minimum · {year?.state}{hoursBand ? ` (${hoursBand})` : ''}</td>
                        <td className="py-2 text-right font-semibold text-gray-900">{totalHours} of {hoursTarget!.toLocaleString()}h{hoursMet ? ' ✓' : ''}</td>
                      </tr>
                    )}
                    {coreHoursReq && hasSubjectHours && (
                      <tr className="border-b border-gray-200">
                        <td className="py-2 text-gray-700">Core-Subject Hours · {year?.state}</td>
                        <td className="py-2 text-right font-semibold text-gray-900">{coreHours} of {coreHoursReq.toLocaleString()}h{coreHours >= coreHoursReq ? ' ✓' : ''}</td>
                      </tr>
                    )}
                    {showPerDay && (
                      <tr>
                        <td className="py-2 text-gray-700">Avg Hours / Day · min {stateReq?.hours_per_day}</td>
                        <td className="py-2 text-right font-semibold text-gray-900">{avgHoursPerDay ?? '—'}h</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {coreHoursAtHome != null && (
                  <p className="text-xs text-gray-500 mt-2">At least {coreHoursAtHome.toLocaleString()} of the core hours must occur at your home location.</p>
                )}
                {reqType === 'days_or_hours' && (
                  <p className="text-xs text-gray-500 mt-2">{year?.state} is satisfied by <span className="font-semibold">either</span> the days or the hours minimum.</p>
                )}
                {reqType === 'days_and_hours' && (
                  <p className="text-xs text-gray-500 mt-2">{year?.state} requires <span className="font-semibold">both</span> the days and the hours minimums.</p>
                )}
              </div>

              {/* Assessment / testing requirement */}
              {stateReq?.testing_required && (
                <div className="mb-10">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-gray-800 mb-0 pb-2 border-b-2 border-gray-400 bg-gray-50 px-2 py-2 -mx-2">Assessment</h2>
                  <p className="text-sm text-gray-800 leading-relaxed mt-3">
                    {stateReq.testing_note || `${year?.state} requires standardized testing or assessment${stateReq.testing_grades?.length ? ` (grades ${stateReq.testing_grades.join(', ')})` : ''}.`}
                  </p>
                </div>
              )}

              {/* Subject coverage */}
              {subjectRows.length > 0 && (
                <div className="mb-10">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-gray-800 mb-0 pb-2 border-b-2 border-gray-400 bg-gray-50 px-2 py-2 -mx-2">Subject Coverage</h2>
                  <table className="w-full text-sm mt-1">
                    <thead>
                      <tr className="border-b-2 border-gray-300">
                        <th className="py-2 text-left font-bold text-gray-800">Subject</th>
                        <th className="py-2 text-right font-bold text-gray-800">{hasSubjectHours ? 'Hours Logged' : 'Sessions Logged'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subjectRows.map(([name, value]) => {
                        const isRequired = requiredSubjects.some(s => s.name === name)
                        return (
                          <tr key={name} className="border-b border-gray-200">
                            <td className="py-2 text-gray-900">
                              {name}
                              {isRequired && <span className="text-gray-500 text-xs ml-1.5">✓ required</span>}
                            </td>
                            <td className="py-2 text-right text-gray-900 font-medium">{value}{hasSubjectHours ? 'h' : ''}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {requiredSubjects.length > 0 && (
                    <p className="text-xs text-gray-500 mt-2">✓ commonly required in {year?.state}. Confirm your state&apos;s required subjects at hslda.org/legal.</p>
                  )}
                </div>
              )}

              {/* Footer */}
              <div className="text-xs text-gray-500 border-t-2 border-gray-300 pt-4 space-y-1">
                <p>Generated {generatedDate} · Cultivate · mycultivate.app</p>
                <p>
                  State requirement data is for reference only. Homeschool laws change — always verify your state&apos;s
                  current requirements at <span className="underline">hslda.org/legal</span> or your state education department.
                </p>
              </div>
            </section>
          )
        })}

        {childList.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            No children set up yet.{' '}
            <Link href="/dashboard/homeschool/setup" className="text-green-600 underline">Set up →</Link>
          </div>
        )}
      </main>
      </PrintFrame>
    </div>
  )
}
