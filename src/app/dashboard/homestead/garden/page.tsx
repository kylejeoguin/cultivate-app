import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import type { GardenEntry, Child, Subject, Project, HomesteadInput, GardenBed } from '@/lib/types'
import GardenClient from './GardenClient'

export default async function GardenPage() {
  const supabase = await createClient()
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const [
    { data: entries },
    { data: children },
    { data: subjects },
    { data: projectData },
    { data: inputData },
    { data: beds },
  ] = await Promise.all([
    supabase.from('garden_entries').select('*').order('created_at', { ascending: false }),
    supabase.from('children').select('id, name').order('created_at'),
    supabase.from('subjects').select('id, name').eq('is_active', true),
    supabase.from('projects').select('id, title, status').eq('category', 'homestead').neq('status', 'done').order('title'),
    supabase.from('homestead_inputs').select('*').eq('section', 'garden').order('input_date', { ascending: false }).limit(30),
    supabase.from('garden_beds').select('*').order('name'),
  ])

  return (
    <GardenClient
      initialEntries={(entries ?? []) as GardenEntry[]}
      initialInputs={(inputData ?? []) as HomesteadInput[]}
      initialBeds={(beds ?? []) as GardenBed[]}
      childList={(children ?? []) as Child[]}
      subjects={(subjects ?? []) as Subject[]}
      projects={(projectData ?? []) as Pick<Project, 'id' | 'title' | 'status'>[]}
    />
  )
}
