import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import type { HomesteadChore, Child, Subject } from '@/lib/types'
import ChoresClient from './ChoresClient'

export default async function ChoresPage() {
  const supabase = await createClient()
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const [{ data: chores }, { data: children }, { data: subjects }] = await Promise.all([
    supabase.from('homestead_chores').select('*').eq('is_active', true).order('next_due_date', { ascending: true }),
    supabase.from('children').select('id, name').order('created_at'),
    supabase.from('subjects').select('id, name').eq('is_active', true).order('name'),
  ])

  return (
    <ChoresClient
      initialChores={(chores ?? []) as HomesteadChore[]}
      childList={(children ?? []) as Child[]}
      subjects={(subjects ?? []) as Subject[]}
    />
  )
}
