import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import type { Child, Subject, SchoolYear } from '@/lib/types'
import HistoryClient from './HistoryClient'

export default async function HistoryPage() {
  const supabase = await createClient()
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const { data: children } = await supabase.from('children').select('*').order('created_at')
  if (!children || children.length === 0) redirect('/dashboard/homeschool/setup')

  const { data: logs } = await supabase
    .from('daily_log')
    .select('*')
    .order('log_date', { ascending: false })
    .limit(120)

  const { data: subjects } = await supabase.from('subjects').select('*')
  const { data: activeYears } = await supabase.from('school_years').select('*').eq('is_active', true)

  return (
    <HistoryClient
      initialLogs={logs ?? []}
      childList={children as Child[]}
      subjects={(subjects ?? []) as Subject[]}
      activeYears={(activeYears ?? []) as SchoolYear[]}
    />
  )
}
