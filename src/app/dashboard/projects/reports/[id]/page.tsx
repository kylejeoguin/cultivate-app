import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/auth'
import { householdOwnerId } from '@/lib/household'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { homesteadRevenue } from '@/lib/revenue'
import type { Project, ProjectExpense, ProjectIncome, HomesteadInput } from '@/lib/types'
import PrintButton from '@/app/dashboard/PrintButton'
import PrintFrame from '@/app/dashboard/PrintFrame'

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  up_next: 'Up Next',
  high_priority: 'High Priority',
  medium_priority: 'Medium Priority',
  low_priority: 'Low Priority',
  done: 'Done',
}
const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
  up_next: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  high_priority: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  medium_priority: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  low_priority: 'bg-elevated text-muted',
  done: 'bg-elevated/50 text-subtle',
}
const CAT_LABELS: Record<string, string> = { homestead: 'Homestead', home_diy: 'Home & DIY' }

function fmtMoney(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function fmtDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export default async function ProjectReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const user = await getCachedUser()
  if (!user) redirect('/login')

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
    // Household-scoped, not author-scoped: an invited parent's projects live under the plan
    // owner's id since 20260727210000, so pinning user.id would 404 the report for them.
    supabase.from('projects').select('*').eq('id', id).eq('user_id', await householdOwnerId(supabase, user.id)).single(),
    supabase.from('project_expenses').select('*').eq('project_id', id).order('expense_date', { ascending: false }),
    supabase.from('project_income').select('*').eq('project_id', id).order('income_date', { ascending: false }),
    supabase.from('project_tasks').select('*').eq('project_id', id).order('sort_order').order('created_at'),
    supabase.from('livestock_logs').select('project_id, quantity, unit, sale_amount, sale_qty, disposition, animal_type, animal_name').eq('project_id', id),
    supabase.from('garden_entries').select('project_id, crop_name, variety, status, sale_amount, disposition').eq('project_id', id),
    supabase.from('preservation_logs').select('project_id, item_name, method, quantity, unit, sale_amount, disposition').eq('project_id', id),
    supabase.from('homestead_inputs').select('*').eq('project_id', id).order('input_date', { ascending: false }),
  ])

  if (!projectData) notFound()

  const project = projectData as Project
  const expenses = (expenseData ?? []) as ProjectExpense[]
  const income = (incomeData ?? []) as ProjectIncome[]
  const tasks = taskData ?? []
  const livestock = livestockData ?? []
  const garden = gardenData ?? []
  const preservation = preservationData ?? []
  const homesteadInputs = (homesteadInputData ?? []) as HomesteadInput[]

  // Spend = project expenses + any homestead costs (feed, jars, supplies) tagged to this project.
  const homesteadInputCost = homesteadInputs.reduce((sum, i) => sum + i.cost, 0)
  const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0) + homesteadInputCost
  // Revenue = homestead sales tagged to this project (produce + animals + preserved goods) PLUS
  // direct income the homestead tables can't represent (a Home & DIY sale, the finished build, misc).
  const directIncome = income.reduce((sum, i) => sum + i.amount, 0)
  const totalRevenue = homesteadRevenue({ livestock, garden, preservation }) + directIncome
  const net = totalRevenue - totalSpent
  const completedTasks = tasks.filter(t => t.is_complete).length
  const budget = project.budget
  const remaining = budget != null ? budget - totalSpent : null
  const overBudget = remaining != null && remaining < 0

  const livestockGroups = livestock.reduce((acc, l) => {
    const key = l.animal_name ?? l.animal_type
    if (!acc[key]) acc[key] = { count: 0, totalQty: 0, unit: l.unit, revenue: 0 }
    acc[key].count++
    acc[key].totalQty += l.quantity ?? 0
    acc[key].revenue += l.sale_amount ?? 0
    return acc
  }, {} as Record<string, { count: number; totalQty: number; unit: string | null; revenue: number }>)

  return (
    <div className="min-h-screen bg-surface text-content print:bg-white print:text-stone-900">
      <nav className="print:hidden no-print border-b border-line/60 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/projects/reports" className="text-subtle hover:text-content text-sm transition-colors">
            ← Reports
          </Link>
          <span className="text-subtle">/</span>
          <span className="text-sm font-semibold text-content truncate max-w-xs">{project.title}</span>
        </div>
        <PrintButton />
      </nav>

      <PrintFrame>
      <main className="max-w-2xl mx-auto px-6 py-8">
        <div className="hidden print:block mb-6 pb-4 border-b border-stone-300">
          <h1 className="text-xl font-bold text-stone-900">Cultivate</h1>
          <p className="text-sm text-subtle">mycultivate.app</p>
        </div>
        {/* Project header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h2 className="text-xl font-bold tracking-tight text-content">{project.title}</h2>
            <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${STATUS_COLORS[project.status]}`}>
              {STATUS_LABELS[project.status]}
            </span>
            <span className="text-xs text-subtle">{CAT_LABELS[project.category]}</span>
          </div>
          {project.description && <p className="text-muted text-sm">{project.description}</p>}
          {project.target && <p className="text-subtle text-sm mt-1">🎯 {project.target}</p>}
        </div>

        {/* Financial summary strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <div className="bg-card/60 border border-line/60 rounded-xl px-4 py-3 text-center">
            <div className="text-lg font-bold text-red-600 dark:text-red-400">{fmtMoney(totalSpent)}</div>
            <div className="text-xs text-subtle mt-0.5">spent</div>
            {budget != null && (
              <div className={`text-xs mt-0.5 ${overBudget ? 'text-red-600 dark:text-red-400' : 'text-subtle'}`}>
                of {fmtMoney(budget)} budget
              </div>
            )}
          </div>
          <div className="bg-card/60 border border-line/60 rounded-xl px-4 py-3 text-center">
            <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{fmtMoney(totalRevenue)}</div>
            <div className="text-xs text-subtle mt-0.5">revenue</div>
          </div>
          <div className="bg-card/60 border border-line/60 rounded-xl px-4 py-3 text-center">
            <div className={`text-lg font-bold ${net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-content'}`}>
              {net >= 0 ? '+' : '-'}{fmtMoney(Math.abs(net))}
            </div>
            <div className="text-xs text-subtle mt-0.5">{net >= 0 ? 'net profit' : 'net cost'}</div>
          </div>
          <div className="bg-card/60 border border-line/60 rounded-xl px-4 py-3 text-center">
            <div className="text-lg font-bold text-content">{completedTasks}/{tasks.length}</div>
            <div className="text-xs text-subtle mt-0.5">tasks done</div>
          </div>
        </div>

        {/* Budget bar */}
        {budget != null && totalSpent > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-subtle">Budget usage</span>
              <span className={overBudget ? 'text-red-600 dark:text-red-400 font-medium' : 'text-muted'}>
                {fmtMoney(totalSpent)} / {fmtMoney(budget)}
                {overBudget ? ` · ${fmtMoney(Math.abs(remaining!))} over budget` : ` · ${fmtMoney(remaining!)} remaining`}
              </span>
            </div>
            <div className="h-2 bg-elevated rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${overBudget ? 'bg-red-500' : 'bg-green-600'}`}
                style={{ width: `${Math.min((totalSpent / budget) * 100, 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Tasks */}
        {tasks.length > 0 && (
          <section className="mb-8">
            <h3 className="text-xs font-semibold text-subtle uppercase tracking-widest mb-3">
              Tasks · {completedTasks}/{tasks.length} complete
            </h3>
            {tasks.length > 0 && (
              <div className="mb-3 h-1.5 bg-elevated rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-600 rounded-full"
                  style={{ width: `${tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0}%` }}
                />
              </div>
            )}
            <div className="bg-card/60 border border-line rounded-xl divide-y divide-line/60 print-flow">
              {tasks.map((task) => (
                <div key={task.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                    task.is_complete ? 'bg-green-700 border-green-700' : 'border-line-strong'
                  }`}>
                    {task.is_complete && <span className="text-white text-[10px]">✓</span>}
                  </span>
                  <span className={`text-sm ${task.is_complete ? 'line-through text-subtle' : 'text-content'}`}>
                    {task.title}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Expenses */}
        {expenses.length > 0 && (
          <section className="mb-8">
            <h3 className="text-xs font-semibold text-subtle uppercase tracking-widest mb-3">
              Expenses · {expenses.length}
            </h3>
            <div className="bg-card/60 border border-line rounded-xl overflow-hidden print-flow">
              <div className="divide-y divide-line/60">
                {expenses.map(e => (
                  <div key={e.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <div className="flex-1 min-w-0">
                      <span className="text-content">{e.description}</span>
                      {e.store && <span className="text-subtle ml-2 text-xs">{e.store}</span>}
                    </div>
                    <div className="flex items-center gap-4 shrink-0 ml-4">
                      <span className="text-subtle text-xs">{fmtDate(e.expense_date)}</span>
                      <span className="text-content font-medium tabular-nums">{fmtMoney(e.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-line/60 px-4 py-2.5 flex justify-between items-center bg-surface/40">
                <span className="text-xs text-subtle font-semibold uppercase tracking-wider">Total</span>
                <span className="text-sm font-bold text-content tabular-nums">{fmtMoney(totalSpent)}</span>
              </div>
            </div>
          </section>
        )}

        {/* Direct income */}
        {income.length > 0 && (
          <section className="mb-8">
            <h3 className="text-xs font-semibold text-subtle uppercase tracking-widest mb-3">
              Income · {income.length}
            </h3>
            <div className="bg-card/60 border border-line rounded-xl overflow-hidden print-flow">
              <div className="divide-y divide-line/60">
                {income.map(i => (
                  <div key={i.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <div className="flex-1 min-w-0">
                      <span className="text-content">{i.description}</span>
                      {i.source && <span className="text-subtle ml-2 text-xs">{i.source}</span>}
                    </div>
                    <div className="flex items-center gap-4 shrink-0 ml-4">
                      <span className="text-subtle text-xs">{fmtDate(i.income_date)}</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium tabular-nums">{fmtMoney(i.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-line/60 px-4 py-2.5 flex justify-between items-center bg-surface/40">
                <span className="text-xs text-subtle font-semibold uppercase tracking-wider">Total</span>
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{fmtMoney(directIncome)}</span>
              </div>
            </div>
          </section>
        )}

        {/* Homestead input costs tagged to this project */}
        {homesteadInputs.length > 0 && (
          <section className="mb-8">
            <h3 className="text-xs font-semibold text-subtle uppercase tracking-widest mb-3">
              Homestead costs · {homesteadInputs.length}
            </h3>
            <div className="bg-card/60 border border-line rounded-xl overflow-hidden print-flow">
              <div className="divide-y divide-line/60">
                {homesteadInputs.map(i => (
                  <div key={i.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <div className="flex-1 min-w-0">
                      <span className="text-content">{i.item}</span>
                      <span className="text-subtle ml-2 text-xs capitalize">{i.section}</span>
                    </div>
                    <div className="flex items-center gap-4 shrink-0 ml-4">
                      <span className="text-subtle text-xs">{fmtDate(i.input_date)}</span>
                      <span className="text-content font-medium tabular-nums">{fmtMoney(i.cost)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-line/60 px-4 py-2.5 flex justify-between items-center bg-surface/40">
                <span className="text-xs text-subtle font-semibold uppercase tracking-wider">Total</span>
                <span className="text-sm font-bold text-content tabular-nums">{fmtMoney(homesteadInputCost)}</span>
              </div>
            </div>
          </section>
        )}

        {/* Preservation batches tagged to this project */}
        {preservation.length > 0 && (
          <section className="mb-8">
            <h3 className="text-xs font-semibold text-subtle uppercase tracking-widest mb-3">
              Preservation · {preservation.length} batch{preservation.length !== 1 ? 'es' : ''}
            </h3>
            <div className="bg-card/60 border border-line rounded-xl divide-y divide-line/60 print-flow">
              {preservation.map((p, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-content">{p.item_name}</span>
                    {p.quantity != null && <span className="text-sky-600 dark:text-sky-400 text-xs">{p.quantity} {p.unit}</span>}
                  </div>
                  {(p.disposition === 'sold' || p.disposition === 'mixed') && p.sale_amount != null && (
                    <span className="text-emerald-600 dark:text-emerald-400 text-sm font-medium tabular-nums">{fmtMoney(p.sale_amount)}</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Livestock */}
        {livestock.length > 0 && (
          <section className="mb-8">
            <h3 className="text-xs font-semibold text-subtle uppercase tracking-widest mb-3">
              Livestock · {livestock.length} log{livestock.length !== 1 ? 's' : ''}
            </h3>
            <div className="bg-card/60 border border-line rounded-xl divide-y divide-line/60 print-flow">
              {Object.entries(livestockGroups).map(([name, data]) => (
                <div key={name} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-content text-sm capitalize">{name}</span>
                    <span className="text-subtle text-xs">{data.count} log{data.count !== 1 ? 's' : ''}</span>
                    {data.totalQty > 0 && (
                      <span className="text-amber-600 dark:text-amber-400 text-xs">{data.totalQty} {data.unit}</span>
                    )}
                  </div>
                  {data.revenue > 0 && (
                    <span className="text-emerald-600 dark:text-emerald-400 text-sm font-medium tabular-nums">{fmtMoney(data.revenue)}</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Garden */}
        {garden.length > 0 && (
          <section className="mb-8">
            <h3 className="text-xs font-semibold text-subtle uppercase tracking-widest mb-3">
              Garden · {garden.length} crop{garden.length !== 1 ? 's' : ''}
            </h3>
            <div className="bg-card/60 border border-line rounded-xl divide-y divide-line/60 print-flow">
              {garden.map((g, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-content">{g.crop_name}{g.variety ? ` (${g.variety})` : ''}</span>
                  <span className="text-subtle text-xs capitalize">{g.status}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Empty state */}
        {expenses.length === 0 && income.length === 0 && homesteadInputs.length === 0 && preservation.length === 0 && tasks.length === 0 && livestock.length === 0 && garden.length === 0 && (
          <div className="text-center py-16">
            <p className="text-subtle text-sm">No data tracked yet for this project.</p>
            <Link href="/dashboard/projects" className="text-subtle hover:text-muted text-sm mt-2 inline-block transition-colors">
              ← Go to Projects
            </Link>
          </div>
        )}
      </main>
      </PrintFrame>
    </div>
  )
}
