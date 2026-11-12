'use client'

import { useToday } from '@/lib/use-today'
import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Child } from '@/lib/types'

const CATEGORIES = [
  { value: 'curriculum',   label: 'Curriculum & Books',       emoji: '📚' },
  { value: 'supplies',     label: 'Supplies & Materials',     emoji: '✏️' },
  { value: 'technology',   label: 'Technology',               emoji: '💻' },
  { value: 'coop_classes', label: 'Co-op & Classes',          emoji: '🏫' },
  { value: 'field_trips',  label: 'Field Trips',              emoji: '🚌' },
  { value: 'testing',      label: 'Testing & Evaluations',    emoji: '📝' },
  { value: 'subscriptions',label: 'Subscriptions & Apps',     emoji: '📱' },
  { value: 'other',        label: 'Other',                    emoji: '📦' },
]

interface Expense {
  id: string
  child_id: string | null
  amount: number
  expense_date: string
  tax_year: number
  category: string
  description: string
  vendor: string | null
}

interface SummaryByCategory {
  category: string
  total: number
  count: number
}

function catLabel(value: string) {
  return CATEGORIES.find(c => c.value === value)?.label ?? value
}
function catEmoji(value: string) {
  return CATEGORIES.find(c => c.value === value)?.emoji ?? '📦'
}
function formatMoney(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}
function currentTaxYear() {
  return new Date().getFullYear()
}

