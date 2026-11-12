import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import CurriculumClient from './CurriculumClient'
import type { Child, Subject, SchoolYear, PlannerWeek, PlannerItem } from '@/lib/types'

export default async function CurriculumPage() {
  const supabase = await createClient()
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const { data: children } = await supabase
    .from('children')
    .select('*')
    .order('created_at')

  if (!children || children.length === 0) redirect('/dashboard/homeschool/setup')

  const [{ data: subjects }, { data: schoolYears },
         { data: plannerWeeks }, { data: plannerItems }] =
    await Promise.all([
      supabase.from('subjects').select('*').eq('is_active', true).order('name'),
      // ALL years (not just active) so the planner can switch between past/current/future.
      supabase.from('school_years').select('*').order('start_date'),
      supabase.from('planner_weeks').select('*'),
      supabase.from('planner_items').select('*'),
    ])

  return (
    <CurriculumClient
      childList={children as Child[]}
      subjects={(subjects ?? []) as Subject[]}
      schoolYears={(schoolYears ?? []) as SchoolYear[]}
      plannerWeeks={(plannerWeeks ?? []) as PlannerWeek[]}
      plannerItems={(plannerItems ?? []) as PlannerItem[]}
    />
  )
}
