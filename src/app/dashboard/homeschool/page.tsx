import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Child, Subject } from '@/lib/types'
import {
  PageNav, PageContent, SectionHeader,
  WorkspaceHeader, SnapshotStats, SubAreaGrid, ReportsBlock,
  type SubArea, type ReportLink,
} from '../ui'

// School sub-areas, grouped by the homeschool workflow: Plan → Track → Assess → (Reports below).
// Same NavCard tile shape in each group (§3.2).
const PLAN_MANAGE: SubArea[] = [
  { title: 'Weekly Planner', description: 'Plan your week', href: '/dashboard/homeschool/curriculum', icon: '🗓' },
  { title: 'Subjects', description: 'Manage your subject list', href: '/dashboard/homeschool/subjects', icon: '📚' },
  { title: 'Manage students', description: 'Add or edit students', href: '/dashboard/account#children', icon: '👥' },
  { title: 'Books & Curriculum', description: 'Track what your family uses', href: '/dashboard/homeschool/resources', icon: '📔' },
]

const TRACK: SubArea[] = [
  { title: 'Attendance', description: 'Calendar & days', href: '/dashboard/homeschool/attendance', icon: '📅' },
  { title: 'History', description: 'Past school days', href: '/dashboard/homeschool/history', icon: '📓' },
  { title: 'Activities', description: 'Field trips & co-ops', href: '/dashboard/homeschool/activities', icon: '🏕' },
  // Chores belong here as much as in Household. A completed chore with a child named already
  // flows into that child's hours, subjects and transcript — chore_completions carries
  // school_credit/child_ids/credit_hours and BOTH the reports and transcript pages query it.
  // It was reachable only from the Homestead section, i.e. filed under the one word we removed
  // from the front door for turning homeschool parents away.
  { title: 'Chores', description: 'Jobs that count as school', href: '/dashboard/homestead/chores', icon: '🔁' },
  { title: 'Expenses', description: 'Track deductible costs', href: '/dashboard/homeschool/expenses', icon: '🧾' },
]

const ASSESS: SubArea[] = [
  { title: 'Grades', description: 'Progress & grades', href: '/dashboard/homeschool/grades', icon: '📊' },
  { title: 'Assessments', description: 'Tests & evaluations', href: '/dashboard/homeschool/assessments', icon: '📋' },
  { title: 'Portfolio', description: 'Work samples & featured', href: '/dashboard/homeschool/portfolio', icon: '📁' },
]

// Outputs — records, exports, and keepsakes you generate/print (document-card style).
const REPORT_LINKS: ReportLink[] = [
  { label: 'Reports', description: 'Compliance & hours', href: '/dashboard/homeschool/reports', icon: '📄' },
  { label: 'Transcript', description: 'Download PDF', href: '/dashboard/homeschool/transcript', icon: '🎓' },
  { label: 'Certificates', description: 'Print achievement awards', href: '/dashboard/homeschool/certificates', icon: '🏅' },
  { label: 'Yearbook', description: 'End-of-year memory book', href: '/dashboard/yearbook', icon: '📖' },
]

export default async function HomeschoolPage() {
  const supabase = await createClient()
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const thirtyISO = thirtyDaysAgo.toISOString().split('T')[0]

  const [
    { data: children },
    { data: subjects },
    { data: recentLogs },
  ] = await Promise.all([
    supabase.from('children').select('*').order('created_at'),
    supabase.from('subjects').select('*').eq('is_active', true),
    supabase.from('daily_log')
      .select('log_date, hours')
      .gte('log_date', thirtyISO)
      .order('log_date', { ascending: false })
      .limit(60),
  ])

  const hasSetup = children && children.length > 0
  if (!hasSetup) {
    redirect('/dashboard/homeschool/setup')
  }

  const childList = children as Child[]
  const subjectList = (subjects as Subject[] | null) ?? []

  const logs = (recentLogs ?? []) as { log_date: string; hours: number | null }[]

  // Stats (last 30 days)
  const daysLogged = new Set(logs.map(l => l.log_date)).size
  const hoursSum = logs.reduce((sum, l) => sum + (l.hours ?? 0), 0)

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  const stats = [
    { value: childList.length, label: 'Students', accent: 'green' as const },
    { value: subjectList.length, label: 'Subjects', accent: 'green' as const },
    { value: daysLogged, label: 'Days · 30d', accent: 'green' as const },
    { value: hoursSum % 1 === 0 ? hoursSum : hoursSum.toFixed(1), label: 'Hours · 30d', accent: 'green' as const },
  ]

  return (
    <div className="min-h-screen bg-surface text-content">
      <PageNav
        back="/dashboard"
        backLabel="Today"
        current="Kids"
        accent="text-green-600 dark:text-green-400"
        actions={<span className="text-subtle text-xs hidden sm:inline">{today}</span>}
      />

      <PageContent>
        <WorkspaceHeader
          icon="📚"
          title="Kids"
          subtitle={childList.map(c => c.name).join(', ')}
          accent="green"
          addHref="/dashboard"
          addLabel="+ Log today"
          reportsHref="/dashboard/homeschool/reports"
        />

        <SnapshotStats stats={stats} />

        <div className="space-y-8">
          {/* Spark ideas — prominent planning aid at the top; its own page (group + per-student). */}
          <Link
            href="/dashboard/homeschool/ideas"
            className="flex items-center gap-4 bg-green-50 border border-green-200 dark:bg-green-950/20 dark:border-green-800/40 rounded-xl px-5 py-4 hover:border-green-300 dark:hover:border-green-700/60 transition-all group"
          >
            <span className="text-2xl shrink-0">✦</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-green-800 dark:text-green-300">Spark ideas</div>
              <div className="text-xs text-green-700/70 dark:text-green-400/70">Stuck on today? Get activity ideas for the whole family or one student.</div>
            </div>
            <span className="text-green-600 dark:text-green-400 text-lg shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">→</span>
          </Link>

          <div>
            <SectionHeader label="Plan & manage" />
            <SubAreaGrid items={PLAN_MANAGE} cols={3} accent="green" />
          </div>

          <div>
            <SectionHeader label="Track" />
            <SubAreaGrid items={TRACK} cols={3} accent="green" />
          </div>

          <div>
            <SectionHeader label="Assess" />
            <SubAreaGrid items={ASSESS} cols={3} accent="green" />
          </div>

          <div>
            <SectionHeader label="Reports & keepsakes" />
            <ReportsBlock accent="green" links={REPORT_LINKS} />
          </div>
        </div>
      </PageContent>
    </div>
  )
}
