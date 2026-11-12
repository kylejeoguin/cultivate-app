import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import type { Project, ProjectTask, ProjectExpense, ProjectIncome, ProjectCategory } from '@/lib/types'
import ProjectsClient from './ProjectsClient'

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>
}) {
  const supabase = await createClient()
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const category = (params.category === 'homestead' || params.category === 'home_diy')
    ? params.category as ProjectCategory
    : null

  const [{ data: projects }, { data: tasks }, { data: expenses }, { data: income }] = await Promise.all([
    supabase.from('projects').select('*').order('sort_order').order('created_at', { ascending: false }),
    supabase.from('project_tasks').select('*').order('sort_order').order('created_at'),
    supabase.from('project_expenses').select('*').order('expense_date', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('project_income').select('*').order('income_date', { ascending: false }).order('created_at', { ascending: false }),
  ])

  return (
    <ProjectsClient
      initialProjects={(projects ?? []) as Project[]}
      initialTasks={(tasks ?? []) as ProjectTask[]}
      initialExpenses={(expenses ?? []) as ProjectExpense[]}
      initialIncome={(income ?? []) as ProjectIncome[]}
      defaultCategory={category}
    />
  )
}
