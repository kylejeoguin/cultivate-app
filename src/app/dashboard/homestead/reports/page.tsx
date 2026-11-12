import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/dates'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import { getCachedUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { parseRange, getStartDate, DATE_RANGES, RANGE_LABELS } from '@/lib/date-range'
import { normalizeAnimalType } from '@/lib/homestead'
import { totalsByUnit } from '@/lib/units'
import { saleRevenue, homesteadRevenue } from '@/lib/revenue'
import type { LivestockLog, GardenEntry, PreservationLog, Project, ProjectExpense, ProjectTask, HomesteadInput } from '@/lib/types'
import PrintButton from '@/app/dashboard/PrintButton'
import PrintFrame from '@/app/dashboard/PrintFrame'


const METHOD_LABELS: Record<string, string> = {
  canning: 'Canning', freezing: 'Freezing', dehydrating: 'Dehydrating',
  fermenting: 'Fermenting', other: 'Other',
}

const STATUS_LABELS: Record<string, string> = {
  planned: 'Planned', planted: 'Planted', growing: 'Growing',
  harvested: 'Harvested', failed: 'Failed',
}

const STATUS_COLORS: Record<string, string> = {
  planned: 'text-muted bg-elevated/60',
  planted: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  growing: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  harvested: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
}

const PROJECT_STATUS_LABELS: Record<string, string> = {
  active: 'Active', up_next: 'Up Next', high_priority: 'High Priority',
  medium_priority: 'Medium Priority', low_priority: 'Low Priority', done: 'Done',
}

const PROJECT_STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  up_next: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  high_priority: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  medium_priority: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  low_priority: 'text-muted bg-elevated/60',
  done: 'text-subtle bg-elevated/40',
}

