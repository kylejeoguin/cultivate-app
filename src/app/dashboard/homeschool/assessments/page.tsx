import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Child } from '@/lib/types'
import AssessmentClient from './AssessmentClient'

export default async function AssessmentsPage() {
  const supabase = await createClient()
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const [{ data: children }, { data: assessments }] = await Promise.all([
    supabase.from('children').select('*').order('created_at'),
    supabase.from('assessment_logs').select('*').order('assessment_date', { ascending: false }),
  ])

  return (
    <AssessmentClient
      initialAssessments={assessments ?? []}
      childList={(children ?? []) as Child[]}
    />
  )
}
