import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import type { LivestockLog, Child, Subject, Project, HomesteadInput, LivestockAnimal } from '@/lib/types'
import LivestockClient from './LivestockClient'

export default async function LivestockPage() {
  const supabase = await createClient()
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const [
    { data: logs },
    { data: children },
    { data: subjects },
    { data: projectData },
    { data: inputData },
    { data: animals },
  ] = await Promise.all([
    supabase.from('livestock_logs').select('*').order('log_date', { ascending: false }).limit(120),
    supabase.from('children').select('id, name').order('created_at'),
    supabase.from('subjects').select('id, name').eq('is_active', true),
    supabase.from('projects').select('id, title, status').eq('category', 'homestead').neq('status', 'done').order('title'),
    supabase.from('homestead_inputs').select('*').eq('section', 'livestock').order('input_date', { ascending: false }).limit(30),
    supabase.from('livestock_animals').select('*').order('name'),
  ])

  return (
    <LivestockClient
      initialLogs={(logs ?? []) as LivestockLog[]}
      initialInputs={(inputData ?? []) as HomesteadInput[]}
      initialAnimals={(animals ?? []) as LivestockAnimal[]}
      childList={(children ?? []) as Child[]}
      subjects={(subjects ?? []) as Subject[]}
      projects={(projectData ?? []) as Pick<Project, 'id' | 'title' | 'status'>[]}
    />
  )
}
