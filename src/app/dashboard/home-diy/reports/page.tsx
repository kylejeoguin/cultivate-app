import { createClient } from '@/lib/supabase/server'
import { formatDate as formatDateFull } from '@/lib/dates'
import { daysUntil } from '@/lib/dueDates'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import { getCachedUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { parseRange, getStartDate, DATE_RANGES, RANGE_LABELS } from '@/lib/date-range'
import type { EquipmentMaintenance, Project, ProjectExpense } from '@/lib/types'
import PrintButton from '@/app/dashboard/PrintButton'
import PrintFrame from '@/app/dashboard/PrintFrame'

const CATEGORY_LABELS: Record<string, string> = {
  tractor: 'Tractor', hvac: 'HVAC', well: 'Well / Water',
  vehicle: 'Vehicle', appliance: 'Appliance', tool: 'Tool',
  generator: 'Generator', other: 'Other',
}

function formatDate(dateStr: string | null) {
  return dateStr ? formatDateFull(dateStr) : null
}


type EquipmentStatus = 'overdue' | 'due_soon' | 'ok' | 'inactive'

function getStatus(e: EquipmentMaintenance): EquipmentStatus {
  if (!e.is_active) return 'inactive'
  const days = daysUntil(e.next_service_date)
  if (days === null) return 'ok'
  if (days < 0) return 'overdue'
  if (days <= 30) return 'due_soon'
  return 'ok'
}

export default async function HomeDiyReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>
}) {
  const supabase = await createClient()
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const range = parseRange(params.range)
  const startDate = getStartDate(range)

  const [{ data: equipment }, { data: projectData }, allExpenses] = await Promise.all([
    supabase.from('equipment_maintenance').select('*').eq('is_active', true).order('next_service_date', { ascending: true, nullsFirst: false }),
    supabase.from('projects').select('*').eq('category', 'home_diy').order('status').order('created_at', { ascending: false }),
    // Paginated — project expenses accumulate and feed the spend totals below.
    fetchAllRows<ProjectExpense>((f, t) => supabase.from('project_expenses').select('*').order('expense_date', { ascending: false }).range(f, t)),
  ])

  const equipmentList = (equipment ?? []) as EquipmentMaintenance[]
  const projectList = (projectData ?? []) as Project[]

  const activeProjects = projectList.filter(p => p.status === 'active')
  const doneProjects = projectList.filter(p => p.status === 'done')
  const totalProjectBudget = projectList.reduce((sum, p) => sum + (p.budget ?? 0), 0)
  const totalProjectSpent = allExpenses
    .filter(e => projectList.some(p => p.id === e.project_id))
    .reduce((sum, e) => sum + e.amount, 0)

  // Date range filter: filter by last_service_date if a range is set and not 'all'
  if (startDate) {
    // Show equipment that has been serviced in range OR is upcoming / overdue
    // Don't filter out equipment with no service date — that's still relevant
    // Filter only shows equipment serviced recently OR due soon/overdue
    // Most useful: keep all equipment visible but note which were serviced in the range
  }

  const overdueList = equipmentList.filter(e => getStatus(e) === 'overdue')
  const dueSoonList = equipmentList.filter(e => getStatus(e) === 'due_soon')
  const okList = equipmentList.filter(e => getStatus(e) === 'ok')

  const fullSchedule = [...overdueList, ...dueSoonList, ...okList]

  // Category breakdown with counts
  const categoryCounts: Record<string, number> = {}
  const categoryEquipment: Record<string, EquipmentMaintenance[]> = {}
  for (const e of equipmentList) {
    const key = e.category
    categoryCounts[key] = (categoryCounts[key] ?? 0) + 1
    if (!categoryEquipment[key]) categoryEquipment[key] = []
    categoryEquipment[key].push(e)
  }
  const categoryEntries = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])

  return (
    <div className="min-h-screen bg-surface text-content print:bg-white print:text-stone-900">
      <nav className="border-b border-line/60 px-6 py-4 flex items-center justify-between no-print">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/household" className="text-subtle hover:text-content text-sm transition-colors">← Household</Link>
          <span className="text-subtle">/</span>
          <span className="text-sm font-semibold text-sky-600 dark:text-sky-400">Reports</span>
        </div>
        <PrintButton />
      </nav>

      <PrintFrame>
      <main className="max-w-2xl mx-auto px-6 py-8 space-y-8">
        {/* Print header */}
        <div className="hidden print:block mb-6 pb-4 border-b border-stone-300">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-stone-900">Cultivate — Home & DIY Report</h1>
              <p className="text-sm text-subtle">mycultivate.app</p>
            </div>
            <p className="text-xs text-subtle">Generated {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
          </div>
        </div>

        {/* Page header */}
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-bold mb-1">Home Reports</h2>
            <p className="text-muted text-sm">Projects and maintenance at a glance.</p>
          </div>
          <div className="flex gap-2 flex-wrap no-print">
            {DATE_RANGES.map(r => (
              <Link
                key={r}
                href={r === 'ytd' ? '/dashboard/home-diy/reports' : `/dashboard/home-diy/reports?range=${r}`}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  range === r ? 'bg-elevated text-content' : 'text-subtle hover:text-muted'
                }`}
              >
                {RANGE_LABELS[r]}
              </Link>
            ))}
          </div>
        </div>

        {equipmentList.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-14 h-14 rounded-2xl bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center text-3xl mx-auto mb-4">📊</div>
            <h3 className="text-lg font-semibold mb-2">No equipment tracked yet</h3>
            <p className="text-muted text-sm mb-6">Add your first item in Equipment & Maintenance to see reports here.</p>
            <Link
              href="/dashboard/home-diy/equipment"
              className="inline-block bg-gradient-to-r from-sky-800 to-sky-700 hover:from-sky-700 hover:to-sky-600 text-white font-semibold px-6 py-3 rounded-xl transition-all shadow-lg shadow-sky-900/30"
            >
              Add Equipment
            </Link>
          </div>
        ) : (
          <>
            {/* Projects summary */}
            {projectList.length > 0 && (
              <div className="bg-card border border-line rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-subtle uppercase tracking-widest">Projects</h3>
                  <Link href="/dashboard/projects?category=home_diy" className="text-xs text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 transition-colors">View all →</Link>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <div className="text-xl font-bold text-green-600 dark:text-green-400">{activeProjects.length}</div>
                    <div className="text-xs text-subtle">active</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-content">{projectList.length}</div>
                    <div className="text-xs text-subtle">total</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-amber-600 dark:text-amber-400">{doneProjects.length}</div>
                    <div className="text-xs text-subtle">completed</div>
                  </div>
                </div>
                {totalProjectSpent > 0 && (
                  <div className="border-t border-line pt-3 flex items-center justify-between text-sm">
                    <span className="text-muted">Total spent across projects</span>
                    <span className="font-bold text-red-600 dark:text-red-400">${totalProjectSpent.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                {totalProjectBudget > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted">Total budgeted</span>
                    <span className="font-bold text-content">${totalProjectBudget.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                {activeProjects.length > 0 && (
                  <div className="space-y-1.5 border-t border-line pt-3">
                    {activeProjects.slice(0, 5).map(p => (
                      <div key={p.id} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                          <span className="text-content">{p.title}</span>
                        </div>
                        {p.budget && (
                          <span className="text-subtle">${p.budget.toLocaleString()}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Total Tracked" value={equipmentList.length} color="sky" />
              <StatCard label="Overdue" value={overdueList.length} color="red" />
              <StatCard label="Due Soon" value={dueSoonList.length} color="amber" />
              <StatCard label="All Good" value={okList.length} color="green" />
            </div>

            {/* Overdue */}
            {overdueList.length > 0 && (
              <div className="bg-red-50 border border-red-200 dark:bg-red-950/20 dark:border-red-800/50 rounded-xl p-5">
                <h3 className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-widest mb-3">Overdue Service</h3>
                <div className="divide-y divide-red-200 dark:divide-red-900/30">
                  {overdueList.map(e => {
                    const days = Math.abs(daysUntil(e.next_service_date) ?? 0)
                    return (
                      <Link key={e.id} href={`/dashboard/home-diy/reports/${e.category}`} className="flex items-center justify-between py-2 first:pt-0 last:pb-0 group">
                        <div>
                          <span className="text-sm font-medium group-hover:text-content transition-colors">{e.equipment_name}</span>
                          <span className="text-xs text-subtle ml-2">{CATEGORY_LABELS[e.category] ?? e.category}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs font-semibold bg-red-600 text-white px-2 py-0.5 rounded-full">{days}d overdue</span>
                          <span className="text-xs text-subtle group-hover:text-muted transition-colors">→</span>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Due soon */}
            {dueSoonList.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800/40 rounded-xl p-5">
                <h3 className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-widest mb-3">Due Within 30 Days</h3>
                <div className="divide-y divide-amber-200 dark:divide-amber-900/30">
                  {dueSoonList.map(e => {
                    const days = daysUntil(e.next_service_date) ?? 0
                    return (
                      <Link key={e.id} href={`/dashboard/home-diy/reports/${e.category}`} className="flex items-center justify-between py-2 first:pt-0 last:pb-0 group">
                        <div>
                          <span className="text-sm font-medium group-hover:text-content transition-colors">{e.equipment_name}</span>
                          <span className="text-xs text-subtle ml-2">{CATEGORY_LABELS[e.category] ?? e.category}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 rounded-full">{days === 0 ? 'Due today' : `${days}d`}</span>
                          <span className="text-xs text-subtle group-hover:text-muted transition-colors">→</span>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Category breakdown — clickable */}
            <div className="bg-card border border-line rounded-xl p-5 space-y-3">
              <h3 className="text-xs font-semibold text-subtle uppercase tracking-widest">By Category</h3>
              <div className="divide-y divide-line/60">
                {categoryEntries.map(([cat, count]) => {
                  const catEquip = categoryEquipment[cat] ?? []
                  const overdueInCat = catEquip.filter(e => getStatus(e) === 'overdue').length
                  const dueSoonInCat = catEquip.filter(e => getStatus(e) === 'due_soon').length
                  return (
                    <Link
                      key={cat}
                      href={`/dashboard/home-diy/reports/${cat}`}
                      className="flex items-center justify-between py-3 first:pt-0 last:pb-0 group"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-content group-hover:text-content transition-colors">
                          {CATEGORY_LABELS[cat] ?? cat}
                        </span>
                        {overdueInCat > 0 && (
                          <span className="text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 px-1.5 py-0.5 rounded-full">{overdueInCat} overdue</span>
                        )}
                        {overdueInCat === 0 && dueSoonInCat > 0 && (
                          <span className="text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-1.5 py-0.5 rounded-full">{dueSoonInCat} due soon</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-subtle">{count} item{count !== 1 ? 's' : ''}</span>
                        <span className="text-xs text-subtle group-hover:text-muted transition-colors">→</span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>

            {/* Full maintenance schedule */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-subtle uppercase tracking-widest">Full Maintenance Schedule</h3>
              {fullSchedule.map(e => {
                const status = getStatus(e)
                const days = daysUntil(e.next_service_date)
                const borderClass =
                  status === 'overdue' ? 'border-red-800/60' :
                  status === 'due_soon' ? 'border-amber-800/50' : 'border-line'
                const badgeEl =
                  status === 'overdue' ? (
                    <span className="text-xs font-semibold bg-red-600 text-white px-2 py-0.5 rounded-full">
                      {Math.abs(days ?? 0)}d overdue
                    </span>
                  ) : status === 'due_soon' ? (
                    <span className="text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 rounded-full">
                      {days === 0 ? 'Due today' : `Due in ${days}d`}
                    </span>
                  ) : e.next_service_date ? (
                    <span className="text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 px-2 py-0.5 rounded-full">OK</span>
                  ) : (
                    <span className="text-xs text-subtle bg-elevated/60 px-2 py-0.5 rounded-full">No date set</span>
                  )

                return (
                  <Link key={e.id} href={`/dashboard/home-diy/reports/${e.category}`} className="block group">
                    <div className={`bg-card border ${borderClass} group-hover:border-line-strong rounded-xl p-4 transition-colors`}>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <span className="font-medium text-sm group-hover:text-content transition-colors">{e.equipment_name}</span>
                          <span className="text-xs text-subtle ml-2">{CATEGORY_LABELS[e.category] ?? e.category}</span>
                          {e.location && <span className="text-xs text-subtle ml-1">· {e.location}</span>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {badgeEl}
                          <span className="text-xs text-subtle group-hover:text-muted transition-colors no-print">→</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-subtle">
                        <span>Last service: {formatDate(e.last_service_date) ?? 'Never serviced'}</span>
                        <span>Next: {formatDate(e.next_service_date) ?? 'No interval set'}</span>
                        {e.service_interval_days && <span>Every {e.service_interval_days}d</span>}
                      </div>
                      {e.service_notes && <p className="text-xs text-muted mt-2">{e.service_notes}</p>}
                    </div>
                  </Link>
                )
              })}
            </div>

            <Link
              href="/dashboard/home-diy/equipment"
              className="block bg-card border border-line hover:border-sky-800 rounded-xl p-4 text-center transition-colors group"
            >
              <p className="text-muted text-sm group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">Manage Equipment & Maintenance →</p>
            </Link>
          </>
        )}
      </main>
      </PrintFrame>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    sky: 'text-sky-600 dark:text-sky-400', red: 'text-red-600 dark:text-red-400', amber: 'text-amber-600 dark:text-amber-400', green: 'text-green-600 dark:text-green-400',
  }
  return (
    <div className="bg-card border border-line rounded-xl p-4 text-center">
      <div className={`text-2xl font-bold ${colors[color] ?? 'text-content'}`}>{value}</div>
      <div className="text-xs text-subtle mt-0.5">{label}</div>
    </div>
  )
}
