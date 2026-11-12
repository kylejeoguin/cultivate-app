import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { parseRange, getStartDate, DATE_RANGES, RANGE_LABELS } from '@/lib/date-range'
import { isSold, homesteadRevenue } from '@/lib/revenue'
import type { Project, ProjectExpense, ProjectIncome, ProjectCategory } from '@/lib/types'
import PrintButton from '@/app/dashboard/PrintButton'
import PrintFrame from '@/app/dashboard/PrintFrame'

type CategoryFilter = 'all' | ProjectCategory

const STATUS_LABELS: Record<string, string> = { active: 'Active', up_next: 'Up Next', done: 'Done' }
const CAT_LABELS: Record<string, string> = { homestead: 'Homestead', home_diy: 'Home & DIY' }
const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
  up_next: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  done: 'bg-elevated text-subtle',
}
const STATUS_ORDER: Record<string, number> = { active: 0, up_next: 1, done: 2 }

function fmtMoney(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function fmtDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

type LivestockRow = {
  project_id: string | null
  quantity: number | null
  unit: string | null
  sale_amount: number | null
  sale_qty: number | null
  disposition: string | null
  animal_type: string
  animal_name: string | null
}

type GardenRow = {
  project_id: string | null
  crop_name: string
  variety: string | null
  status: string
  sale_amount: number | null
  disposition: string | null
}

type TaskRow = {
  project_id: string
  is_complete: boolean
}

export default async function ProjectReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; range?: string }>
}) {
  const supabase = await createClient()
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const filter: CategoryFilter =
    params.category === 'homestead' || params.category === 'home_diy'
      ? params.category
      : 'all'
  const range = parseRange(params.range)
  const startDate = getStartDate(range)

  const expenseQuery = startDate
    ? supabase.from('project_expenses').select('*').gte('expense_date', startDate).order('expense_date', { ascending: false })
    : supabase.from('project_expenses').select('*').order('expense_date', { ascending: false })

  const incomeQuery = startDate
    ? supabase.from('project_income').select('*').gte('income_date', startDate).order('income_date', { ascending: false })
    : supabase.from('project_income').select('*').order('income_date', { ascending: false })

  const [
    { data: projectData },
    { data: expenseData },
    { data: incomeData },
    { data: taskData },
    { data: livestockData },
    { data: gardenData },
    { data: preservationData },
    { data: homesteadInputData },
  ] = await Promise.all([
    supabase.from('projects').select('*').order('created_at', { ascending: false }),
    expenseQuery,
    incomeQuery,
    supabase.from('project_tasks').select('project_id, is_complete'),
    supabase
      .from('livestock_logs')
      .select('project_id, quantity, unit, sale_amount, sale_qty, disposition, animal_type, animal_name')
      .not('project_id', 'is', null),
    supabase
      .from('garden_entries')
      .select('project_id, crop_name, variety, status, sale_amount, disposition')
      .not('project_id', 'is', null),
    // Homestead-sourced money tagged to a project. Shown in full (not range-filtered), matching
    // how livestock/garden sales already behave in this rollup — the range applies to the
    // project-native ledgers (expenses/income) only.
    supabase
      .from('preservation_logs')
      .select('project_id, sale_amount, disposition')
      .not('project_id', 'is', null),
    supabase
      .from('homestead_inputs')
      .select('project_id, cost')
      .not('project_id', 'is', null),
  ])

  const projects = (projectData ?? []) as Project[]
  const expenses = (expenseData ?? []) as ProjectExpense[]
  const income = (incomeData ?? []) as ProjectIncome[]
  const tasks = (taskData ?? []) as TaskRow[]
  const livestock = (livestockData ?? []) as LivestockRow[]
  const garden = (gardenData ?? []) as GardenRow[]
  const preservation = (preservationData ?? []) as { project_id: string | null; sale_amount: number | null; disposition: string | null }[]
  const homesteadInputs = (homesteadInputData ?? []) as { project_id: string | null; cost: number }[]

  const allFiltered = filter === 'all'
    ? projects
    : projects.filter(p => p.category === filter)

  const sorted = [...allFiltered].sort(
    (a, b) => (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99)
  )

  function getStats(projectId: string) {
    const projExpenses = expenses.filter(e => e.project_id === projectId)
    const projIncome = income.filter(i => i.project_id === projectId)
    const projTasks = tasks.filter(t => t.project_id === projectId)
    const projLivestock = livestock.filter(l => l.project_id === projectId)
    const projGarden = garden.filter(g => g.project_id === projectId)
    const projPreservation = preservation.filter(p => p.project_id === projectId)
    const projHomesteadInputs = homesteadInputs.filter(i => i.project_id === projectId)

    // Spend = project expenses + homestead costs (feed, jars, supplies) tagged to this project.
    const homesteadInputCost = projHomesteadInputs.reduce((sum, i) => sum + i.cost, 0)
    const totalSpent = projExpenses.reduce((sum, e) => sum + e.amount, 0) + homesteadInputCost
    const directIncome = projIncome.reduce((sum, i) => sum + i.amount, 0)
    const soldEntries = projLivestock.filter(isSold)
    // A project's revenue includes produce + preserved goods it sold, not just animals — plus
    // direct income the homestead tables can't represent (a Home & DIY sale, the build, misc).
    const totalRevenue = homesteadRevenue({ livestock: projLivestock, garden: projGarden, preservation: projPreservation }) + directIncome
    const completedTasks = projTasks.filter(t => t.is_complete).length

    return {
      projExpenses,
      projIncome,
      projTasks,
      projLivestock,
      projGarden,
      soldEntries,
      totalSpent,
      directIncome,
      totalRevenue,
      net: totalRevenue - totalSpent,
      completedTasks,
      totalTasks: projTasks.length,
    }
  }

  const overallSpent = sorted.reduce((s, p) => s + getStats(p.id).totalSpent, 0)
  const overallRevenue = sorted.reduce((s, p) => s + getStats(p.id).totalRevenue, 0)
  const overallNet = overallRevenue - overallSpent

  // Category rollups
  const categories = (['homestead', 'home_diy'] as const).map(cat => {
    const catProjects = projects.filter(p => p.category === cat)
    const spent = catProjects.reduce((s, p) => s + getStats(p.id).totalSpent, 0)
    const revenue = catProjects.reduce((s, p) => s + getStats(p.id).totalRevenue, 0)
    const active = catProjects.filter(p => p.status === 'active').length
    const done = catProjects.filter(p => p.status === 'done').length
    const totalTasks = catProjects.reduce((s, p) => s + getStats(p.id).totalTasks, 0)
    const completedTasks = catProjects.reduce((s, p) => s + getStats(p.id).completedTasks, 0)
    return { cat, label: CAT_LABELS[cat], count: catProjects.length, spent, revenue, net: revenue - spent, active, done, totalTasks, completedTasks }
  }).filter(c => c.count > 0)

  return (
    <div className="min-h-screen bg-surface text-content print:bg-white print:text-stone-900">
      <nav className="border-b border-line/60 px-6 py-4 flex items-center justify-between no-print">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/projects" className="text-subtle hover:text-content text-sm transition-colors">
            ← Projects
          </Link>
          <span className="text-subtle">/</span>
          <span className="text-sm font-semibold text-content">Reports</span>
        </div>
        <PrintButton />
      </nav>

      <PrintFrame>
      <main className="max-w-2xl mx-auto px-6 py-8">
        <div className="hidden print:block mb-6 pb-4 border-b border-stone-300">
          <h1 className="text-xl font-bold text-stone-900">Cultivate</h1>
          <p className="text-sm text-subtle">mycultivate.app</p>
        </div>
        <div className="mb-6 space-y-4">
          <div>
            <h2 className="text-xl font-bold mb-1 tracking-tight">Project Reports</h2>
            <p className="text-muted text-sm">Financial summary across all tracked projects.</p>
          </div>
          <div className="flex gap-2 flex-wrap no-print">
            {DATE_RANGES.map(r => {
              const catParam = filter !== 'all' ? `&category=${filter}` : ''
              const href = r === 'ytd'
                ? `/dashboard/projects/reports${filter !== 'all' ? `?category=${filter}` : ''}`
                : `/dashboard/projects/reports?range=${r}${catParam}`
              return (
                <Link
                  key={r}
                  href={href}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    range === r ? 'bg-elevated text-content' : 'text-subtle hover:text-muted'
                  }`}
                >
                  {RANGE_LABELS[r]}
                </Link>
              )
            })}
          </div>
        </div>

        {/* Overview strip */}
        {projects.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <div className="bg-card/60 border border-line/60 rounded-xl px-4 py-3 text-center">
              <div className="text-lg font-bold text-content">{sorted.length}</div>
              <div className="text-xs text-subtle mt-0.5">projects</div>
            </div>
            <div className="bg-card/60 border border-line/60 rounded-xl px-4 py-3 text-center">
              <div className="text-lg font-bold text-red-600 dark:text-red-400">{fmtMoney(overallSpent)}</div>
              <div className="text-xs text-subtle mt-0.5">total spent</div>
            </div>
            <div className="bg-card/60 border border-line/60 rounded-xl px-4 py-3 text-center">
              <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{fmtMoney(overallRevenue)}</div>
              <div className="text-xs text-subtle mt-0.5">revenue</div>
            </div>
            <div className="bg-card/60 border border-line/60 rounded-xl px-4 py-3 text-center">
              <div className={`text-lg font-bold ${overallNet >= 0 ? 'text-green-600 dark:text-green-400' : 'text-content'}`}>
                {overallNet >= 0 ? '+' : '-'}{fmtMoney(Math.abs(overallNet))}
              </div>
              <div className="text-xs text-subtle mt-0.5">
                {overallNet >= 0 ? 'net profit' : 'net cost'}
              </div>
            </div>
          </div>
        )}

        {/* Category rollup — shown on All view */}
        {filter === 'all' && categories.length > 1 && (
          <div className="mb-8 space-y-3">
            <p className="text-xs font-semibold text-subtle uppercase tracking-widest">By category</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {categories.map(c => (
                <Link
                  key={c.cat}
                  href={`/dashboard/projects/reports?category=${c.cat}${range !== 'ytd' ? `&range=${range}` : ''}`}
                  className="bg-card/60 border border-line hover:border-line-strong rounded-xl p-4 transition-colors group"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-content">{c.label}</span>
                    <span className="text-xs text-subtle group-hover:text-muted transition-colors">
                      {c.count} project{c.count !== 1 ? 's' : ''} →
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <div className="text-sm font-bold text-red-600 dark:text-red-400">{fmtMoney(c.spent)}</div>
                      <div className="text-xs text-subtle mt-0.5">spent</div>
                    </div>
                    <div>
                      <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{fmtMoney(c.revenue)}</div>
                      <div className="text-xs text-subtle mt-0.5">revenue</div>
                    </div>
                    <div>
                      <div className={`text-sm font-bold ${c.net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-content'}`}>
                        {c.net >= 0 ? '+' : '-'}{fmtMoney(Math.abs(c.net))}
                      </div>
                      <div className="text-xs text-subtle mt-0.5">net</div>
                    </div>
                  </div>
                  {c.totalTasks > 0 && (
                    <div className="mt-3">
                      <div className="h-1 bg-elevated rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-700 rounded-full"
                          style={{ width: `${Math.round((c.completedTasks / c.totalTasks) * 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-subtle mt-1">{c.completedTasks}/{c.totalTasks} tasks · {c.active} active · {c.done} done</p>
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Category header when filtered */}
        {filter !== 'all' && (
          <div className="mb-6 bg-card/60 border border-line rounded-xl p-4">
            {categories.filter(c => c.cat === filter).map(c => (
              <div key={c.cat}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-content">{c.label} — Overview</h3>
                  <span className="text-xs text-subtle">{c.count} project{c.count !== 1 ? 's' : ''}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div>
                    <div className="text-lg font-bold text-red-600 dark:text-red-400">{fmtMoney(c.spent)}</div>
                    <div className="text-xs text-subtle mt-0.5">total spent</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{fmtMoney(c.revenue)}</div>
                    <div className="text-xs text-subtle mt-0.5">revenue</div>
                  </div>
                  <div>
                    <div className={`text-lg font-bold ${c.net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-content'}`}>
                      {c.net >= 0 ? '+' : '-'}{fmtMoney(Math.abs(c.net))}
                    </div>
                    <div className="text-xs text-subtle mt-0.5">net</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-content">{c.active}</div>
                    <div className="text-xs text-subtle mt-0.5">active</div>
                  </div>
                </div>
                {c.totalTasks > 0 && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-subtle">Task completion</span>
                      <span className="text-muted">{c.completedTasks}/{c.totalTasks}</span>
                    </div>
                    <div className="h-1.5 bg-elevated rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-600 rounded-full"
                        style={{ width: `${Math.round((c.completedTasks / c.totalTasks) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Category filter */}
        <div className="flex gap-2 mb-8">
          {(['all', 'homestead', 'home_diy'] as const).map(cat => {
            const rangeParam = range !== 'ytd' ? `&range=${range}` : ''
            const href = cat === 'all'
              ? `/dashboard/projects/reports${range !== 'ytd' ? `?range=${range}` : ''}`
              : `/dashboard/projects/reports?category=${cat}${rangeParam}`
            return (
              <Link
                key={cat}
                href={href}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filter === cat ? 'bg-elevated text-content' : 'text-subtle hover:text-muted'
                }`}
              >
                {cat === 'all' ? 'All' : CAT_LABELS[cat]}
              </Link>
            )
          })}
        </div>

        {/* Empty */}
        {sorted.length === 0 && (
          <div className="text-center py-16">
            <p className="text-subtle text-sm">No projects to report on yet.</p>
            <Link href="/dashboard/projects" className="text-subtle hover:text-muted text-sm mt-2 inline-block transition-colors">
              ← Add a project
            </Link>
          </div>
        )}

        {/* Per-project cards */}
        <div className="space-y-5">
          {sorted.map(project => {
            const {
              projExpenses, projTasks, projLivestock, projGarden,
              soldEntries, totalSpent, totalRevenue, net,
              completedTasks, totalTasks,
            } = getStats(project.id)

            const budget = project.budget
            const remaining = budget != null ? budget - totalSpent : null
            const overBudget = remaining != null && remaining < 0
            const hasFinancials = totalSpent > 0 || totalRevenue > 0 || budget != null
            const hasAnyData = hasFinancials || totalTasks > 0 || projLivestock.length > 0 || projGarden.length > 0

            // Group livestock by animal name/type for summary
            const livestockGroups = projLivestock.reduce((acc, l) => {
              const key = l.animal_name ?? l.animal_type
              if (!acc[key]) acc[key] = { count: 0, totalQty: 0, unit: l.unit, revenue: 0 }
              acc[key].count++
              acc[key].totalQty += l.quantity ?? 0
              acc[key].revenue += l.sale_amount ?? 0
              return acc
            }, {} as Record<string, { count: number; totalQty: number; unit: string | null; revenue: number }>)

            return (
              <Link key={project.id} href={`/dashboard/projects/reports/${project.id}`} className="block group">
              <div className="bg-card/60 border border-line group-hover:border-line-strong rounded-xl overflow-hidden transition-colors print-flow">

                {/* Header */}
                <div className="px-5 py-4 print-keep">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-content text-sm">{project.title}</h3>
                        <span className="text-xs text-subtle group-hover:text-muted transition-colors ml-auto shrink-0">View →</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${STATUS_COLORS[project.status]}`}>
                          {STATUS_LABELS[project.status]}
                        </span>
                        <span className="text-xs text-subtle">{CAT_LABELS[project.category]}</span>
                      </div>
                      {project.description && (
                        <p className="text-xs text-subtle mt-0.5">{project.description}</p>
                      )}
                      {project.target && (
                        <p className="text-xs text-subtle mt-0.5">🎯 {project.target}</p>
                      )}
                    </div>
                  </div>

                  {/* Task progress bar */}
                  {totalTasks > 0 && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-subtle">Tasks</span>
                        <span className="text-muted">{completedTasks}/{totalTasks} complete</span>
                      </div>
                      <div className="h-1.5 bg-elevated rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-600 rounded-full"
                          style={{ width: `${Math.round((completedTasks / totalTasks) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Financial summary row */}
                {hasFinancials && (
                  <div className="border-t border-line/60 px-5 py-3 bg-surface/30 print-keep">
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <div className="text-xs text-subtle mb-0.5">Spent</div>
                        <div className="text-sm font-semibold text-content">{fmtMoney(totalSpent)}</div>
                        {budget != null && (
                          <div className={`text-xs mt-0.5 ${overBudget ? 'text-red-600 dark:text-red-400' : 'text-subtle'}`}>
                            of {fmtMoney(budget)}{overBudget ? ' — over' : ' budget'}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="text-xs text-subtle mb-0.5">Revenue</div>
                        <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{fmtMoney(totalRevenue)}</div>
                        {soldEntries.length > 0 && (
                          <div className="text-xs text-subtle mt-0.5">
                            {soldEntries.length} sale{soldEntries.length !== 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="text-xs text-subtle mb-0.5">{net >= 0 ? 'Net profit' : 'Net cost'}</div>
                        <div className={`text-sm font-semibold ${net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-content'}`}>
                          {net >= 0 ? '+' : '-'}{fmtMoney(Math.abs(net))}
                        </div>
                        {budget != null && remaining != null && (
                          <div className={`text-xs mt-0.5 ${overBudget ? 'text-red-600 dark:text-red-400' : 'text-subtle'}`}>
                            {overBudget ? `${fmtMoney(Math.abs(remaining))} over` : `${fmtMoney(remaining)} left`}
                          </div>
                        )}
                      </div>
                    </div>
                    {budget != null && totalSpent > 0 && (
                      <div className="mt-3 h-1.5 bg-elevated rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${overBudget ? 'bg-red-500' : 'bg-green-600'}`}
                          style={{ width: `${Math.min((totalSpent / budget) * 100, 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Expenses */}
                {projExpenses.length > 0 && (
                  <div className="border-t border-line/40 px-5 py-3">
                    <h4 className="text-xs font-semibold text-subtle uppercase tracking-wider mb-2">
                      Expenses · {projExpenses.length}
                    </h4>
                    <div className="space-y-1.5">
                      {projExpenses.slice(0, 6).map(e => (
                        <div key={e.id} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="text-content truncate">{e.description}</span>
                            {e.store && (
                              <span className="text-subtle shrink-0">{e.store}</span>
                            )}
                            <span className="text-subtle shrink-0">{fmtDate(e.expense_date)}</span>
                          </div>
                          <span className="text-content font-medium tabular-nums ml-4 shrink-0">
                            {fmtMoney(e.amount)}
                          </span>
                        </div>
                      ))}
                      {projExpenses.length > 6 && (
                        <p className="text-xs text-subtle pt-0.5">
                          + {projExpenses.length - 6} more expense{projExpenses.length - 6 !== 1 ? 's' : ''}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Livestock summary */}
                {projLivestock.length > 0 && (
                  <div className="border-t border-line/40 px-5 py-3">
                    <h4 className="text-xs font-semibold text-subtle uppercase tracking-wider mb-2">
                      Livestock · {projLivestock.length} log{projLivestock.length !== 1 ? 's' : ''}
                    </h4>
                    <div className="space-y-1">
                      {Object.entries(livestockGroups).map(([name, data]) => (
                        <div key={name} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-content capitalize">{name}</span>
                            <span className="text-subtle">{data.count} log{data.count !== 1 ? 's' : ''}</span>
                            {data.totalQty > 0 && (
                              <span className="text-amber-600 dark:text-amber-400">
                                {data.totalQty} {data.unit}
                              </span>
                            )}
                          </div>
                          {data.revenue > 0 && (
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium tabular-nums">
                              {fmtMoney(data.revenue)} revenue
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Garden summary */}
                {projGarden.length > 0 && (
                  <div className="border-t border-line/40 px-5 py-3">
                    <h4 className="text-xs font-semibold text-subtle uppercase tracking-wider mb-2">
                      Garden · {projGarden.length} crop{projGarden.length !== 1 ? 's' : ''}
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {projGarden.map((g, i) => (
                        <span key={i} className="text-xs bg-elevated text-muted px-2 py-0.5 rounded-full">
                          {g.crop_name}{g.variety ? ` (${g.variety})` : ''} · {g.status}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty project */}
                {!hasAnyData && (
                  <div className="border-t border-line/40 px-5 py-3">
                    <p className="text-xs text-subtle">
                      No data tracked yet — log expenses or tag livestock/garden entries to this project.
                    </p>
                  </div>
                )}
              </div>
              </Link>
            )
          })}
        </div>
      </main>
      </PrintFrame>
    </div>
  )
}
