import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import GradesClient from './GradesClient'
import type { Child, Subject, SchoolYear } from '@/lib/types'

interface Grade {
  id: string
  subject_id: string
  child_id: string
  period: string | null
  value: string | null
  numeric_value: number | null
  notes: string | null
  graded_at: string
}

export default async function GradesPage() {
  const supabase = await createClient()
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const { data: children } = await supabase.from('children').select('*').order('created_at')
  if (!children || children.length === 0) redirect('/dashboard/homeschool/setup')

  const { data: subjects } = await supabase.from('subjects').select('*').eq('is_active', true).order('name')
  const { data: grades } = await supabase.from('grades').select('*').order('graded_at', { ascending: false })
  const { data: activeYears } = await supabase.from('school_years').select('*').eq('is_active', true)

  return (
    <GradesClient
      childList={children as Child[]}
      subjects={(subjects ?? []) as Subject[]}
      grades={(grades ?? []) as Grade[]}
      activeYears={(activeYears ?? []) as SchoolYear[]}
    />
  )
}
