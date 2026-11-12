import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/auth'
import { getAccessInfo, sparkDailyLimit } from '@/lib/access'
import { appToday } from '@/lib/date'
import { redirect } from 'next/navigation'
import type { Child, SchoolYear } from '@/lib/types'
import { PageNav, PageContent, WorkspaceHeader } from '../../ui'
import IdeasClient from './IdeasClient'

export default async function IdeasPage() {
  const supabase = await createClient()
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const [{ data: children }, { data: years }] = await Promise.all([
    supabase.from('children').select('*').order('created_at'),
    supabase.from('school_years').select('*').eq('is_active', true),
  ])

  const childList = (children as Child[] | null) ?? []
  if (childList.length === 0) redirect('/dashboard/homeschool/setup')

  // Today's usage + this user's tier limit, so the page opens showing what's left.
  const access = await getAccessInfo()
  const limit = sparkDailyLimit(access.reason)
  const today = appToday()
  // Read the user's OWN usage row (RLS SELECT policy) purely for the on-load meter.
  // Non-critical: /api/spark is the real enforcement, so a failed read here must never
  // crash the page — default to 0 and let the endpoint report the true count on first use.
  let used = 0
  try {
    const { data: usageRow } = await supabase
      .from('spark_usage')
      .select('count')
      .eq('user_id', user.id)
      .eq('usage_date', today)
      .maybeSingle()
    used = (usageRow?.count as number | undefined) ?? 0
  } catch {
    used = 0
  }

  const today_label = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="min-h-screen bg-surface text-content">
      <PageNav
        back="/dashboard/homeschool"
        backLabel="School"
        current="Ideas"
        accent="text-green-600 dark:text-green-400"
        actions={<span className="text-subtle text-xs hidden sm:inline">{today_label}</span>}
      />
      <PageContent>
        <WorkspaceHeader
          icon="✦"
          title="Spark ideas"
          subtitle="Stuck on what to do today? Get activity ideas for the whole crew, or tailored to one student."
          accent="green"
        />
        <IdeasClient
          childList={childList}
          years={(years as SchoolYear[] | null) ?? []}
          initialUsed={used}
          limit={limit}
          isTrial={access.reason === 'trialing'}
        />
      </PageContent>
    </div>
  )
}
