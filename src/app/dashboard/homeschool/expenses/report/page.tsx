import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Child } from '@/lib/types'
import PrintButton from '@/app/dashboard/PrintButton'
import PrintFrame from '@/app/dashboard/PrintFrame'

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

// Value tokens here MUST match the values written by ExpensesClient.tsx.
const CATEGORIES: { value: string; label: string }[] = [
  { value: 'curriculum',    label: 'Curriculum & Books' },
  { value: 'supplies',      label: 'Supplies & Materials' },
  { value: 'technology',    label: 'Technology' },
  { value: 'coop_classes',  label: 'Co-op & Classes' },
  { value: 'field_trips',   label: 'Field Trips' },
  { value: 'testing',       label: 'Testing & Evaluations' },
  { value: 'subscriptions', label: 'Subscriptions & Apps' },
  { value: 'other',         label: 'Other' },
]
const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label]))

function fmt(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function ExpenseReportPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>
}) {
  const supabase = await createClient()
  const user = await getCachedUser()
  if (!user) redirect('/login')

  // searchParams is a Promise and must be awaited — this page was the only one in the app
  // still reading it synchronously, which threw at request time. Every other route already
  // uses this shape. A non-numeric ?year= falls back to the current year rather than
  // sending NaN into the tax_year filter.
  const { year } = await searchParams
  const parsedYear = year ? Number.parseInt(year, 10) : NaN
  const taxYear = Number.isFinite(parsedYear) ? parsedYear : new Date().getFullYear()

  const [{ data: expenses }, { data: children }] = await Promise.all([
    supabase.from('homeschool_expenses').select('*')
      .eq('tax_year', taxYear)
      .order('expense_date', { ascending: true }),
    supabase.from('children').select('*').order('created_at'),
  ])

  const expenseList = (expenses ?? []) as Expense[]
  const childList = (children ?? []) as Child[]

  const childMap: Record<string, string> = {}
  childList.forEach(c => { childMap[c.id] = c.name })

  const total = expenseList.reduce((sum, e) => sum + e.amount, 0)

  // Group by category
  const byCategory: Record<string, { expenses: Expense[]; total: number }> = {}
  CATEGORIES.forEach(c => { byCategory[c.value] = { expenses: [], total: 0 } })

  expenseList.forEach(e => {
    const cat = e.category in byCategory ? e.category : 'other'
    byCategory[cat].expenses.push(e)
    byCategory[cat].total += e.amount
  })

  const generatedDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          html, body { background: white !important; color: black !important; }
        }
      `}</style>

      {/* Toolbar */}
      <div className="no-print fixed top-0 left-0 right-0 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between z-10 shadow-sm">
        <Link href="/dashboard/homeschool/expenses" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
          ← Back to Expenses
        </Link>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {[new Date().getFullYear() - 1, new Date().getFullYear()].map(yr => (
              <a key={yr} href={`?year=${yr}`}
                className={`text-sm px-3 py-1 rounded-lg transition-colors ${taxYear === yr ? 'bg-green-700 text-white' : 'text-gray-500 hover:text-gray-800 bg-gray-100'}`}>
                {yr}
              </a>
            ))}
          </div>
          <PrintButton />
        </div>
      </div>

      <PrintFrame>
      <main className="max-w-2xl mx-auto px-8 pt-24 pb-16">
        {/* Header */}
        <div className="text-center mb-10 pb-6 border-b-2 border-gray-400">
          <p className="text-xs uppercase tracking-widest text-gray-500 mb-2">Home Education · Cultivate</p>
          <h1 className="text-3xl font-bold tracking-tight">Homeschool Expense Report</h1>
          <p className="text-gray-600 mt-2">Tax Year {taxYear}</p>
        </div>

        {/* Summary */}
        <div className="mb-10">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-800 pb-2 border-b-2 border-gray-400 bg-gray-50 px-2 py-2 -mx-2 mb-3">Summary</h2>
          <div className="grid grid-cols-2 gap-x-8 text-sm mb-4">
            <div className="flex justify-between border-b border-gray-200 py-2">
              <span className="text-gray-700">Tax Year</span>
              <span className="font-semibold">{taxYear}</span>
            </div>
            <div className="flex justify-between border-b border-gray-200 py-2">
              <span className="text-gray-700">Total Expenses</span>
              <span className="font-bold">${total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-b border-gray-200 py-2">
              <span className="text-gray-700">Total Entries</span>
              <span className="font-semibold">{expenseList.length}</span>
            </div>
            <div className="flex justify-between gap-4 border-b border-gray-200 py-2">
              <span className="text-gray-700 shrink-0">Students</span>
              <span className="font-semibold text-right">{childList.map(c => c.name).join(', ') || '—'}</span>
            </div>
          </div>

          {/* By category summary */}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gray-300">
                <th className="py-2 text-left font-bold text-gray-800">Category</th>
                <th className="py-2 text-center font-bold text-gray-800">Entries</th>
                <th className="py-2 text-right font-bold text-gray-800">Total</th>
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.filter(c => byCategory[c.value].expenses.length > 0).map(c => (
                <tr key={c.value} className="border-b border-gray-200">
                  <td className="py-2 text-gray-900">{c.label}</td>
                  <td className="py-2 text-center text-gray-600">{byCategory[c.value].expenses.length}</td>
                  <td className="py-2 text-right font-semibold">${byCategory[c.value].total.toFixed(2)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-gray-400">
                <td className="py-2 font-bold text-gray-900">Total</td>
                <td className="py-2 text-center font-bold">{expenseList.length}</td>
                <td className="py-2 text-right font-bold">${total.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Detail by category */}
        {CATEGORIES.filter(c => byCategory[c.value].expenses.length > 0).map(c => (
          <div key={c.value} className="mb-8">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-800 pb-2 border-b-2 border-gray-400 bg-gray-50 px-2 py-2 -mx-2 mb-3">
              {c.label} — ${byCategory[c.value].total.toFixed(2)}
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-300">
                  <th className="py-1.5 text-left font-semibold text-gray-700">Date</th>
                  <th className="py-1.5 text-left font-semibold text-gray-700">Description</th>
                  <th className="py-1.5 text-left font-semibold text-gray-700">Student</th>
                  <th className="py-1.5 text-right font-semibold text-gray-700">Amount</th>
                </tr>
              </thead>
              <tbody>
                {byCategory[c.value].expenses.map(e => (
                  <tr key={e.id} className="border-b border-gray-100">
                    <td className="py-1.5 text-gray-600 whitespace-nowrap">{fmt(e.expense_date)}</td>
                    <td className="py-1.5 text-gray-900">
                      {e.description}
                      {e.vendor && <span className="text-gray-500 ml-1">· {e.vendor}</span>}
                    </td>
                    <td className="py-1.5 text-gray-600">
                      {e.child_id ? (childMap[e.child_id] ?? '—') : 'Household'}
                    </td>
                    <td className="py-1.5 text-right font-medium">${e.amount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {expenseList.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            No expenses logged for tax year {taxYear}.
          </div>
        )}

        {/* Disclaimer */}
        <div className="text-xs text-gray-400 border-t-2 border-gray-300 pt-4 space-y-1 mt-10">
          <p>Generated {generatedDate} · Cultivate · mycultivate.app</p>
          <p>This report is for reference only. Consult a qualified tax professional to determine which expenses are deductible in your state and situation. Tax laws vary and change — Cultivate does not provide tax advice.</p>
        </div>
      </main>
      </PrintFrame>
    </div>
  )
}
