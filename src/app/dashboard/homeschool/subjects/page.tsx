import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import SubjectsClient from './SubjectsClient'
import type { Child, Subject, SchoolYear } from '@/lib/types'

export default async function SubjectsPage() {
  const supabase = await createClient()
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const { data: children } = await supabase
    .from('children')
    .select('*')
    .order('created_at')

  if (!children || children.length === 0) redirect('/dashboard/homeschool/setup')

  const { data: subjects } = await supabase
    .from('subjects')
    .select('*')
    .order('name')

  const { data: activeYears } = await supabase
    .from('school_years')
    .select('*')
    .eq('is_active', true)

  return (
    <SubjectsClient
      childList={children as Child[]}
      subjects={(subjects ?? []) as Subject[]}
      activeYears={(activeYears ?? []) as SchoolYear[]}
    />
  )
}
