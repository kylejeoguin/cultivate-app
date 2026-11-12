'use client'

import { useToday, todayLocalISO } from '@/lib/use-today'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Project, ProjectTask, ProjectExpense, ProjectIncome, ProjectCategory, ProjectStatus } from '@/lib/types'

type CategoryFilter = 'all' | ProjectCategory

const STATUS_ORDER: ProjectStatus[] = ['active', 'up_next', 'high_priority', 'medium_priority', 'low_priority', 'done']

const STATUS_LABELS: Record<ProjectStatus, string> = {
  active: 'Active',
  up_next: 'Up Next',
  high_priority: 'High Priority',
  medium_priority: 'Medium Priority',
  low_priority: 'Low Priority',
  done: 'Done',
}

const STATUS_COLORS: Record<ProjectStatus, string> = {
  active: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/50 dark:text-green-300 dark:border-green-800/50',
  up_next: 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-800/40',
  high_priority: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800/40',
  medium_priority: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800/40',
  low_priority: 'bg-elevated text-muted border-line-strong',
  done: 'bg-elevated/50 text-subtle border-line-strong/50',
}

const CAT_LABELS: Record<ProjectCategory, string> = {
  homestead: 'Homestead',
  home_diy: 'Home',
}

const CAT_COLORS: Record<ProjectCategory, string> = {
  homestead: 'text-amber-800 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/30',
  home_diy: 'text-sky-800 bg-sky-100 dark:text-sky-400 dark:bg-sky-900/30',
}

function formatExpenseDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtMoney(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export default function ProjectsClient({
  initialProjects,
  initialTasks,
  initialExpenses,
  initialIncome,
  defaultCategory,
}: {
  initialProjects: Project[]
  initialTasks: ProjectTask[]
  initialExpenses: ProjectExpense[]
  initialIncome: ProjectIncome[]
  defaultCategory: ProjectCategory | null
}) {
  const router = useRouter()
  const supabase = createClient()

  const [projects, setProjects] = useState(initialProjects)
  const [tasks, setTasks] = useState(initialTasks)
  const [expenses, setExpenses] = useState(initialExpenses)
  const [income, setIncome] = useState(initialIncome)
  const [filter, setFilter] = useState<CategoryFilter>(defaultCategory ?? 'all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)

  // Add project form state
  const [newTitle, setNewTitle] = useState('')
  const [newCategory, setNewCategory] = useState<ProjectCategory>(defaultCategory ?? 'homestead')
  const [newDescription, setNewDescription] = useState('')
  const [newTarget, setNewTarget] = useState('')
  const [newBudget, setNewBudget] = useState('')
  const [newStatus, setNewStatus] = useState<ProjectStatus>('up_next')

  // Add task state
  const [addingTaskTo, setAddingTaskTo] = useState<string | null>(null)
  const [newTaskTitle, setNewTaskTitle] = useState('')

  const filtered = projects.filter(p => filter === 'all' || p.category === filter)

  async function getUser() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return null }
    return user
  }

  async function addProject() {
    if (!newTitle.trim()) return
    const user = await getUser(); if (!user) return
    setSaving(true)

    const { data, error } = await supabase
      .from('projects')
      .insert({
        user_id: user.id,
        title: newTitle.trim(),
        category: newCategory,
        description: newDescription.trim() || null,
        target: newTarget.trim() || null,
        budget: newBudget ? parseFloat(newBudget) : null,
        status: newStatus,
      })
      .select()
      .single()

    if (!error && data) {
      setProjects(prev => [data as Project, ...prev])
      setNewTitle('')
      setNewDescription('')
      setNewTarget('')
      setNewBudget('')
      setNewStatus('up_next')
      setShowAdd(false)
      setExpandedId(data.id)
    }
    setSaving(false)
  }

  async function changeStatus(project: Project, next: ProjectStatus) {
    const { error } = await supabase
      .from('projects')
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq('id', project.id)

    if (!error) {
      setProjects(prev => prev.map(p => p.id === project.id ? { ...p, status: next } : p))
    }
  }

  async function deleteProject(id: string) {
    await supabase.from('projects').delete().eq('id', id)
    setProjects(prev => prev.filter(p => p.id !== id))
    setTasks(prev => prev.filter(t => t.project_id !== id))
    setExpenses(prev => prev.filter(e => e.project_id !== id))
    setIncome(prev => prev.filter(i => i.project_id !== id))
    if (expandedId === id) setExpandedId(null)
  }

  async function addTask(projectId: string) {
    if (!newTaskTitle.trim()) return
    const user = await getUser(); if (!user) return

    const { data, error } = await supabase
      .from('project_tasks')
      .insert({
        project_id: projectId,
        user_id: user.id,
        title: newTaskTitle.trim(),
        sort_order: tasks.filter(t => t.project_id === projectId).length,
      })
      .select()
      .single()

    if (!error && data) {
      setTasks(prev => [...prev, data as ProjectTask])
      setNewTaskTitle('')
    }
  }

  async function toggleTask(task: ProjectTask) {
    const { error } = await supabase
      .from('project_tasks')
      .update({ is_complete: !task.is_complete })
      .eq('id', task.id)

    if (!error) {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, is_complete: !t.is_complete } : t))
    }
  }

  async function deleteTask(id: string) {
    await supabase.from('project_tasks').delete().eq('id', id)
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  async function addExpense(projectId: string, amount: number, description: string, date: string, store: string | null) {
    const user = await getUser(); if (!user) return null
    const { data, error } = await supabase
      .from('project_expenses')
      .insert({
        project_id: projectId,
        user_id: user.id,
        amount,
        description: description.trim(),
        expense_date: date,
        store: store?.trim() || null,
      })
      .select()
      .single()

    if (!error && data) {
      setExpenses(prev => [data as ProjectExpense, ...prev])
    }
    return error
  }

  async function deleteExpense(id: string) {
    await supabase.from('project_expenses').delete().eq('id', id)
    setExpenses(prev => prev.filter(e => e.id !== id))
  }

  async function addIncome(projectId: string, amount: number, description: string, date: string, source: string | null) {
    const user = await getUser(); if (!user) return null
    const { data, error } = await supabase
      .from('project_income')
      .insert({
        project_id: projectId,
        user_id: user.id,
        amount,
        description: description.trim(),
        income_date: date,
        source: source?.trim() || null,
      })
      .select()
      .single()

    if (!error && data) {
      setIncome(prev => [data as ProjectIncome, ...prev])
    }
    return error
  }

  async function deleteIncome(id: string) {
    await supabase.from('project_income').delete().eq('id', id)
    setIncome(prev => prev.filter(i => i.id !== id))
  }

  const activeProjects = filtered.filter(p => p.status === 'active')
  const upNextProjects = filtered.filter(p => p.status === 'up_next')
  const highPriorityProjects = filtered.filter(p => p.status === 'high_priority')
  const mediumPriorityProjects = filtered.filter(p => p.status === 'medium_priority')
  const lowPriorityProjects = filtered.filter(p => p.status === 'low_priority')
  const doneProjects = filtered.filter(p => p.status === 'done')
  const [showDone, setShowDone] = useState(false)

  return (
    <div className="min-h-screen bg-surface text-content">
      <nav className="border-b border-line/60 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-subtle hover:text-content text-sm transition-colors">← Home</Link>
          <span className="text-subtle">/</span>
          <span className="text-sm font-semibold text-content">Projects</span>
        </div>
        <button
          onClick={() => { setShowAdd(v => !v); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
          className="bg-elevated hover:bg-line-strong text-content text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors"
        >
          + New Project
        </button>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-8 pb-24">
        {/* Category filter tabs + Reports link */}
        <div className="flex items-center justify-between mb-8">
        <div className="flex gap-2">
          {(['all', 'homestead', 'home_diy'] as const).map(cat => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === cat
                  ? 'bg-line-strong text-content'
                  : 'text-subtle hover:text-content'
              }`}
            >
              {cat === 'all' ? 'All' : CAT_LABELS[cat]}
            </button>
          ))}
        </div>
          <Link
            href="/dashboard/projects/reports"
            className="flex items-center gap-1.5 text-sm text-subtle hover:text-content transition-colors shrink-0"
          >
            📊 Reports
          </Link>
        </div>

        {/* Add project form */}
        {showAdd && (
          <div className="bg-card/60 border border-line-strong rounded-xl p-5 mb-8">
            <h3 className="text-sm font-semibold mb-4">New Project</h3>
            <div className="space-y-3">
              <input
                autoFocus
                type="text"
                placeholder="Project title"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addProject()}
                className="w-full bg-elevated border border-line-strong rounded-lg px-3 py-2 text-sm text-content placeholder-subtle focus:outline-none focus:border-line-strong"
              />
              <textarea
                rows={3}
                placeholder="Description (optional) — add as much detail as you like"
                value={newDescription}
                onChange={e => setNewDescription(e.target.value)}
                className="w-full bg-elevated border border-line-strong rounded-lg px-3 py-2 text-sm text-content placeholder-subtle focus:outline-none focus:border-line-strong resize-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-subtle mb-1" htmlFor="category-1">Category</label>
                  <select id="category-1"
                    value={newCategory}
                    onChange={e => setNewCategory(e.target.value as ProjectCategory)}
                    className="w-full bg-elevated border border-line-strong rounded-lg px-3 py-2 text-sm text-content focus:outline-none focus:border-line-strong"
                  >
                    <option value="homestead">Homestead</option>
                    <option value="home_diy">Home</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-subtle mb-1" htmlFor="status-2">Status</label>
                  <select id="status-2"
                    value={newStatus}
                    onChange={e => setNewStatus(e.target.value as ProjectStatus)}
                    className="w-full bg-elevated border border-line-strong rounded-lg px-3 py-2 text-sm text-content focus:outline-none focus:border-line-strong"
                  >
                    <option value="active">Active</option>
                    <option value="up_next">Up Next</option>
                    <option value="high_priority">High Priority</option>
                    <option value="medium_priority">Medium Priority</option>
                    <option value="low_priority">Low Priority</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-subtle mb-1" htmlFor="target-optional-3">Target (optional)</label>
                  <input id="target-optional-3"
                    type="text"
                    placeholder="e.g. Spring 2026"
                    value={newTarget}
                    onChange={e => setNewTarget(e.target.value)}
                    className="w-full bg-elevated border border-line-strong rounded-lg px-3 py-2 text-sm text-content placeholder-subtle focus:outline-none focus:border-line-strong"
                  />
                </div>
                <div>
                  <label htmlFor="project-budget" className="block text-xs text-subtle mb-1">Budget (optional)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle text-sm">$</span>
                    <input
                      id="project-budget"
                      type="number"
                      placeholder="0.00"
                      value={newBudget}
                      onChange={e => setNewBudget(e.target.value)}
                      step="0.01"
                      min="0"
                      className="w-full bg-elevated border border-line-strong rounded-lg pl-6 pr-3 py-2 text-sm text-content placeholder-subtle focus:outline-none focus:border-line-strong"
                    />
                  </div>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={addProject}
                  disabled={saving || !newTitle.trim()}
                  className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-content text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                >
                  {saving ? 'Saving...' : 'Add Project'}
                </button>
                <button
                  onClick={() => { setShowAdd(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                  className="text-subtle hover:text-content text-sm px-3 py-2 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {filtered.length === 0 && !showAdd && (
          <div className="text-center py-16">
            <div className="w-14 h-14 rounded-2xl bg-elevated/60 flex items-center justify-center text-3xl mx-auto mb-4">🔨</div>
            <div className="text-content font-semibold mb-1">No projects yet</div>
            <p className="text-subtle text-sm mb-5">
              {filter === 'homestead' ? 'Plan your homestead builds, improvements, and projects.' :
               filter === 'home_diy' ? 'Track your home renovation and DIY projects.' :
               'Add your first project to start tracking what you\'re building.'}
            </p>
            <button
              onClick={() => setShowAdd(true)}
              className="bg-elevated hover:bg-line-strong text-content text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
            >
              + New Project
            </button>
          </div>
        )}

        {/* Active */}
        {activeProjects.length > 0 && (
          <section className="mb-8">
            <h3 className="text-xs font-semibold text-subtle uppercase tracking-widest mb-3">Active · {activeProjects.length}</h3>
            <div className="space-y-3">
              {activeProjects.map(p => (
                <ProjectCard key={p.id} project={p} tasks={tasks.filter(t => t.project_id === p.id)} expenses={expenses.filter(e => e.project_id === p.id)} income={income.filter(i => i.project_id === p.id)}
                  isExpanded={expandedId === p.id} onToggleExpand={() => setExpandedId(prev => prev === p.id ? null : p.id)}
                  onChangeStatus={(s) => changeStatus(p, s)} onDelete={() => deleteProject(p.id)}
                  addingTask={addingTaskTo === p.id} onStartAddTask={() => { setAddingTaskTo(p.id); setNewTaskTitle('') }}
                  onCancelAddTask={() => setAddingTaskTo(null)} newTaskTitle={newTaskTitle} onNewTaskTitleChange={setNewTaskTitle}
                  onAddTask={() => addTask(p.id).then(() => setAddingTaskTo(null))} onToggleTask={toggleTask} onDeleteTask={deleteTask}
                  onAddExpense={(amount, desc, date, store) => addExpense(p.id, amount, desc, date, store)} onDeleteExpense={deleteExpense} onAddIncome={(amount, desc, date, source) => addIncome(p.id, amount, desc, date, source)} onDeleteIncome={deleteIncome} />
              ))}
            </div>
          </section>
        )}

        {/* Up Next */}
        {upNextProjects.length > 0 && (
          <section className="mb-8">
            <h3 className="text-xs font-semibold text-subtle uppercase tracking-widest mb-3">Up Next · {upNextProjects.length}</h3>
            <div className="space-y-3">
              {upNextProjects.map(p => (
                <ProjectCard key={p.id} project={p} tasks={tasks.filter(t => t.project_id === p.id)} expenses={expenses.filter(e => e.project_id === p.id)} income={income.filter(i => i.project_id === p.id)}
                  isExpanded={expandedId === p.id} onToggleExpand={() => setExpandedId(prev => prev === p.id ? null : p.id)}
                  onChangeStatus={(s) => changeStatus(p, s)} onDelete={() => deleteProject(p.id)}
                  addingTask={addingTaskTo === p.id} onStartAddTask={() => { setAddingTaskTo(p.id); setNewTaskTitle('') }}
                  onCancelAddTask={() => setAddingTaskTo(null)} newTaskTitle={newTaskTitle} onNewTaskTitleChange={setNewTaskTitle}
                  onAddTask={() => addTask(p.id).then(() => setAddingTaskTo(null))} onToggleTask={toggleTask} onDeleteTask={deleteTask}
                  onAddExpense={(amount, desc, date, store) => addExpense(p.id, amount, desc, date, store)} onDeleteExpense={deleteExpense} onAddIncome={(amount, desc, date, source) => addIncome(p.id, amount, desc, date, source)} onDeleteIncome={deleteIncome} />
              ))}
            </div>
          </section>
        )}

        {/* High Priority */}
        {highPriorityProjects.length > 0 && (
          <section className="mb-8">
            <h3 className="text-xs font-semibold text-subtle uppercase tracking-widest mb-3">High Priority · {highPriorityProjects.length}</h3>
            <div className="space-y-3">
              {highPriorityProjects.map(p => (
                <ProjectCard key={p.id} project={p} tasks={tasks.filter(t => t.project_id === p.id)} expenses={expenses.filter(e => e.project_id === p.id)} income={income.filter(i => i.project_id === p.id)}
                  isExpanded={expandedId === p.id} onToggleExpand={() => setExpandedId(prev => prev === p.id ? null : p.id)}
                  onChangeStatus={(s) => changeStatus(p, s)} onDelete={() => deleteProject(p.id)}
                  addingTask={addingTaskTo === p.id} onStartAddTask={() => { setAddingTaskTo(p.id); setNewTaskTitle('') }}
                  onCancelAddTask={() => setAddingTaskTo(null)} newTaskTitle={newTaskTitle} onNewTaskTitleChange={setNewTaskTitle}
                  onAddTask={() => addTask(p.id).then(() => setAddingTaskTo(null))} onToggleTask={toggleTask} onDeleteTask={deleteTask}
                  onAddExpense={(amount, desc, date, store) => addExpense(p.id, amount, desc, date, store)} onDeleteExpense={deleteExpense} onAddIncome={(amount, desc, date, source) => addIncome(p.id, amount, desc, date, source)} onDeleteIncome={deleteIncome} />
              ))}
            </div>
          </section>
        )}

        {/* Medium Priority */}
        {mediumPriorityProjects.length > 0 && (
          <section className="mb-8">
            <h3 className="text-xs font-semibold text-subtle uppercase tracking-widest mb-3">Medium Priority · {mediumPriorityProjects.length}</h3>
            <div className="space-y-3">
              {mediumPriorityProjects.map(p => (
                <ProjectCard key={p.id} project={p} tasks={tasks.filter(t => t.project_id === p.id)} expenses={expenses.filter(e => e.project_id === p.id)} income={income.filter(i => i.project_id === p.id)}
                  isExpanded={expandedId === p.id} onToggleExpand={() => setExpandedId(prev => prev === p.id ? null : p.id)}
                  onChangeStatus={(s) => changeStatus(p, s)} onDelete={() => deleteProject(p.id)}
                  addingTask={addingTaskTo === p.id} onStartAddTask={() => { setAddingTaskTo(p.id); setNewTaskTitle('') }}
                  onCancelAddTask={() => setAddingTaskTo(null)} newTaskTitle={newTaskTitle} onNewTaskTitleChange={setNewTaskTitle}
                  onAddTask={() => addTask(p.id).then(() => setAddingTaskTo(null))} onToggleTask={toggleTask} onDeleteTask={deleteTask}
                  onAddExpense={(amount, desc, date, store) => addExpense(p.id, amount, desc, date, store)} onDeleteExpense={deleteExpense} onAddIncome={(amount, desc, date, source) => addIncome(p.id, amount, desc, date, source)} onDeleteIncome={deleteIncome} />
              ))}
            </div>
          </section>
        )}

        {/* Low Priority */}
        {lowPriorityProjects.length > 0 && (
          <section className="mb-8">
            <h3 className="text-xs font-semibold text-subtle uppercase tracking-widest mb-3">Low Priority · {lowPriorityProjects.length}</h3>
            <div className="space-y-3">
              {lowPriorityProjects.map(p => (
                <ProjectCard key={p.id} project={p} tasks={tasks.filter(t => t.project_id === p.id)} expenses={expenses.filter(e => e.project_id === p.id)} income={income.filter(i => i.project_id === p.id)}
                  isExpanded={expandedId === p.id} onToggleExpand={() => setExpandedId(prev => prev === p.id ? null : p.id)}
                  onChangeStatus={(s) => changeStatus(p, s)} onDelete={() => deleteProject(p.id)}
                  addingTask={addingTaskTo === p.id} onStartAddTask={() => { setAddingTaskTo(p.id); setNewTaskTitle('') }}
                  onCancelAddTask={() => setAddingTaskTo(null)} newTaskTitle={newTaskTitle} onNewTaskTitleChange={setNewTaskTitle}
                  onAddTask={() => addTask(p.id).then(() => setAddingTaskTo(null))} onToggleTask={toggleTask} onDeleteTask={deleteTask}
                  onAddExpense={(amount, desc, date, store) => addExpense(p.id, amount, desc, date, store)} onDeleteExpense={deleteExpense} onAddIncome={(amount, desc, date, source) => addIncome(p.id, amount, desc, date, source)} onDeleteIncome={deleteIncome} />
              ))}
            </div>
          </section>
        )}

        {/* Done — collapsed by default */}
        {doneProjects.length > 0 && (
          <section>
            <button
              onClick={() => setShowDone(v => !v)}
              className="flex items-center gap-2 text-xs font-semibold text-subtle hover:text-muted uppercase tracking-widest mb-3 transition-colors"
            >
              <span>{showDone ? '▾' : '▸'}</span>
              Done · {doneProjects.length}
            </button>
            {showDone && (
              <div className="space-y-2">
                {doneProjects.map(p => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    tasks={tasks.filter(t => t.project_id === p.id)}
                    expenses={expenses.filter(e => e.project_id === p.id)} income={income.filter(i => i.project_id === p.id)}
                    isExpanded={expandedId === p.id}
                    onToggleExpand={() => setExpandedId(prev => prev === p.id ? null : p.id)}
                    onChangeStatus={(s) => changeStatus(p, s)}
                    onDelete={() => deleteProject(p.id)}
                    addingTask={addingTaskTo === p.id}
                    onStartAddTask={() => { setAddingTaskTo(p.id); setNewTaskTitle('') }}
                    onCancelAddTask={() => setAddingTaskTo(null)}
                    newTaskTitle={newTaskTitle}
                    onNewTaskTitleChange={setNewTaskTitle}
                    onAddTask={() => addTask(p.id).then(() => setAddingTaskTo(null))}
                    onToggleTask={toggleTask}
                    onDeleteTask={deleteTask}
                    onAddExpense={(amount, desc, date, store) => addExpense(p.id, amount, desc, date, store)}
                    onDeleteExpense={deleteExpense} onAddIncome={(amount, desc, date, source) => addIncome(p.id, amount, desc, date, source)} onDeleteIncome={deleteIncome}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  )
}

function ProjectCard({
  project,
  tasks,
  expenses,
  income,
  isExpanded,
  onToggleExpand,
  onChangeStatus,
  onDelete,
  addingTask,
  onStartAddTask,
  onCancelAddTask,
  newTaskTitle,
  onNewTaskTitleChange,
  onAddTask,
  onToggleTask,
  onDeleteTask,
  onAddExpense,
  onDeleteExpense,
  onAddIncome,
  onDeleteIncome,
}: {
  project: Project
  tasks: ProjectTask[]
  expenses: ProjectExpense[]
  income: ProjectIncome[]
  isExpanded: boolean
  onToggleExpand: () => void
  onChangeStatus: (s: ProjectStatus) => void
  onDelete: () => void
  addingTask: boolean
  onStartAddTask: () => void
  onCancelAddTask: () => void
  newTaskTitle: string
  onNewTaskTitleChange: (v: string) => void
  onAddTask: () => void
  onToggleTask: (t: ProjectTask) => void
  onDeleteTask: (id: string) => void
  onAddExpense: (amount: number, description: string, date: string, store: string | null) => Promise<unknown>
  onDeleteExpense: (id: string) => void
  onAddIncome: (amount: number, description: string, date: string, source: string | null) => Promise<unknown>
  onDeleteIncome: (id: string) => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showAddExpense, setShowAddExpense] = useState(false)
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseDesc, setExpenseDesc] = useState('')
  const [expenseDate, setExpenseDate] = useToday()
  const [expenseStore, setExpenseStore] = useState('')
  const [savingExpense, setSavingExpense] = useState(false)

  const [showAddIncome, setShowAddIncome] = useState(false)
  const [incomeAmount, setIncomeAmount] = useState('')
  const [incomeDesc, setIncomeDesc] = useState('')
  const [incomeDate, setIncomeDate] = useToday()
  const [incomeSource, setIncomeSource] = useState('')
  const [savingIncome, setSavingIncome] = useState(false)

  const completedCount = tasks.filter(t => t.is_complete).length
  const isDone = project.status === 'done'

  const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0)
  const totalIncome = income.reduce((sum, i) => sum + i.amount, 0)
  const budget = project.budget
  const remaining = budget != null ? budget - totalSpent : null
  const overBudget = remaining != null && remaining < 0
  const hasBudgetInfo = totalSpent > 0 || budget != null

  async function handleAddExpense() {
    const amount = parseFloat(expenseAmount)
    if (!expenseDesc.trim() || isNaN(amount) || amount <= 0) return
    setSavingExpense(true)
    await onAddExpense(amount, expenseDesc, expenseDate, expenseStore || null)
    setExpenseAmount('')
    setExpenseDesc('')
    setExpenseDate(todayLocalISO())
    setExpenseStore('')
    setShowAddExpense(false)
    setSavingExpense(false)
  }

  async function handleAddIncome() {
    const amount = parseFloat(incomeAmount)
    if (!incomeDesc.trim() || isNaN(amount) || amount <= 0) return
    setSavingIncome(true)
    await onAddIncome(amount, incomeDesc, incomeDate, incomeSource || null)
    setIncomeAmount('')
    setIncomeDesc('')
    setIncomeDate(todayLocalISO())
    setIncomeSource('')
    setShowAddIncome(false)
    setSavingIncome(false)
  }

  return (
    <div className={`bg-card/60 border rounded-xl transition-all ${isDone ? 'border-line/40 opacity-70' : 'border-line'}`}>
      {/* Card header — disclosure toggle */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        className="px-4 py-3.5 flex items-start gap-3 cursor-pointer"
        onClick={onToggleExpand}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleExpand() } }}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-semibold text-sm ${isDone ? 'line-through text-subtle' : 'text-content'}`}>
              {project.title}
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded-md ${CAT_COLORS[project.category]}`}>
              {CAT_LABELS[project.category]}
            </span>
          </div>
          {project.description && (
            <p className={`text-xs text-subtle mt-0.5 ${isExpanded ? '' : 'line-clamp-2'}`}>{project.description}</p>
          )}
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <select
              value={project.status}
              onChange={e => { e.stopPropagation(); onChangeStatus(e.target.value as ProjectStatus) }}
              onClick={e => e.stopPropagation()}
              className={`text-xs px-2 py-0.5 rounded-md border font-medium cursor-pointer focus:outline-none ${STATUS_COLORS[project.status]}`}
              style={{ backgroundColor: 'transparent' }}
            >
              {STATUS_ORDER.map(s => (
                <option key={s} value={s} className="bg-card text-content">{STATUS_LABELS[s]}</option>
              ))}
            </select>
            {project.target && (
              <span className="text-xs text-subtle">🎯 {project.target}</span>
            )}
            {tasks.length > 0 && (
              <span className="text-xs text-subtle">{completedCount}/{tasks.length} tasks</span>
            )}
            {hasBudgetInfo && (
              <span className={`text-xs font-medium ${overBudget ? 'text-red-600 dark:text-red-400' : 'text-subtle'}`}>
                {budget != null
                  ? `${fmtMoney(totalSpent)} / ${fmtMoney(budget)}`
                  : `${fmtMoney(totalSpent)} spent`}
                {overBudget && ' · over budget'}
              </span>
            )}
          </div>
        </div>
        <span className="text-subtle text-xs mt-1 shrink-0">{isExpanded ? '▾' : '▸'}</span>
      </div>

      {/* Expanded: tasks + expenses + actions */}
      {isExpanded && (
        <div className="border-t border-line/60 px-4 py-3">
          {/* Task list */}
          {tasks.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {tasks.map(task => (
                <div key={task.id} className="flex items-center gap-2.5 group">
                  <button
                    onClick={() => onToggleTask(task)}
                    className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                      task.is_complete
                        ? 'bg-green-700 border-green-700'
                        : 'border-line-strong hover:border-line-strong'
                    }`}
                  >
                    {task.is_complete && <span className="text-content text-[10px]">✓</span>}
                  </button>
                  <span className={`text-sm flex-1 ${task.is_complete ? 'line-through text-subtle' : 'text-content'}`}>
                    {task.title}
                  </span>
                  <button
                    onClick={() => onDeleteTask(task.id)}
                    className="opacity-0 group-hover:opacity-100 text-subtle hover:text-red-600 dark:hover:text-red-400 text-xs transition-all"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add task */}
          {addingTask ? (
            <div className="flex gap-2 mb-4">
              <input
                autoFocus
                type="text"
                placeholder="Task description"
                value={newTaskTitle}
                onChange={e => onNewTaskTitleChange(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') onAddTask(); if (e.key === 'Escape') onCancelAddTask() }}
                className="flex-1 bg-elevated border border-line-strong rounded-lg px-3 py-1.5 text-sm text-content placeholder-subtle focus:outline-none focus:border-line-strong"
              />
              <button onClick={onAddTask} className="text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 text-sm font-medium transition-colors">Add</button>
              <button onClick={onCancelAddTask} className="text-subtle hover:text-content text-sm transition-colors">✕</button>
            </div>
          ) : (
            <button
              onClick={onStartAddTask}
              className="text-xs text-subtle hover:text-content transition-colors mb-4 flex items-center gap-1"
            >
              + Add task
            </button>
          )}

          {/* Expenses section */}
          <div className="border-t border-line/40 pt-3">
            {/* Budget summary bar */}
            {budget != null && (
              <div className="mb-3">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-subtle">Budget</span>
                  <span className={overBudget ? 'text-red-600 dark:text-red-400 font-medium' : 'text-muted'}>
                    {fmtMoney(totalSpent)} spent · {overBudget ? `${fmtMoney(Math.abs(remaining!))} over` : `${fmtMoney(remaining!)} left`}
                  </span>
                </div>
                <div className="h-1.5 bg-elevated rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${overBudget ? 'bg-red-500' : 'bg-green-600'}`}
                    style={{ width: `${Math.min((totalSpent / budget) * 100, 100)}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-subtle uppercase tracking-wider">Expenses</h4>
              {!showAddExpense && (
                <button
                  onClick={() => setShowAddExpense(true)}
                  className="text-xs text-subtle hover:text-content transition-colors"
                >
                  + Log expense
                </button>
              )}
            </div>

            {/* Expense list */}
            {expenses.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {expenses.map(e => (
                  <div key={e.id} className="flex items-center justify-between text-xs group">
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <span className="text-content truncate">{e.description}</span>
                      {e.store && <span className="text-subtle shrink-0">{e.store}</span>}
                      <span className="text-subtle shrink-0">{formatExpenseDate(e.expense_date)}</span>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0 ml-3">
                      <span className="text-content font-medium tabular-nums">{fmtMoney(e.amount)}</span>
                      <button
                        onClick={() => onDeleteExpense(e.id)}
                        className="opacity-0 group-hover:opacity-100 text-subtle hover:text-red-600 dark:hover:text-red-400 transition-all"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
                {expenses.length > 0 && (
                  <div className="flex justify-end pt-1 border-t border-line/40">
                    <span className="text-xs text-muted font-semibold tabular-nums">{fmtMoney(totalSpent)} total</span>
                  </div>
                )}
              </div>
            )}

            {expenses.length === 0 && !showAddExpense && (
              <p className="text-xs text-subtle mb-2">No expenses logged yet.</p>
            )}

            {/* Add expense form */}
            {showAddExpense && (
              <div className="bg-elevated/50 rounded-xl p-3 space-y-2.5 mb-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle text-xs">$</span>
                    <input
                      autoFocus
                      type="number"
                      placeholder="0.00"
                      value={expenseAmount}
                      onChange={e => setExpenseAmount(e.target.value)}
                      step="0.01"
                      min="0"
                      className="w-full bg-elevated border border-line-strong rounded-lg pl-5 pr-2.5 py-1.5 text-sm text-content placeholder-subtle focus:outline-none focus:border-line-strong"
                    />
                  </div>
                  <input
                    type="date"
                    value={expenseDate}
                    onChange={e => setExpenseDate(e.target.value)}
                    className="appearance-none w-full bg-elevated border border-line-strong rounded-lg px-2.5 py-1.5 text-sm text-content focus:outline-none focus:border-line-strong"
                  />
                </div>
                <input
                  type="text"
                  placeholder="What was it? (lumber, hardware, paint...)"
                  value={expenseDesc}
                  onChange={e => setExpenseDesc(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddExpense()}
                  className="w-full bg-elevated border border-line-strong rounded-lg px-2.5 py-1.5 text-sm text-content placeholder-subtle focus:outline-none focus:border-line-strong"
                />
                <input
                  type="text"
                  placeholder="Store / vendor (optional)"
                  value={expenseStore}
                  onChange={e => setExpenseStore(e.target.value)}
                  className="w-full bg-elevated border border-line-strong rounded-lg px-2.5 py-1.5 text-sm text-content placeholder-subtle focus:outline-none focus:border-line-strong"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleAddExpense}
                    disabled={savingExpense || !expenseDesc.trim() || !expenseAmount}
                    className="bg-line-strong hover:bg-line-strong disabled:opacity-50 text-content text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {savingExpense ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => { setShowAddExpense(false); setExpenseAmount(''); setExpenseDesc(''); setExpenseStore('') }}
                    className="text-subtle hover:text-content text-xs px-2 py-1.5 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Income section — direct income the homestead tables can't derive (a sale, the
              finished build itself, misc). Homestead sales tagged to the project are counted
              separately in the report; this is additive to those. */}
          <div className="border-t border-line/40 pt-3 mt-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-subtle uppercase tracking-wider">Income</h4>
              {!showAddIncome && (
                <button
                  onClick={() => setShowAddIncome(true)}
                  className="text-xs text-subtle hover:text-content transition-colors"
                >
                  + Log income
                </button>
              )}
            </div>

            {/* Income list */}
            {income.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {income.map(i => (
                  <div key={i.id} className="flex items-center justify-between text-xs group">
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <span className="text-content truncate">{i.description}</span>
                      {i.source && <span className="text-subtle shrink-0">{i.source}</span>}
                      <span className="text-subtle shrink-0">{formatExpenseDate(i.income_date)}</span>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0 ml-3">
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium tabular-nums">{fmtMoney(i.amount)}</span>
                      <button
                        onClick={() => onDeleteIncome(i.id)}
                        className="opacity-0 group-hover:opacity-100 text-subtle hover:text-red-600 dark:hover:text-red-400 transition-all"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
                <div className="flex justify-end pt-1 border-t border-line/40">
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums">{fmtMoney(totalIncome)} total</span>
                </div>
              </div>
            )}

            {income.length === 0 && !showAddIncome && (
              <p className="text-xs text-subtle mb-2">No income logged yet.</p>
            )}

            {/* Add income form */}
            {showAddIncome && (
              <div className="bg-elevated/50 rounded-xl p-3 space-y-2.5 mb-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle text-xs">$</span>
                    <input
                      autoFocus
                      type="number"
                      placeholder="0.00"
                      value={incomeAmount}
                      onChange={e => setIncomeAmount(e.target.value)}
                      step="0.01"
                      min="0"
                      className="w-full bg-elevated border border-line-strong rounded-lg pl-5 pr-2.5 py-1.5 text-sm text-content placeholder-subtle focus:outline-none focus:border-line-strong"
                    />
                  </div>
                  <input
                    type="date"
                    value={incomeDate}
                    onChange={e => setIncomeDate(e.target.value)}
                    className="appearance-none w-full bg-elevated border border-line-strong rounded-lg px-2.5 py-1.5 text-sm text-content focus:outline-none focus:border-line-strong"
                  />
                </div>
                <input
                  type="text"
                  placeholder="What was it? (sold the bench, firewood, custom work...)"
                  value={incomeDesc}
                  onChange={e => setIncomeDesc(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddIncome()}
                  className="w-full bg-elevated border border-line-strong rounded-lg px-2.5 py-1.5 text-sm text-content placeholder-subtle focus:outline-none focus:border-line-strong"
                />
                <input
                  type="text"
                  placeholder="Buyer / where sold (optional)"
                  value={incomeSource}
                  onChange={e => setIncomeSource(e.target.value)}
                  className="w-full bg-elevated border border-line-strong rounded-lg px-2.5 py-1.5 text-sm text-content placeholder-subtle focus:outline-none focus:border-line-strong"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleAddIncome}
                    disabled={savingIncome || !incomeDesc.trim() || !incomeAmount}
                    className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {savingIncome ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => { setShowAddIncome(false); setIncomeAmount(''); setIncomeDesc(''); setIncomeSource('') }}
                    className="text-subtle hover:text-content text-xs px-2 py-1.5 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Delete project */}
          <div className="border-t border-line/40 pt-2.5 mt-1 flex items-center justify-between">
            <Link
              href={`/dashboard/projects/reports/${project.id}`}
              onClick={e => e.stopPropagation()}
              className="text-xs text-subtle hover:text-content transition-colors"
            >
              View report →
            </Link>
            {confirmDelete ? (
              <div className="flex items-center gap-3">
                <span className="text-xs text-subtle">Delete this project?</span>
                <button onClick={onDelete} className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium transition-colors">Yes, delete</button>
                <button onClick={() => setConfirmDelete(false)} className="text-xs text-subtle hover:text-content transition-colors">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="text-xs text-subtle hover:text-red-600 dark:hover:text-red-400 transition-colors">
                Delete project
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
