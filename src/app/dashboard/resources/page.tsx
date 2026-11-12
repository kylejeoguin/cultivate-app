import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/auth'
import { getAccessInfo, canDownloadSubscriberResource } from '@/lib/access'
import { redirect } from 'next/navigation'
import type { PlatformResource, ResourceSection } from '@/lib/types'
import ResourcesClient, { type ResourceCardData } from './ResourcesClient'

export default async function ResourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const supabase = await createClient()
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const tab: ResourceSection =
    params.tab === 'homestead' || params.tab === 'home_diy'
      ? params.tab
      : 'homeschool'

  const [{ data }, { reason }] = await Promise.all([
    supabase
      .from('platform_resources')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .order('created_at'),
    getAccessInfo(),
  ])

  const rows = (data ?? []) as PlatformResource[]
  const canSubscriberDownload = canDownloadSubscriberResource(reason)

  // `file_url` NEVER crosses to the client. The card only needs to know whether a file exists
  // and whether THIS viewer may have it; the bytes come from /api/resources/[id]/download,
  // which re-checks entitlement server-side. Shipping the path would hand every signed-in user
  // the object name for every gated pack — RLS returns all active rows to anyone authenticated.
  const resources: ResourceCardData[] = rows.map(r => ({
    id: r.id,
    title: r.title,
    description: r.description,
    section: r.section,
    tier: r.tier,
    file_type: r.file_type,
    thumbnail_emoji: r.thumbnail_emoji,
    has_file: !!r.file_url,
    can_download: !!r.file_url && (r.tier === 'free' || canSubscriberDownload),
  }))

  return <ResourcesClient resources={resources} defaultTab={tab} />
}