export default function ExpensesClient({
  initialExpenses,
  childList,
  taxYear: initialTaxYear,
}: {
  initialExpenses: Expense[]
  childList: Child[]
  taxYear: number
}) {
  const supabase = createClient()
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses)
  const [taxYear, setTaxYear] = useState(initialTaxYear)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Form state
  const [amount, setAmount] = useState('')
  const [date, setDate] = useToday()
  const [category, setCategory] = useState('curriculum')
  const [description, setDescription] = useState('')
  const [vendor, setVendor] = useState('')
  const [childId, setChildId] = useState<string>('household')

  const yearExpenses = expenses.filter(e => e.tax_year === taxYear)
  const totalYear = yearExpenses.reduce((sum, e) => sum + e.amount, 0)

  const summaryByCategory: SummaryByCategory[] = CATEGORIES.map(cat => ({
    category: cat.value,
    total: yearExpenses.filter(e => e.category === cat.value).reduce((s, e) => s + e.amount, 0),
    count: yearExpenses.filter(e => e.category === cat.value).length,
  })).filter(s => s.total > 0).sort((a, b) => b.total - a.total)

  async function handleAdd() {
    if (!amount || !description.trim()) { setError('Amount and description are required.'); return }
    setSaving(true)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const parsedDate = new Date(date + 'T12:00:00')
    const year = parsedDate.getFullYear()

    const { data, error: err } = await supabase.from('homeschool_expenses').insert({
      user_id: user.id,
      child_id: childId !== 'household' ? childId : null,
      amount: parseFloat(amount),
      expense_date: date,
      tax_year: year,
      category,
      description: description.trim(),
      vendor: vendor.trim() || null,
    }).select().single()

    if (err) { setError(err.message); setSaving(false); return }
    setExpenses(prev => [data as Expense, ...prev])
    setAmount(''); setDescription(''); setVendor(''); setShowForm(false)
    setSaving(false)
  }

  async function deleteExpense(id: string) {
    if (!confirm('Delete this expense?')) return
    await supabase.from('homeschool_expenses').delete().eq('id', id)
    setExpenses(prev => prev.filter(e => e.id !== id))
  }

  const availableYears = [currentTaxYear(), currentTaxYear() - 1, currentTaxYear() - 2]

  return (
    <div className="min-h-screen bg-surface text-content">
      <nav className="border-b border-line/60 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/homeschool" className="text-subtle hover:text-content text-sm transition-colors">← Homeschool</Link>
          <span className="text-subtle">/</span>
          <span className="text-sm font-semibold">Expenses</span>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-sm font-semibold text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 transition-colors"
        >
          {showForm ? 'Cancel' : '+ Add expense'}
        </button>
      </nav>

      <main className="max-w-2xl lg:max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold mb-1">Homeschool Expenses</h2>
            <p className="text-muted text-sm">
              Track curriculum, supplies, and other deductible expenses.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={`/dashboard/homeschool/expenses/report?year=${taxYear}`}
              target="_blank"
              className="text-xs text-muted hover:text-green-600 dark:hover:text-green-400 border border-line-strong hover:border-green-200 dark:hover:border-green-800 px-3 py-1.5 rounded-lg transition-colors"
            >
              ↓ PDF Report
            </Link>
            <select
              value={taxYear}
              onChange={e => setTaxYear(parseInt(e.target.value))}
              className="bg-card border border-line-strong rounded-lg px-3 py-1.5 text-sm text-content focus:outline-none focus:border-green-600"
            >
              {availableYears.map(y => (
                <option key={y} value={y}>{y} Tax Year</option>
              ))}
            </select>
          </div>
        </div>

        {/* Add expense form */}
        {showForm && (
          <div className="bg-card border border-green-200 dark:border-green-900/50 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-green-600 dark:text-green-400">Add Expense</h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="expense-amount" className="block text-xs text-subtle mb-1">Amount *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle text-sm">$</span>
                  <input
                    id="expense-amount"
                    type="number" value={amount} onChange={e => setAmount(e.target.value)}
                    min="0" step="0.01" placeholder="0.00" autoFocus
                    className="w-full bg-elevated border border-line-strong rounded-lg pl-7 pr-3 h-10 text-content text-sm focus:outline-none focus:border-green-600"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-subtle mb-1" htmlFor="date-1">Date *</label>
                <input id="date-1"
                  type="date" value={date} onChange={e => setDate(e.target.value)}
                  className="w-full appearance-none bg-elevated border border-line-strong rounded-lg px-3 h-10 text-content text-sm focus:outline-none focus:border-green-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-subtle mb-1" htmlFor="category-2">Category *</label>
              <select id="category-2"
                value={category} onChange={e => setCategory(e.target.value)}
                className="w-full bg-elevated border border-line-strong rounded-lg px-3 h-10 text-content text-sm focus:outline-none focus:border-green-600"
              >
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.emoji} {c.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-subtle mb-1" htmlFor="description-3">Description *</label>
              <input id="description-3"
                type="text" value={description} onChange={e => setDescription(e.target.value)}
                placeholder="e.g. Saxon Math 7/6 student edition"
                className="w-full bg-elevated border border-line-strong rounded-lg px-3 h-10 text-content text-sm focus:outline-none focus:border-green-600"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-subtle mb-1" htmlFor="vendor-optional-4">Vendor (optional)</label>
                <input id="vendor-optional-4"
                  type="text" value={vendor} onChange={e => setVendor(e.target.value)}
                  placeholder="e.g. Rainbow Resource"
                  className="w-full bg-elevated border border-line-strong rounded-lg px-3 h-10 text-content text-sm focus:outline-none focus:border-green-600"
                />
              </div>
              <div>
                <label className="block text-xs text-subtle mb-1" htmlFor="child-optional-5">Child (optional)</label>
                <select id="child-optional-5"
                  value={childId} onChange={e => setChildId(e.target.value)}
                  className="w-full bg-elevated border border-line-strong rounded-lg px-3 h-10 text-content text-sm focus:outline-none focus:border-green-600"
                >
                  <option value="household">Whole household</option>
                  {childList.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}

            <button
              onClick={handleAdd} disabled={saving}
              className="w-full bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
            >
              {saving ? 'Saving...' : 'Add expense'}
            </button>
          </div>
        )}

        {/* Year summary */}
        {yearExpenses.length > 0 && (
          <>
            {/* Total card */}
            <div className="bg-card border border-line rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs text-subtle uppercase tracking-widest mb-1">Total {taxYear}</p>
                  <p className="text-3xl font-bold text-green-600 dark:text-green-400">{formatMoney(totalYear)}</p>
                  <p className="text-xs text-subtle mt-1">{yearExpenses.length} expense{yearExpenses.length !== 1 ? 's' : ''} logged</p>
                </div>
              </div>

              {/* By category */}
              <div className="space-y-2 pt-4 border-t border-line">
                {summaryByCategory.map(s => {
                  const pct = Math.round((s.total / totalYear) * 100)
                  return (
                    <div key={s.category} className="flex items-center gap-3">
                      <span className="text-base w-6 shrink-0">{catEmoji(s.category)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs text-content truncate">{catLabel(s.category)}</span>
                          <span className="text-xs text-muted ml-2 shrink-0">{formatMoney(s.total)}</span>
                        </div>
                        <div className="w-full bg-elevated rounded-full h-1">
                          <div className="bg-green-700 h-1 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Tax disclaimer */}
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl px-4 py-3">
              <p className="text-xs text-amber-800/80 dark:text-amber-300/80 leading-relaxed">
                <strong className="text-amber-800 dark:text-amber-300">For reference only.</strong>{' '}
                Homeschool expense deductibility varies by state and federal tax situation.
                Consult a tax professional to determine what you can deduct. Cultivate tracks
                what you spent — your accountant determines what qualifies.
              </p>
            </div>

            {/* Expense list */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-subtle uppercase tracking-widest">All {taxYear} expenses</p>
              {yearExpenses.map(expense => {
                const child = childList.find(c => c.id === expense.child_id)
                return (
                  <div key={expense.id} className="bg-card/60 border border-line rounded-xl px-4 py-3 flex items-center gap-3">
                    <span className="text-xl shrink-0">{catEmoji(expense.category)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-content font-medium truncate">{expense.description}</p>
                      <p className="text-xs text-subtle mt-0.5">
                        {catLabel(expense.category)}
                        {expense.vendor ? ` · ${expense.vendor}` : ''}
                        {child ? ` · ${child.name}` : ''}
                        {' · '}
                        {new Date(expense.expense_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-green-600 dark:text-green-400 shrink-0">{formatMoney(expense.amount)}</span>
                    <button
                      onClick={() => deleteExpense(expense.id)}
                      title="Delete expense"
                      aria-label="Delete expense"
                      className="text-subtle hover:text-red-600 dark:hover:text-red-400 transition-colors shrink-0 text-sm leading-none"
                    >
                      ×
                    </button>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* Empty state */}
        {yearExpenses.length === 0 && (
          <div className="text-center py-16 space-y-4">
            <div className="text-5xl">🧾</div>
            <div>
              <p className="font-semibold text-content mb-1">No expenses logged for {taxYear}</p>
              <p className="text-subtle text-sm max-w-xs mx-auto leading-relaxed">
                Track curriculum, supplies, field trips, and co-op fees.
                Everything you spend on homeschooling in one place for tax time.
              </p>
            </div>
            <button
              onClick={() => setShowForm(true)}
              className="inline-block px-5 py-2.5 bg-green-100 dark:bg-green-800/60 hover:bg-green-200 dark:hover:bg-green-700/60 border border-green-300 dark:border-green-700/50 text-green-800 dark:text-green-300 rounded-lg text-sm font-medium transition-colors"
            >
              Add your first expense
            </button>
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl px-4 py-3 max-w-sm mx-auto">
              <p className="text-xs text-amber-800/80 dark:text-amber-300/80 leading-relaxed">
                Homeschool expense deductibility varies. Consult a tax professional to determine what qualifies. Cultivate tracks what you spent.
              </p>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
