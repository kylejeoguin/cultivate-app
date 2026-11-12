import { createClient } from '@/lib/supabase/server'
import { formatDateShort } from '@/lib/dates'
import { getCachedUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import type { LivestockLog, GardenEntry, PreservationLog, Project, EquipmentMaintenance } from '@/lib/types'
import { toDueItems } from '@/lib/dueItems'
import { daysUntil } from '@/lib/dueDates'
import {
  PageNav, PageContent, TwoCol, SectionHeader,
  WorkspaceHeader, SnapshotStats, RecentEntries, SubAreaGrid, ReportsBlock, ProjectsPanel, DueList,
  type SubArea, type ReportLink, type RecentEntryItem,
} from '../ui'

// HOUSEHOLD — the merge of the old Homestead and Home & DIY sections.
//
// WHY (2026-09, Kyle): sections were named for TOPICS, but every entry in Cultivate is
// deliberately multi-topic — a chore is a household job AND school credit; a harvest is
// production AND Science. Topic-as-folder therefore guarantees duplicates, and it did:
// `projects` rendered in three places and `equipment_maintenance` in two, each page querying
// the SAME tables with a category filter. The database never had sections; the sections were a
// WHERE clause invented in the UI.
//
// Six sub-areas here, which is fewer than School's eleven — the merge SUBTRACTS. They group into
// what you grow/raise and what needs doing.
//
// Leaf routes deliberately keep their existing URLs for now (…/homestead/garden,
// …/home-diy/equipment). Moving thirty pages as well would multiply the risk for no visible
// gain; the old section hubs redirect here.

function todayLabel() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

const METHOD_LABELS: Record<string, string> = {
  canning: 'Canning', freezing: 'Freezing', dehydrating: 'Dehydrating', fermenting: 'Fermenting', other: 'Other',
}
const STATUS_LABELS: Record<string, string> = {
  planted: 'Planted', growing: 'Growing', harvested: 'Harvested', failed: 'Failed',
}

const REPORT_LINKS: ReportLink[] = [
  { label: 'Garden & animals', description: 'Year-to-date summary', href: '/dashboard/homestead/reports', icon: '📊' },
  { label: 'Intelligence', description: 'Cost vs. yield insights', href: '/dashboard/homestead/intelligence', icon: '📈' },
  { label: 'Maintenance', description: 'Service schedule & history', href: '/dashboard/home-diy/reports', icon: '🔧' },
  { label: 'Resources', description: 'Planners & printables', href: '/dashboard/resources', icon: '📂' },
]

export default async function HouseholdPage() {
  const supabase = await createClient()
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const [
    { data: recentLivestock },
    { data: gardenEntries },
    { data: recentPreservation },
    { data: projectData },
    { data: equipmentData },
    { data: choreData },
  ] = await Promise.all([
    supabase.from('livestock_logs').select('*').order('log_date', { ascending: false }).limit(5),
    supabase.from('garden_entries').select('*').order('created_at', { ascending: false }).limit(10),
    supabase.from('preservation_logs').select('*').order('log_date', { ascending: false }).limit(5),
    // No category filter — one section, so every project belongs here. This is the render that
    // used to happen twice, once per category, on two different pages.
    supabase.from('projects').select('*').neq('status', 'done').order('sort_order').order('created_at', { ascending: false }).limit(10),
    // Likewise: all equipment, not the homestead-category slice plus a separate full list.
    supabase.from('equipment_maintenance').select('*').eq('is_active', true).order('next_service_date', { ascending: true, nullsFirst: false }),
    supabase.from('homestead_chores').select('id, name, next_due_date').eq('is_active', true).order('next_due_date', { ascending: true }),
  ])

  const livestock = (recentLivestock ?? []) as LivestockLog[]
  const garden = (gardenEntries ?? []) as GardenEntry[]
  const preservation = (recentPreservation ?? []) as PreservationLog[]
  const activeGarden = garden.filter(g => g.status !== 'harvested' && g.status !== 'failed')
  const projects = (projectData ?? []) as Project[]
  const equipment = (equipmentData ?? []) as EquipmentMaintenance[]
  const chores = choreData ?? []

  // The section's own "what's due" — a wider horizon than Today's, because this is where you
  // come to plan rather than to check. Same component, same badge, one implementation.
  const dueItems = toDueItems(
    chores,
    equipment.map(e => ({ id: e.id, equipment_name: e.equipment_name, next_service_date: e.next_service_date })),
    30,
  )
  const dueNowCount = dueItems.filter(i => (daysUntil(i.dueDate) ?? 1) <= 0).length

  const subAreasGrowing: SubArea[] = [
    { title: 'Garden', description: 'Planted → harvested', href: '/dashboard/homestead/garden', icon: '🌱', stat: garden.length ? `${activeGarden.length} growing` : undefined },
    { title: 'Livestock', description: 'Eggs, milk, daily production', href: '/dashboard/homestead/livestock', icon: '🐓', stat: livestock.length ? `${livestock.length} recent` : undefined },
    { title: 'Food Preservation', description: 'Canning, freezing & more', href: '/dashboard/homestead/preservation', icon: '🫙', stat: preservation.length ? `${preservation.length} batches` : undefined },
  ]

  const subAreasUpkeep: SubArea[] = [
    { title: 'Chores & Routines', description: 'Recurring jobs that count as school', href: '/dashboard/homestead/chores', icon: '🔁', stat: chores.length ? `${chores.length} tracked` : undefined },
    { title: 'Equipment', description: 'Service dates & history', href: '/dashboard/home-diy/equipment', icon: '🔧', stat: equipment.length ? `${equipment.length} tracked` : undefined },
    { title: 'Projects', description: 'Builds and renovations', href: '/dashboard/projects', icon: '🔨', stat: projects.length ? `${projects.length} open` : undefined },
  ]

  const recentItems: RecentEntryItem[] = [
    ...livestock.slice(0, 3).map(e => ({
      icon: '🐓',
      title: `${e.animal_name ?? e.animal_type}${e.quantity ? ` — ${e.quantity} ${e.unit}` : ''}`,
      meta: e.notes ?? undefined,
      badge: e.school_credit ? 'School credit' : undefined,
      badgeAccent: 'green' as const,
      date: formatDateShort(e.log_date),
    })),
    ...preservation.slice(0, 2).map(e => ({
      icon: '🫙',
      title: `${e.item_name}${e.quantity ? ` — ${e.quantity} ${e.unit}` : ''} · ${METHOD_LABELS[e.method] ?? e.method}`,
      meta: e.notes ?? undefined,
      badge: e.school_credit ? 'School credit' : undefined,
      badgeAccent: 'green' as const,
      date: formatDateShort(e.log_date),
    })),
    ...activeGarden.slice(0, 2).map(e => ({
      icon: '🌱',
      title: `${e.crop_name}${e.variety ? ` (${e.variety})` : ''}`,
      meta: e.date_planted ? `Planted ${formatDateShort(e.date_planted)}` : undefined,
      badge: STATUS_LABELS[e.status] ?? e.status,
      badgeAccent: 'green' as const,
    })),
  ]

  const stats = [
    { value: dueNowCount, label: 'Due now', accent: 'amber' as const },
    { value: activeGarden.length, label: 'Growing', accent: 'green' as const },
    { value: preservation.length, label: 'Preserved', accent: 'sky' as const },
    { value: projects.filter(p => p.status === 'active').length, label: 'Projects', accent: 'amber' as const },
  ]

  return (
    <div className="min-h-screen bg-surface text-content">
      <PageNav
        back="/dashboard" backLabel="Today" current="Household" accent="text-amber-600 dark:text-amber-400"
        actions={<span className="text-subtle text-xs hidden sm:inline">{todayLabel()}</span>}
      />

      <PageContent>
        <WorkspaceHeader
          icon="🏡" title="Household"
          subtitle="The garden, the animals, the equipment, and everything that needs doing."
          accent="amber" addHref="/dashboard" addLabel="+ Log today"
          reportsHref="/dashboard/homestead/reports"
        />

        <SnapshotStats stats={stats} />

        {/* The chickens and the mower on one list — the same component Today uses, with a wider
            horizon because this is the planning surface rather than the daily one. */}
        <div className="mt-8 mb-8">
          <DueList items={dueItems} max={8} />
        </div>

        <TwoCol
          leftSpan={3}
          left={
            <div className="space-y-8">
              <div>
                <SectionHeader label="Garden & animals" />
                <SubAreaGrid items={subAreasGrowing} cols={3} accent="amber" />
              </div>

              <div>
                <SectionHeader label="Upkeep" />
                <SubAreaGrid items={subAreasUpkeep} cols={3} accent="amber" />
              </div>

              <div>
                <SectionHeader label="Reports & exports" />
                <ReportsBlock accent="amber" links={REPORT_LINKS} />
              </div>

              <RecentEntries
                title="Recent activity"
                items={recentItems}
                emptyText="Nothing logged yet. Use “Log today” to record the garden, the animals, or a repair."
                collapsible
              />
            </div>
          }
          right={
            <div className="space-y-6">
              <ProjectsPanel
                projects={projects}
                accent="amber"
                limit={4}
                emptyEmoji="🔨"
                emptyLabel="Add your first project"
              />
            </div>
          }
        />
      </PageContent>
    </div>
  )
}
