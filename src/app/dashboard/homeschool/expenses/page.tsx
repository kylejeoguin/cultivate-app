import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import type { Child } from '@/lib/types'
import ExpensesClient from './ExpensesClient'

export const metadata = {
  title: 'Homeschool Expenses · Cultivate',
}

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

export default async function ExpensesPage() {
  const supabase = await createClient()
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const [
    { data: expenses },
    { data: children },
  ] = await Promise.all([
    supabase
      .from('homeschool_expenses')
      .select('*')
      .order('expense_date', { ascending: false }),
    supabase
      .from('children')
      .select('*')
      .order('created_at'),
  ])

  const currentTaxYear = new Date().getFullYear()

  return (
    <ExpensesClient
      initialExpenses={(expenses ?? []) as Expense[]}
      childList={(children ?? []) as Child[]}
      taxYear={currentTaxYear}
    />
  )
}
