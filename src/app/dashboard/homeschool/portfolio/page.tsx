import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Child, Subject, SchoolYear, PortfolioItem } from '@/lib/types'
import PortfolioClient from './PortfolioClient'

export default async function PortfolioPage() {
  const supabase = await createClient()
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const [
    { data: children },
    { data: subjects },
    { data: activeYears },
    { data: items },
  ] = await Promise.all([
    supabase.from('children').select('*').order('created_at'),
    supabase.from('subjects').select('*').eq('is_active', true).order('name'),
    supabase.from('school_years').select('*').eq('is_active', true),
    supabase.from('portfolio_items').select('*').order('item_date', { ascending: false }).limit(200),
  ])

  return (
    <div className="min-h-screen bg-surface text-content">
      <nav className="border-b border-line/60 px-6 py-4 flex items-center gap-3">
        <Link href="/dashboard/homeschool" className="text-subtle hover:text-content text-sm transition-colors">← Homeschool</Link>
        <span className="text-subtle">/</span>
        <span className="text-sm font-semibold text-green-600 dark:text-green-400">Portfolio</span>
      </nav>
      <PortfolioClient
        childList={(children ?? []) as Child[]}
        subjects={(subjects ?? []) as Subject[]}
        activeYears={(activeYears ?? []) as SchoolYear[]}
        items={(items ?? []) as PortfolioItem[]}
      />
    </div>
  )
}
