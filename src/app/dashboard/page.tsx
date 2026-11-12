import { createClient } from '@/lib/supabase/server'
import { toDueItems } from '@/lib/dueItems'
import { getCachedUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AccountMenu from './AccountMenu'
import CheckoutBanner from './CheckoutBanner'
import Greeting from './Greeting'
import UniversalLogForm from './log/UniversalLogForm'
import { DueList } from './ui'
import type { StateRequirement } from '@/lib/types'
import { Suspense } from 'react'

function daysAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr + 'T12:00:00').getTime()) / 86400000)
  if (diff <= 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff <= 6) return `${diff}d ago`
  if (diff <= 13) return 'Last week'
  return `${Math.floor(diff / 7)}w ago`
}

function isStale(dateStr: string, days: number) {
  return Math.floor((Date.now() - new Date(dateStr + 'T12:00:00').getTime()) / 86400000) >= days
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const onboardingDone = user.user_metadata?.onboarding_completed === true
  if (!onboardingDone) {
    const { data: existingChildren } = await supabase.from('children').select('id').limit(1)
    if (!existingChildren || existingChildren.length === 0) {
      redirect('/dashboard/onboarding')
    }
  }

  const [
    { data: recentLogs },
    { data: recentLivestock },
    { data: overdue },
    { data: children },
    { data: activeProjects },
    { data: allLogs },
    { data: sub },
    // ── universal-log form data (was fetched on the old /dashboard/log page) ──
    { data: subjects },
    { data: activeYears },
    { data: stateReqs },
    { data: equipmentForLog },
    { data: projectsForLog },
    { data: dueChores },
    { data: choresForLog },
  ] = await Promise.all([
    supabase.from('daily_log').select('log_date, child_id, hours').order('log_date', { ascending: false }).limit(1),
    supabase.from('livestock_logs').select('log_date, animal_type, quantity, unit').order('log_date', { ascending: false }).limit(1),
    // `lte` not `lt`: something due TODAY is due, and was previously invisible here until it
    // was already late. Selects the id so it can be merged with chores into one due list.
    supabase.from('equipment_maintenance').select('id, equipment_name, next_service_date').eq('is_active', true).lte('next_service_date', new Date().toISOString().split('T')[0]).order('next_service_date').limit(10),
    supabase.from('children').select('*').order('created_at'),
    supabase.from('projects').select('id, title').eq('status', 'active').limit(3),
    supabase.from('daily_log').select('log_date').order('log_date', { ascending: false }).limit(7),
    supabase.from('subscriptions').select('tier, status').eq('user_id', user.id).single(),
    supabase.from('subjects').select('*').eq('is_active', true).order('name'),
    supabase.from('school_years').select('*').eq('is_active', true),
    supabase.from('state_requirements').select('*'),
    supabase.from('equipment_maintenance').select('id, equipment_name').eq('is_active', true),
    // All projects (not just the 3 active for the snapshot) so the log can match a
    // "worked on X" entry to the right project instead of mis-creating equipment.
    supabase.from('projects').select('id, title').order('sort_order'),
    // Recurring homestead chores due today or overdue — drives the dashboard reminder.
    supabase.from('homestead_chores').select('id, name, next_due_date').eq('is_active', true).lte('next_due_date', new Date().toISOString().split('T')[0]).order('next_due_date').limit(10),
    // ALL active chores (not just those due) so the log can match "cleaned the coop" to an
    // existing chore. A completion must reference one the user already defined — the log must
    // never invent a recurring chore from one sentence.
    supabase.from('homestead_chores').select('id, name, cadence_type, interval_days, weekday').eq('is_active', true).order('name'),
  ])

  const stateRequirements: Record<string, StateRequirement> = {}
  for (const req of stateReqs ?? []) {
    stateRequirements[req.state] = req
  }

  const lastLog = recentLogs?.[0]
  const lastLivestock = recentLivestock?.[0]
  const overdueItems = overdue ?? []
  const overdueCount = overdueItems.length
  const dueChoreItems = dueChores ?? []
  const dueChoreCount = dueChoreItems.length

  // Chores and equipment servicing merged into one list, most overdue first. They are the same
  // mechanic (last-done + interval + next-due) and were previously two separate counts that made
  // you visit two sections to find out what was actually due.
  const dueItems = toDueItems(dueChoreItems, overdueItems)
  const activeProjectCount = activeProjects?.length ?? 0
  const childMap: Record<string, string> = {}
  ;(children ?? []).forEach((c: { id: string; name: string }) => { childMap[c.id] = c.name })

  // Streak: consecutive days with logs (last 7)
  const logDates = new Set((allLogs ?? []).map(l => l.log_date))
  let streak = 0
  for (let i = 0; i < 7; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().split('T')[0]
    if (logDates.has(key)) streak++
    else break
  }

  const schoolIsStale = lastLog ? isStale(lastLog.log_date, 3) : true
  const hasAnyData = lastLog || lastLivestock || overdueCount > 0 || dueChoreCount > 0 || activeProjectCount > 0

  // ── Lean snapshot strip (IA Decision 1: capture is the hero; beneath it a
  //    disciplined status strip — module chips + actionable alerts — NOT a full
  //    status board. Brand-new users get an example prompt, never empty zeros). ──
  const snapshot = (
    <div className="mt-10 space-y-6">
      {!hasAnyData ? (
        <div className="bg-card border border-line rounded-xl p-5">
          <p className="text-xs font-semibold text-subtle uppercase tracking-wider mb-2">Try describing a day like this</p>
          <p className="text-sm text-muted italic leading-relaxed">
            &ldquo;We spent the morning on math and reading, then Emma helped me collect eggs and weigh them — got 14 from the Barred Rocks.&rdquo;
          </p>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {['Mathematics', 'Reading', 'Life Skills', 'Livestock logged'].map(s => (
              <span key={s} className="px-2 py-0.5 bg-green-100 border border-green-200 text-green-800 dark:bg-green-900/30 dark:border-green-800/40 dark:text-green-300 rounded-full text-xs">{s}</span>
            ))}
          </div>
          <p className="text-xs text-subtle mt-3">Cultivate sorts it into the right records automatically — you just confirm.</p>
        </div>
      ) : (
        <>
          {/* Actionable alerts double as "what to log" nudges */}
          {schoolIsStale && (
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800/40 rounded-xl px-4 py-3">
              <span className="text-amber-600 dark:text-amber-400 text-base shrink-0">⚠</span>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                {lastLog
                  ? `School log is ${daysAgo(lastLog.log_date).toLowerCase()} — log today to stay on pace.`
                  : 'No school logs yet — start tracking to build your compliance record.'}
              </p>
            </div>
          )}

          {/* The chickens and the mower on one list. Renders nothing when nothing is due. */}
          <DueList items={dueItems} />

          {/* Lean module chips — one glance per section, then into the workspace */}
          <div>
            <p className="text-xs font-semibold text-subtle uppercase tracking-widest mb-3">At a glance</p>
            {/* Two chips, matching the two sections. Homestead / Home & DIY / Projects merged
                into Household, so three chips became one — and the due counts they each reported
                separately are now the single list above this. */}
            <div className="grid grid-cols-2 gap-3">
              <ModuleChip
                href="/dashboard/homeschool" icon="📚" label="Kids"
                status={lastLog ? `Logged ${daysAgo(lastLog.log_date).toLowerCase()}` : 'Start logging'}
                alert={schoolIsStale && !!lastLog}
              />
              <ModuleChip
                href="/dashboard/household" icon="🏡" label="Household"
                status={dueItems.length > 0
                  ? `${dueItems.length} due`
                  : lastLivestock ? `${lastLivestock.animal_type} · ${daysAgo(lastLivestock.log_date).toLowerCase()}`
                  : activeProjectCount > 0 ? `${activeProjectCount} project${activeProjectCount === 1 ? '' : 's'} active`
                  : 'All caught up'}
                alert={dueItems.length > 0}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-surface text-content">
      <nav className="border-b border-line px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LeafIcon />
          <h1 className="text-lg font-bold tracking-tight">
            <span className="text-green-600 dark:text-green-400">Cultivate</span>
          </h1>
        </div>
        <AccountMenu email={user.email ?? ''} createdAt={user.created_at} />
      </nav>

      <main className="max-w-lg mx-auto px-4 sm:px-6 py-8">
        <Suspense fallback={null}>
          <CheckoutBanner tier={sub?.tier ?? null} childCount={children?.length ?? 0} />
        </Suspense>

        {/* Hero — greeting + streak, then the capture box (the product's front door) */}
        <div className="mb-6">
          <Greeting />
          <div className="flex items-center justify-between gap-3">
            <p className="text-muted text-sm">
              {streak >= 3
                ? `${streak}-day logging streak — keep it going.`
                : streak === 1
                ? 'Logged today — great start.'
                : 'Learning as a lifestyle.'}
            </p>
            {(children?.length ?? 0) > 0 && (
              <Link
                href="/dashboard/homeschool/ideas"
                className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400 hover:text-green-500 transition-colors"
              >
                ✦ Spark ideas
              </Link>
            )}
          </div>
        </div>

        <UniversalLogForm
          mode="embedded"
          snapshot={snapshot}
          childList={children ?? []}
          subjects={subjects ?? []}
          activeYears={activeYears ?? []}
          stateRequirements={stateRequirements}
          equipment={equipmentForLog ?? []}
          projects={projectsForLog ?? []}
          chores={choresForLog ?? []}
        />
      </main>
    </div>
  )
}

function ModuleChip({
  href, icon, label, status, alert = false,
}: {
  href: string
  icon: string
  label: string
  status: string
  alert?: boolean
}) {
  return (
    <Link
      href={href}
      className="bg-card border border-line hover:border-line-strong rounded-xl p-3 transition-colors block"
    >
      <div className="text-xl mb-1">{icon}</div>
      <p className="text-xs font-semibold text-content">{label}</p>
      <p className={`text-[11px] mt-0.5 truncate ${alert ? 'text-amber-700 dark:text-amber-400' : 'text-subtle'}`}>{status}</p>
    </Link>
  )
}

function LeafIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-green-600 dark:text-green-400">
      <path
        d="M10 2C10 2 4 5 4 11C4 14.314 6.686 17 10 17C13.314 17 16 14.314 16 11C16 5 10 2 10 2Z"
        fill="currentColor"
        fillOpacity="0.15"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M10 17V10M10 10C10 10 7.5 8 6 6M10 10C10 10 12.5 8 14 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
