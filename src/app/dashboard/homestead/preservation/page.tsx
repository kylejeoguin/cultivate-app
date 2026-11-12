import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import type { PreservationLog, Child, Subject, HomesteadInput, Project } from '@/lib/types'
import PreservationClient from './PreservationClient'

export type HarvestOption = { id: string; crop_name: string; actual_harvest: string | null }

export default async function PreservationPage() {
  const supabase = await createClient()
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const [
    { data: logs },
    { data: children },
    { data: subjects },
    { data: inputData },
    { data: projectData },
    { data: harvestData },
  ] = await Promise.all([
    supabase.from('preservation_logs').select('*').order('log_date', { ascending: false }).limit(120),
    supabase.from('children').select('id, name').order('created_at'),
    supabase.from('subjects').select('id, name').eq('is_active', true),
    supabase.from('homestead_inputs').select('*').eq('section', 'preservation').order('input_date', { ascending: false }).limit(30),
    supabase.from('projects').select('id, title').order('sort_order').order('created_at', { ascending: false }),
    // Harvested crops a batch could have come from — most recent first.
    supabase.from('garden_entries').select('id, crop_name, actual_harvest').eq('status', 'harvested').order('actual_harvest', { ascending: false, nullsFirst: false }).limit(60),
  ])

  const projects = ((projectData ?? []) as Project[]).map(p => ({ id: p.id, label: p.title }))

  return (
    <PreservationClient
      initialLogs={(logs ?? []) as PreservationLog[]}
      initialInputs={(inputData ?? []) as HomesteadInput[]}
      childList={(children ?? []) as Child[]}
      subjects={(subjects ?? []) as Subject[]}
      projects={projects}
      harvests={(harvestData ?? []) as HarvestOption[]}
    />
  )
}
