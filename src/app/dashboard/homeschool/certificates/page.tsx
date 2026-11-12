import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import type { Child, SchoolYear } from '@/lib/types'
import CertificateClient from './CertificateClient'

export default async function CertificatesPage() {
  const supabase = await createClient()
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const [{ data: children }, { data: years }] = await Promise.all([
    supabase.from('children').select('*').order('created_at'),
    supabase.from('school_years').select('*').eq('is_active', true),
  ])

  return (
    <CertificateClient
      childList={(children ?? []) as Child[]}
      years={(years ?? []) as SchoolYear[]}
    />
  )
}
