import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import ActivitiesClient from './ActivitiesClient'
import type { Child, Subject, SchoolYear, Activity } from '@/lib/types'

export default async function ActivitiesPage() {
  const supabase = await createClient()
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const [{ data: children }, { data: subjects }, { data: activeYears }, { data: activities }] = await Promise.all([
    supabase.from('children').select('*').order('created_at'),
    supabase.from('subjects').select('*').eq('is_active', true).order('name'),
    supabase.from('school_years').select('*').eq('is_active', true),
    supabase.from('activities').select('*').order('activity_date', { ascending: false }).limit(100),
  ])

  return (
    <div className="min-h-screen bg-surface text-content">
      <nav className="border-b border-line/60 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/homeschool" className="text-subtle hover:text-content text-sm transition-colors">← Homeschool</Link>
          <span className="text-subtle">/</span>
          <span className="text-sm font-semibold text-green-600 dark:text-green-400">Activities</span>
        </div>
      </nav>
      <ActivitiesClient
        childList={(children ?? []) as Child[]}
        subjects={(subjects ?? []) as Subject[]}
        activeYears={(activeYears ?? []) as SchoolYear[]}
        activities={(activities ?? []) as Activity[]}
      />
    </div>
  )
}