export default async function HomesteadReportsPage({
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyDateFilter(query: any, col: string) {
    return startDate ? query.gte(col, startDate) : query
  }

  const [
    livestock,
    garden,
    preservation,
    { data: projectsData },
    allInputs,
  ] = await Promise.all([
    // Paginated — these accumulate across a full year and feed YTD totals.
    fetchAllRows<LivestockLog>((f, t) => applyDateFilter(supabase.from('livestock_logs').select('*'), 'log_date').order('log_date', { ascending: false }).range(f, t)),
    fetchAllRows<GardenEntry>((f, t) => applyDateFilter(supabase.from('garden_entries').select('*'), 'created_at').order('actual_harvest', { ascending: false }).range(f, t)),
    fetchAllRows<PreservationLog>((f, t) => applyDateFilter(supabase.from('preservation_logs').select('*'), 'log_date').order('log_date', { ascending: false }).range(f, t)),
    supabase.from('projects').select('*').eq('category', 'homestead').order('created_at', { ascending: false }),
    fetchAllRows<HomesteadInput>((f, t) => applyDateFilter(supabase.from('homestead_inputs').select('*'), 'input_date').order('input_date', { ascending: false }).range(f, t)),
  ])

  const projects = (projectsData ?? []) as Project[]

  const projectIds = projects.map(p => p.id)
  const [{ data: expensesData }, { data: tasksData }] = projectIds.length > 0
    ? await Promise.all([
        supabase.from('project_expenses').select('*').in('project_id', projectIds).order('expense_date', { ascending: false }),
        supabase.from('project_tasks').select('*').in('project_id', projectIds),
      ])
    : [{ data: [] }, { data: [] }]

  const allExpenses = (expensesData ?? []) as ProjectExpense[]
  const allTasks = (tasksData ?? []) as ProjectTask[]

  const hasAnyData = livestock.length > 0 || garden.length > 0 || preservation.length > 0 || projects.length > 0 || allInputs.length > 0

  // ── Livestock ──────────────────────────────────────────────────────────
  // Scoped to livestock on purpose: this figure sits inside the Livestock card and is
  // compared against livestockInputCost. Whole-homestead income is `totalIncome` below.
  const totalSaleRevenue = saleRevenue(livestock)

  // Bucket by NORMALIZED unit so "Eggs"/"eggs" don't render as two half-right rows.
  const productionByUnit = totalsByUnit(livestock)

  // Group by a NORMALIZED animal key so "Chicken"/"chicken"/"Chickens" merge into one bucket.
  const logsByAnimalType: Record<string, { count: number; label: string }> = {}
  for (const log of livestock) {
    if (log.animal_type) {
      const { key, label } = normalizeAnimalType(log.animal_type)
      if (!logsByAnimalType[key]) logsByAnimalType[key] = { count: 0, label }
      logsByAnimalType[key].count++
    }
  }
  const animalTypeEntries = Object.entries(logsByAnimalType)
    .map(([key, v]) => [key, v.count, v.label] as [string, number, string])
    .sort((a, b) => b[1] - a[1])

  // ── Garden ────────────────────────────────────────────────────────────
  const statusCounts: Record<string, number> = {}
  for (const entry of garden) {
    statusCounts[entry.status] = (statusCounts[entry.status] ?? 0) + 1
  }
  const harvestedCount = statusCounts['harvested'] ?? 0
  const failedCount = statusCounts['failed'] ?? 0
  const successRate = (harvestedCount + failedCount) > 0
    ? Math.round((harvestedCount / (harvestedCount + failedCount)) * 100)
    : null
  const currentlyGrowing = garden.filter(g => g.status === 'planted' || g.status === 'growing')
  const harvestedEntries = garden.filter(g => g.status === 'harvested').sort((a, b) => {
    if (!a.actual_harvest && !b.actual_harvest) return 0
    if (!a.actual_harvest) return 1
    if (!b.actual_harvest) return -1
    return b.actual_harvest.localeCompare(a.actual_harvest)
  })

  // ── Food Preservation ─────────────────────────────────────────────────
  const batchesByMethod: Record<string, number> = {}
  for (const log of preservation) {
    batchesByMethod[log.method] = (batchesByMethod[log.method] ?? 0) + 1
  }
  const recentPreservation = preservation.slice(0, 5)

  // ── Input costs ───────────────────────────────────────────────────────
  const livestockInputs = allInputs.filter(i => i.section === 'livestock')
  const gardenInputs = allInputs.filter(i => i.section === 'garden')
  const preservationInputs = allInputs.filter(i => i.section === 'preservation')

  const livestockInputCost = livestockInputs.reduce((sum, i) => sum + i.cost, 0)
  const gardenInputCost = gardenInputs.reduce((sum, i) => sum + i.cost, 0)
  const preservationInputCost = preservationInputs.reduce((sum, i) => sum + i.cost, 0)
  const totalInputCost = livestockInputCost + gardenInputCost + preservationInputCost

  const inputsByCategory: Record<string, number> = {}
  for (const input of allInputs) {
    const key = `${input.section}::${input.category}`
    inputsByCategory[key] = (inputsByCategory[key] ?? 0) + input.cost
  }

  // ── Projects ──────────────────────────────────────────────────────────
  const totalBudget = projects.reduce((sum, p) => sum + (p.budget ?? 0), 0)
  const totalProjectSpend = allExpenses.reduce((sum, e) => sum + e.amount, 0)
  const budgetedProjects = projects.filter(p => p.budget != null)

  // ── Overall summary ───────────────────────────────────────────────────
  // Produce sales are revenue too. Before garden_entries had sale columns this was
  // livestock-only, so a family selling at a farmstand saw their income under-reported.
  const gardenSaleRevenue = saleRevenue(garden)
  const preservationSaleRevenue = saleRevenue(preservation)
  const totalIncome = homesteadRevenue({ livestock, garden, preservation })
  const totalExpenses = totalProjectSpend + totalInputCost
  const netPL = totalIncome - totalExpenses

  const rangeBase = range === 'ytd' ? '' : `?range=${range}`

  return (
    <div className="min-h-screen bg-surface text-content print:bg-white print:text-stone-900">
      <nav className="border-b border-line/60 px-6 py-4 flex items-center justify-between no-print">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/household" className="text-subtle hover:text-content text-sm transition-colors">← Household</Link>
          <span className="text-subtle">/</span>
          <span className="text-sm font-semibold">Reports</span>
        </div>
        <PrintButton />
      </nav>

      <PrintFrame>
      <main className="max-w-2xl lg:max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Print header */}
        <div className="hidden print:block mb-6 pb-4 border-b border-stone-300">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-stone-900">Cultivate — Homestead Report</h1>
              <p className="text-sm text-subtle">mycultivate.app</p>
            </div>
            <p className="text-xs text-subtle">Generated {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
          </div>
        </div>

        {/* Page header + date range filter */}
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold mb-1">Homestead Reports</h2>
              <p className="text-muted text-sm">Year-to-date summary across all homestead modules.</p>
            </div>
            <Link
              href="/dashboard/homestead/intelligence"
              className="shrink-0 flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 transition-colors no-print"
            >
              <span>📊</span>
              <span>Business Intelligence</span>
              <span>→</span>
            </Link>
          </div>
          <div className="flex gap-2 flex-wrap no-print">
            {DATE_RANGES.map(r => (
              <Link
                key={r}
                href={r === 'ytd' ? '/dashboard/homestead/reports' : `/dashboard/homestead/reports?range=${r}`}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  range === r ? 'bg-elevated text-content' : 'text-subtle hover:text-content'
                }`}
              >
                {RANGE_LABELS[r]}
              </Link>
            ))}
          </div>
        </div>

        {!hasAnyData ? (
          <div className="text-center py-20">
            <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-3xl mx-auto mb-4">📊</div>
            <div className="text-content font-semibold mb-1">No data yet</div>
            <p className="text-subtle text-sm max-w-xs mx-auto">Start logging to see your homestead summary.</p>
          </div>
        ) : (
          <>
            {/* ── Overall Financial Summary ── */}
            {(totalIncome > 0 || totalExpenses > 0) && (
              <div className="bg-card border border-line rounded-xl p-5 space-y-4">
                <p className="text-xs font-semibold text-subtle uppercase tracking-widest">Overall Summary</p>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-subtle mb-1">Income</p>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">${totalIncome.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-subtle mb-1">Expenses</p>
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">${totalExpenses.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-subtle mb-1">Net P&L</p>
                    <p className={`text-2xl font-bold ${netPL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {netPL >= 0 ? '+' : ''}${netPL.toFixed(2)}
                    </p>
                  </div>
                </div>
                {totalExpenses > 0 && (
                  <div className="grid grid-cols-3 gap-4 pt-3 border-t border-line text-xs text-subtle">
                    <div>livestock sales</div>
                    <div>inputs + project costs</div>
                    <div className={netPL >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {netPL >= 0 ? 'profit' : 'loss'} to date
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Livestock ── */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-subtle uppercase tracking-widest">Livestock</h3>
                {livestock.length > 0 && (
                  <Link href="/dashboard/homestead/livestock" className="text-xs text-subtle hover:text-amber-600 dark:hover:text-amber-400 transition-colors no-print">
                    Go to Livestock →
                  </Link>
                )}
              </div>

              {livestock.length === 0 ? (
                <p className="text-subtle text-sm">No livestock logs{range !== 'all' ? ` in this period` : ''} yet.</p>
              ) : (
                <>
                  {/* Key metrics */}
                  <div className="bg-card border border-line rounded-xl p-5">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-subtle mb-1">Total Logs</p>
                        <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{livestock.length}</p>
                      </div>
                      {productionByUnit.map(({ key, label, total }) => (
                        <div key={key}>
                          <p className="text-xs text-subtle mb-1">{label.charAt(0).toUpperCase() + label.slice(1)}</p>
                          <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{total.toLocaleString()}</p>
                        </div>
                      ))}
                      {totalSaleRevenue > 0 && (
                        <div>
                          <p className="text-xs text-subtle mb-1">Sales Revenue</p>
                          <p className="text-xl font-bold text-green-600 dark:text-green-400">${totalSaleRevenue.toFixed(2)}</p>
                        </div>
                      )}
                      {livestockInputCost > 0 && (
                        <div>
                          <p className="text-xs text-subtle mb-1">Input Costs</p>
                          <p className="text-xl font-bold text-red-600 dark:text-red-400">${livestockInputCost.toFixed(2)}</p>
                        </div>
                      )}
                    </div>
                    {totalSaleRevenue > 0 && livestockInputCost > 0 && (
                      <div className={`mt-4 pt-3 border-t border-line flex items-center justify-between`}>
                        <span className="text-sm text-muted">Net (livestock)</span>
                        <span className={`text-sm font-bold ${totalSaleRevenue - livestockInputCost >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {totalSaleRevenue - livestockInputCost >= 0 ? '+' : ''}${(totalSaleRevenue - livestockInputCost).toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Logs by animal type */}
                  {animalTypeEntries.length > 0 && (
                    <div className="bg-card border border-line rounded-xl p-5 space-y-3">
                      <p className="text-xs font-semibold text-subtle uppercase tracking-widest">By Animal Type</p>
                      <div className="divide-y divide-line">
                        {animalTypeEntries.map(([key, count, label]) => (
                          <div key={key} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                            <Link
                              href={`/dashboard/homestead/reports/livestock/${encodeURIComponent(key)}${rangeBase ? `?range=${range}` : ''}`}
                              className="text-sm text-content hover:text-amber-600 dark:hover:text-amber-400 transition-colors flex items-center gap-1"
                            >
                              {label} <span className="text-subtle hover:text-amber-600">→</span>
                            </Link>
                            <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">{count} log{count !== 1 ? 's' : ''}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Livestock input cost breakdown */}
                  {Object.entries(inputsByCategory).filter(([k]) => k.startsWith('livestock::')).length > 0 && (
                    <div className="bg-card border border-line rounded-xl p-5 space-y-3">
                      <p className="text-xs font-semibold text-subtle uppercase tracking-widest">Input Cost Breakdown</p>
                      <div className="divide-y divide-line">
                        {Object.entries(inputsByCategory)
                          .filter(([k]) => k.startsWith('livestock::'))
                          .sort((a, b) => b[1] - a[1])
                          .map(([key, cost]) => {
                            const cat = key.split('::')[1]
                            return (
                              <div key={key} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                                <Link
                                  href={`/dashboard/homestead/reports/livestock/${encodeURIComponent(cat)}${rangeBase ? `?range=${range}` : ''}`}
                                  className="text-sm text-content capitalize hover:text-content transition-colors flex items-center gap-1"
                                >
                                  {cat} <span className="text-subtle hover:text-muted">→</span>
                                </Link>
                                <span className="text-sm font-semibold text-red-600 dark:text-red-400">${cost.toFixed(2)}</span>
                              </div>
                            )
                          })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>

            {/* ── Garden ── */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-subtle uppercase tracking-widest">Garden</h3>
                {garden.length > 0 && (
                  <Link href={`/dashboard/homestead/garden`} className="text-xs text-subtle hover:text-green-600 dark:hover:text-green-400 transition-colors no-print">
                    Go to Garden →
                  </Link>
                )}
              </div>

              {garden.length === 0 ? (
                <p className="text-subtle text-sm">No garden entries{range !== 'all' ? ` in this period` : ''} yet.</p>
              ) : (
                <>
                  {/* Status + success */}
                  <div className="bg-card border border-line rounded-xl p-5 space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      {(['planned', 'planted', 'growing', 'harvested', 'failed'] as const).map(status => {
                        const count = statusCounts[status] ?? 0
                        if (count === 0) return null
                        const colorMap: Record<string, string> = {
                          planned: 'text-content', planted: 'text-sky-600 dark:text-sky-400',
                          growing: 'text-green-600 dark:text-green-400', harvested: 'text-amber-600 dark:text-amber-400', failed: 'text-red-600 dark:text-red-400',
                        }
                        return (
                          <div key={status}>
                            <p className="text-xs text-subtle mb-1">{STATUS_LABELS[status]}</p>
                            <p className={`text-xl font-bold ${colorMap[status]}`}>{count}</p>
                          </div>
                        )
                      })}
                    </div>
                    {successRate !== null && (
                      <div className="pt-3 border-t border-line">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-subtle">Success Rate</span>
                          <span className="text-sm font-bold text-green-600 dark:text-green-400">{successRate}%</span>
                        </div>
                        <div className="w-full bg-elevated rounded-full h-1.5">
                          <div className="bg-green-600 h-1.5 rounded-full" style={{ width: `${successRate}%` }} />
                        </div>
                        <p className="text-xs text-subtle mt-1">{harvestedCount} harvested · {failedCount} failed</p>
                      </div>
                    )}
                    {(gardenSaleRevenue > 0 || gardenInputCost > 0) && (
                      <div className="pt-3 border-t border-line">
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <p className="text-xs text-subtle mb-1">Produce sales</p>
                            <p className="text-lg font-bold text-green-600 dark:text-green-400">${gardenSaleRevenue.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-subtle mb-1">Garden costs</p>
                            <p className="text-lg font-bold text-red-600 dark:text-red-400">${gardenInputCost.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-subtle mb-1">Net</p>
                            {/* Revenue with no logged cost is "unknown", not "pure profit" —
                                same honesty rule as the livestock per-animal badge. */}
                            {gardenInputCost > 0 ? (
                              <p className={`text-lg font-bold ${gardenSaleRevenue - gardenInputCost >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {gardenSaleRevenue - gardenInputCost >= 0 ? '+' : ''}${(gardenSaleRevenue - gardenInputCost).toFixed(2)}
                              </p>
                            ) : (
                              <p className="text-sm font-medium text-subtle pt-1">Costs not logged</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Currently growing */}
                  {currentlyGrowing.length > 0 && (
                    <div className="bg-card border border-line rounded-xl p-5 space-y-3">
                      <p className="text-xs font-semibold text-subtle uppercase tracking-widest">
                        Currently Growing <span className="text-green-600 dark:text-green-400 normal-case font-medium">({currentlyGrowing.length})</span>
                      </p>
                      <div className="divide-y divide-line">
                        {currentlyGrowing.map(entry => (
                          <div key={entry.id} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                            <div>
                              <span className="text-sm text-content">{entry.crop_name}</span>
                              {entry.variety && <span className="text-xs text-subtle ml-1.5">({entry.variety})</span>}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {entry.date_planted && (
                                <span className="text-xs text-subtle">planted {formatDate(entry.date_planted)}</span>
                              )}
                              <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[entry.status] ?? ''}`}>
                                {STATUS_LABELS[entry.status] ?? entry.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Harvested crops */}
                  {harvestedEntries.length > 0 && (
                    <div className="bg-card border border-line rounded-xl p-5 space-y-3">
                      <p className="text-xs font-semibold text-subtle uppercase tracking-widest">Harvested Crops</p>
                      <div className="divide-y divide-line">
                        {harvestedEntries.map(entry => (
                          <div key={entry.id} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                            <div>
                              <span className="text-sm text-content">{entry.crop_name}</span>
                              {entry.variety && <span className="text-xs text-subtle ml-1.5">({entry.variety})</span>}
                            </div>
                            {entry.actual_harvest && (
                              <span className="text-xs text-amber-600 dark:text-amber-400 shrink-0 ml-3">{formatDate(entry.actual_harvest)}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Garden input costs */}
                  {Object.entries(inputsByCategory).filter(([k]) => k.startsWith('garden::')).length > 0 && (
                    <div className="bg-card border border-line rounded-xl p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-subtle uppercase tracking-widest">Input Costs</p>
                        <span className="text-sm font-bold text-red-600 dark:text-red-400">${gardenInputCost.toFixed(2)}</span>
                      </div>
                      <div className="divide-y divide-line">
                        {Object.entries(inputsByCategory)
                          .filter(([k]) => k.startsWith('garden::'))
                          .sort((a, b) => b[1] - a[1])
                          .map(([key, cost]) => {
                            const cat = key.split('::')[1]
                            return (
                              <div key={key} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                                <Link
                                  href={`/dashboard/homestead/reports/garden/${encodeURIComponent(cat)}${rangeBase ? `?range=${range}` : ''}`}
                                  className="text-sm text-content capitalize hover:text-content transition-colors flex items-center gap-1"
                                >
                                  {cat} <span className="text-subtle hover:text-muted">→</span>
                                </Link>
                                <span className="text-sm font-semibold text-red-600 dark:text-red-400">${cost.toFixed(2)}</span>
                              </div>
                            )
                          })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>

            {/* ── Food Preservation ── */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-subtle uppercase tracking-widest">Food Preservation</h3>
                {preservation.length > 0 && (
                  <Link href={`/dashboard/homestead/preservation`} className="text-xs text-subtle hover:text-sky-600 dark:hover:text-sky-400 transition-colors no-print">
                    Go to Preservation →
                  </Link>
                )}
              </div>

              {preservation.length === 0 ? (
                <p className="text-subtle text-sm">No preservation logs{range !== 'all' ? ` in this period` : ''} yet.</p>
              ) : (
                <>
                  {/* Batch totals */}
                  <div className="bg-card border border-line rounded-xl p-5">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-subtle mb-1">Total Batches</p>
                        <p className="text-xl font-bold text-sky-600 dark:text-sky-400">{preservation.length}</p>
                      </div>
                      {Object.entries(batchesByMethod).map(([method, count]) => (
                        <div key={method}>
                          <p className="text-xs text-subtle mb-1">{METHOD_LABELS[method] ?? method}</p>
                          <p className="text-xl font-bold text-sky-600 dark:text-sky-400">{count}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recent preservation */}
                  {recentPreservation.length > 0 && (
                    <div className="bg-card border border-line rounded-xl p-5 space-y-3">
                      <p className="text-xs font-semibold text-subtle uppercase tracking-widest">Most Recent</p>
                      <div className="divide-y divide-line">
                        {recentPreservation.map(entry => (
                          <div key={entry.id} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                            <div>
                              <span className="text-sm text-content">{entry.item_name}</span>
                              <span className="text-xs text-subtle ml-1.5">
                                {entry.quantity != null ? `${entry.quantity}${entry.unit ? ' ' + entry.unit : ''} · ` : ''}
                                {METHOD_LABELS[entry.method] ?? entry.method}
                              </span>
                            </div>
                            <span className="text-xs text-sky-600 dark:text-sky-400 shrink-0 ml-3">{formatDate(entry.log_date)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Preservation input costs */}
                  {Object.entries(inputsByCategory).filter(([k]) => k.startsWith('preservation::')).length > 0 && (
                    <div className="bg-card border border-line rounded-xl p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-subtle uppercase tracking-widest">Input Costs</p>
                        <span className="text-sm font-bold text-red-600 dark:text-red-400">${preservationInputCost.toFixed(2)}</span>
                      </div>
                      <div className="divide-y divide-line">
                        {Object.entries(inputsByCategory)
                          .filter(([k]) => k.startsWith('preservation::'))
                          .sort((a, b) => b[1] - a[1])
                          .map(([key, cost]) => {
                            const cat = key.split('::')[1]
                            return (
                              <div key={key} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                                <Link
                                  href={`/dashboard/homestead/reports/preservation/${encodeURIComponent(cat)}${rangeBase ? `?range=${range}` : ''}`}
                                  className="text-sm text-content capitalize hover:text-content transition-colors flex items-center gap-1"
                                >
                                  {cat} <span className="text-subtle hover:text-muted">→</span>
                                </Link>
                                <span className="text-sm font-semibold text-red-600 dark:text-red-400">${cost.toFixed(2)}</span>
                              </div>
                            )
                          })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>

            {/* ── Projects & Finances ── */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-subtle uppercase tracking-widest">Projects & Finances</h3>
                {projects.length > 0 && (
                  <Link href="/dashboard/projects/reports?category=homestead" className="text-xs text-subtle hover:text-amber-600 dark:hover:text-amber-400 transition-colors no-print">
                    All Homestead Projects →
                  </Link>
                )}
              </div>

              {projects.length === 0 ? (
                <p className="text-subtle text-sm">No homestead projects yet.</p>
              ) : (
                <>
                  {/* Financial overview */}
                  <div className="bg-card border border-line rounded-xl p-5 space-y-4">
                    <p className="text-xs font-semibold text-subtle uppercase tracking-widest">Financial Overview</p>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <p className="text-xs text-subtle mb-1">Income</p>
                        <p className="text-xl font-bold text-green-600 dark:text-green-400">${totalIncome.toFixed(2)}</p>
                        <p className="text-xs text-subtle mt-0.5">
                          {/* Name only the sources that actually earned something. */}
                          {[
                            totalSaleRevenue > 0 && 'livestock',
                            gardenSaleRevenue > 0 && 'produce',
                            preservationSaleRevenue > 0 && 'preserved goods',
                          ].filter(Boolean).join(' + ') || 'sales'} sales
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-subtle mb-1">Expenses</p>
                        <p className="text-xl font-bold text-red-600 dark:text-red-400">${(totalProjectSpend + totalInputCost).toFixed(2)}</p>
                        <p className="text-xs text-subtle mt-0.5">costs + inputs</p>
                      </div>
                      <div>
                        <p className="text-xs text-subtle mb-1">Net</p>
                        <p className={`text-xl font-bold ${netPL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {netPL >= 0 ? '+' : ''}${netPL.toFixed(2)}
                        </p>
                      </div>
                    </div>
                    {budgetedProjects.length > 0 && (
                      <div className="pt-3 border-t border-line">
                        <div className="flex justify-between text-xs text-subtle mb-2">
                          <span>Budget across {budgetedProjects.length} project{budgetedProjects.length !== 1 ? 's' : ''}</span>
                          <span className={(totalBudget - totalProjectSpend) < 0 ? 'text-red-600 dark:text-red-400' : 'text-muted'}>
                            {(totalBudget - totalProjectSpend) < 0
                              ? `$${Math.abs(totalBudget - totalProjectSpend).toFixed(2)} over`
                              : `$${(totalBudget - totalProjectSpend).toFixed(2)} remaining`}
                          </span>
                        </div>
                        <div className="w-full bg-elevated rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full ${(totalBudget - totalProjectSpend) < 0 ? 'bg-red-500' : 'bg-amber-500'}`}
                            style={{ width: `${Math.min((totalProjectSpend / totalBudget) * 100, 100)}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-subtle mt-1">
                          <span>${totalProjectSpend.toFixed(2)} spent</span>
                          <span>${totalBudget.toFixed(2)} budgeted</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Per-project list */}
                  <div className="space-y-3">
                    {projects.map(project => {
                      const projectExpenses = allExpenses.filter(e => e.project_id === project.id)
                      const projectTasks = allTasks.filter(t => t.project_id === project.id)
                      const spent = projectExpenses.reduce((sum, e) => sum + e.amount, 0)
                      const remaining = project.budget != null ? project.budget - spent : null
                      const completedTasks = projectTasks.filter(t => t.is_complete).length

                      return (
                        <Link key={project.id} href={`/dashboard/projects/reports/${project.id}`} className="block group">
                          <div className="bg-card border border-line group-hover:border-line-strong rounded-xl p-4 transition-colors">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex-1 min-w-0">
                                <span className="font-semibold text-sm text-content group-hover:text-content">{project.title}</span>
                                {project.description && (
                                  <p className="text-xs text-subtle mt-0.5">{project.description}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`text-xs px-2 py-0.5 rounded-full ${PROJECT_STATUS_COLORS[project.status] ?? 'text-muted bg-elevated'}`}>
                                  {PROJECT_STATUS_LABELS[project.status] ?? project.status}
                                </span>
                                <span className="text-xs text-subtle group-hover:text-muted transition-colors">→</span>
                              </div>
                            </div>

                            {project.budget != null && (
                              <div>
                                <div className="flex justify-between text-xs mb-1">
                                  <span className="text-subtle">Budget</span>
                                  <span className={remaining != null && remaining < 0 ? 'text-red-600 dark:text-red-400' : 'text-muted'}>
                                    ${spent.toFixed(2)} / ${project.budget.toFixed(2)}
                                  </span>
                                </div>
                                <div className="w-full bg-elevated rounded-full h-1">
                                  <div
                                    className={`h-1 rounded-full ${remaining != null && remaining < 0 ? 'bg-red-500' : 'bg-amber-500'}`}
                                    style={{ width: `${Math.min((spent / project.budget) * 100, 100)}%` }}
                                  />
                                </div>
                              </div>
                            )}

                            {projectTasks.length > 0 && (
                              <div className="text-xs text-subtle mt-2">
                                Tasks: <span className="text-content font-medium">{completedTasks}/{projectTasks.length} complete</span>
                              </div>
                            )}
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                </>
              )}
            </section>
          </>
        )}
      </main>
      </PrintFrame>
    </div>
  )
}
