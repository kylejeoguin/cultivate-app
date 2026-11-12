// Shared responsive layout utilities for dashboard pages.
// Primitives: <PageContent> wrapper, <PageNav> breadcrumb, <TwoCol> grid,
//   <Card>, <SectionHeader> (small label+action), <StatGrid>.
// Section-workspace template (IA redesign, see IA-REDESIGN-PLAN.md §3) —
//   compose these in the same order in every section to keep layouts identical:
//   <WorkspaceHeader> · <SnapshotStats> · <RecentEntries> · <SubAreaGrid> · <ReportsBlock>.
//   Only the `accent` prop changes per section (green/amber/sky/stone).
//
// Neutral surfaces/borders/text use the A1 semantic tokens (bg-card, border-line,
// text-content/muted/subtle …) so every section built on these is light/dark ready.
// The token DARK values match the old stone palette, so dark theme is unchanged.
// Section ACCENT colors (green/amber/sky/stone) stay literal — they're intentional.

import Link from 'next/link'
import { dueStatus, dueLabel, formatDueDate } from '@/lib/dueDates'
import type { DueItem } from '@/lib/dueItems'

// Main page content wrapper — consistent max-width and padding across all pages
export function PageContent({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`max-w-2xl lg:max-w-5xl mx-auto px-4 sm:px-6 py-8 ${className}`}>
      {children}
    </div>
  )
}

// Two-column layout for desktop: left column (main) + right column (sidebar)
// On mobile stacks vertically
export function TwoCol({
  left,
  right,
  leftSpan = 3,
}: {
  left: React.ReactNode
  right: React.ReactNode
  leftSpan?: 2 | 3
}) {
  return (
    <div className={`grid grid-cols-1 lg:grid-cols-${leftSpan === 3 ? '3' : '2'} gap-6 lg:gap-8 items-start`}>
      <div className={leftSpan === 3 ? 'lg:col-span-2' : 'lg:col-span-1'}>{left}</div>
      <div className="lg:col-span-1">{right}</div>
    </div>
  )
}

// Stat grid — 2 cols on mobile, 4 on desktop
export function StatGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {children}
    </div>
  )
}

// Standard page breadcrumb nav
export function PageNav({
  back,
  backLabel,
  current,
  accent = 'text-content',
  actions,
}: {
  back: string
  backLabel: string
  current: string
  accent?: string
  actions?: React.ReactNode
}) {
  return (
    <nav className="border-b border-line px-4 sm:px-6 py-4 flex items-center justify-between no-print">
      <div className="flex items-center gap-3 min-w-0">
        <Link href={back} className="text-subtle hover:text-content text-sm transition-colors shrink-0">
          ← {backLabel}
        </Link>
        <span className="text-line-strong shrink-0">/</span>
        <span className={`text-sm font-semibold truncate ${accent}`}>{current}</span>
      </div>
      {actions && <div className="shrink-0 ml-4">{actions}</div>}
    </nav>
  )
}

// Card — standard content card
export function Card({
  children,
  className = '',
  accent,
}: {
  children: React.ReactNode
  className?: string
  accent?: 'green' | 'amber' | 'sky' | 'red'
}) {
  const borders: Record<string, string> = {
    green: 'border-green-200 dark:border-green-900/40',
    amber: 'border-amber-200 dark:border-amber-900/40',
    sky: 'border-sky-200 dark:border-sky-900/40',
    red: 'border-red-200 dark:border-red-900/40',
  }
  const border = accent ? borders[accent] : 'border-line'
  return (
    <div className={`bg-card border ${border} rounded-xl ${className}`}>
      {children}
    </div>
  )
}

// Section header with optional action link
export function SectionHeader({
  label,
  action,
  actionHref,
  actionColor = 'text-subtle hover:text-content',
}: {
  label: string
  action?: string
  actionHref?: string
  actionColor?: string
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <p className="text-xs font-semibold text-subtle uppercase tracking-widest">{label}</p>
      {action && actionHref && (
        <Link href={actionHref} className={`text-xs transition-colors ${actionColor}`}>
          {action}
        </Link>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SECTION-WORKSPACE TEMPLATE COMPONENTS  (IA redesign — IA-REDESIGN-PLAN.md §3)
// Every section (School/Homestead/Home & DIY/Projects) composes these in the
// same order so learning one teaches all. Accent is the only per-section change.
// Tailwind v4: all accent classes are STATIC strings (no `bg-${x}` — JIT won't emit those).
// ---------------------------------------------------------------------------

export type Accent = 'green' | 'amber' | 'sky' | 'stone'

const ACCENT: Record<Accent, {
  text: string; hoverText: string; btn: string; border: string; chip: string; iconBg: string
}> = {
  green: {
    text: 'text-green-700 dark:text-green-400', hoverText: 'group-hover:text-green-600 dark:group-hover:text-green-300',
    btn: 'bg-green-700 hover:bg-green-600', border: 'hover:border-green-600/60 dark:hover:border-green-700/50',
    chip: 'bg-green-100 border border-green-200 text-green-800 dark:bg-green-900/40 dark:border-green-800/40 dark:text-green-300',
    iconBg: 'bg-green-100 dark:bg-green-900/40',
  },
  amber: {
    text: 'text-amber-700 dark:text-amber-400', hoverText: 'group-hover:text-amber-600 dark:group-hover:text-amber-300',
    btn: 'bg-amber-700 hover:bg-amber-600', border: 'hover:border-amber-600/60 dark:hover:border-amber-700/50',
    chip: 'bg-amber-100 border border-amber-200 text-amber-800 dark:bg-amber-900/40 dark:border-amber-800/40 dark:text-amber-300',
    iconBg: 'bg-amber-100 dark:bg-amber-900/40',
  },
  sky: {
    text: 'text-sky-700 dark:text-sky-400', hoverText: 'group-hover:text-sky-600 dark:group-hover:text-sky-300',
    btn: 'bg-sky-700 hover:bg-sky-600', border: 'hover:border-sky-600/60 dark:hover:border-sky-700/50',
    chip: 'bg-sky-100 border border-sky-200 text-sky-800 dark:bg-sky-900/40 dark:border-sky-800/40 dark:text-sky-300',
    iconBg: 'bg-sky-100 dark:bg-sky-900/40',
  },
  stone: {
    text: 'text-muted', hoverText: 'group-hover:text-content',
    btn: 'bg-line-strong hover:bg-stone-600', border: 'hover:border-line-strong',
    chip: 'bg-elevated border border-line text-content', iconBg: 'bg-elevated',
  },
}

// ❶ WorkspaceHeader — icon + title + purpose + primary "Add entry" + Reports link.
// Replaces the hand-rolled per-section <nav>/hero blocks. The Add button routes to
// the universal log pre-scoped to this section (one capture engine, not a new form).
export function WorkspaceHeader({
  icon, title, subtitle, accent = 'stone', addHref, addLabel = '+ Add entry', reportsHref,
}: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  accent?: Accent
  addHref?: string
  addLabel?: string
  reportsHref?: string
}) {
  const a = ACCENT[accent]
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
      <div className="flex items-start gap-3 min-w-0">
        <div className={`w-10 h-10 rounded-xl ${a.iconBg} flex items-center justify-center text-xl shrink-0`}>{icon}</div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="text-muted text-sm mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {(addHref || reportsHref) && (
        <div className="flex items-center gap-2 shrink-0">
          {addHref && (
            <Link href={addHref} className={`${a.btn} text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors`}>
              {addLabel}
            </Link>
          )}
          {reportsHref && (
            <Link href={reportsHref} className="text-sm text-muted hover:text-content border border-line hover:border-line-strong px-3 py-2 rounded-lg transition-colors">
              Reports →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

// ❷ Single stat card + the snapshot row that holds them.
export function StatCard({ value, label, accent = 'stone' }: { value: React.ReactNode; label: string; accent?: Accent }) {
  return (
    <div className="bg-card/60 border border-line/60 rounded-xl px-4 py-3 text-center">
      <div className={`text-lg font-bold ${ACCENT[accent].text}`}>{value}</div>
      <div className="text-xs text-subtle mt-0.5">{label}</div>
    </div>
  )
}

export function SnapshotStats({ stats }: { stats: { value: React.ReactNode; label: string; accent?: Accent }[] }) {
  if (!stats.length) return null
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
      {stats.map((s, i) => <StatCard key={i} value={s.value} label={s.label} accent={s.accent} />)}
    </div>
  )
}

// ❸ RecentEntries — uniform activity feed. Same row shape + badge styling in every section.
export type RecentEntryItem = {
  icon?: React.ReactNode
  title: React.ReactNode
  meta?: string
  badge?: string
  badgeAccent?: Accent
  date?: string
}

export function RecentEntries({
  title = 'Recent activity', items, viewAllHref, emptyText = 'Nothing logged yet.',
  collapsible = false, defaultOpen = false,
}: {
  title?: string
  items: RecentEntryItem[]
  viewAllHref?: string
  emptyText?: string
  // collapsible → renders inside a native <details> (server-friendly, no client JS), collapsed
  // unless defaultOpen. Use to push a secondary feed to the bottom of a page without it dominating.
  collapsible?: boolean
  defaultOpen?: boolean
}) {
  const list = items.length === 0 ? (
    <p className="text-sm text-subtle bg-card/40 border border-line/60 border-dashed rounded-xl px-4 py-4">{emptyText}</p>
  ) : (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="bg-card/60 border border-line rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {it.icon && <div className="w-7 h-7 rounded-lg bg-elevated/60 flex items-center justify-center text-sm shrink-0">{it.icon}</div>}
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{it.title}</div>
              {it.meta && <div className="text-xs text-subtle mt-0.5 truncate">{it.meta}</div>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-3">
            {it.badge && <span className={`text-xs px-2 py-0.5 rounded-full ${ACCENT[it.badgeAccent ?? 'green'].chip}`}>{it.badge}</span>}
            {it.date && <span className="text-xs text-subtle">{it.date}</span>}
          </div>
        </div>
      ))}
    </div>
  )

  if (collapsible) {
    return (
      <details open={defaultOpen} className="group/recent">
        <summary className="flex items-center justify-between mb-3 cursor-pointer list-none select-none">
          <span className="flex items-center gap-2 text-xs font-semibold text-subtle uppercase tracking-widest">
            <span aria-hidden className="text-subtle transition-transform duration-200 group-open/recent:rotate-90">›</span>
            {title}
            {items.length > 0 && <span className="font-normal normal-case tracking-normal text-subtle/60">· {items.length}</span>}
          </span>
          {viewAllHref && (
            <Link href={viewAllHref} className="text-xs text-subtle hover:text-content transition-colors">View all →</Link>
          )}
        </summary>
        {list}
      </details>
    )
  }

  return (
    <div>
      <SectionHeader label={title} action={viewAllHref ? 'View all →' : undefined} actionHref={viewAllHref} />
      {list}
    </div>
  )
}

// ❹ SubAreaGrid — the trackers/sub-sections within a workspace, as identical NavCards.
export type SubArea = { title: string; description?: string; href: string; icon: React.ReactNode; stat?: string }

export function SubAreaGrid({ items, cols = 2, accent = 'stone' }: { items: SubArea[]; cols?: 2 | 3; accent?: Accent }) {
  const grid = cols === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'
  const a = ACCENT[accent]
  return (
    <div className={`grid ${grid} gap-3`}>
      {items.map(it => (
        <Link key={it.href} href={it.href} className={`bg-card/60 border border-line/60 ${a.border} rounded-xl p-4 transition-all block group`}>
          <div className="w-8 h-8 rounded-lg bg-elevated flex items-center justify-center text-base mb-2.5 group-hover:bg-line-strong transition-colors">{it.icon}</div>
          <div className="font-semibold text-sm text-content">{it.title}</div>
          {it.description && <div className="text-subtle text-xs mt-0.5">{it.description}</div>}
          {it.stat && <div className={`text-xs font-medium mt-1 ${a.text}`}>{it.stat}</div>}
        </Link>
      ))}
    </div>
  )
}

// ❺ ReportsBlock — consistent entry to a section's reports / resources / exports.
export type ReportLink = { label: string; description?: string; href: string; icon: React.ReactNode }

export function ReportsBlock({ accent = 'stone', links }: { accent?: Accent; links: ReportLink[] }) {
  const a = ACCENT[accent]
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {links.map(l => (
        <Link key={l.href} href={l.href} className={`flex items-center gap-4 bg-card/60 border border-line ${a.border} rounded-xl px-5 py-4 transition-all group`}>
          <span className="text-2xl opacity-80 shrink-0">{l.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-content">{l.label}</div>
            {l.description && <div className="text-xs text-subtle">{l.description}</div>}
          </div>
          <span className={`text-sm shrink-0 text-subtle ${a.hoverText}`}>→</span>
        </Link>
      ))}
    </div>
  )
}

// ❻ DueBadge — the ONE way a scheduled date is shown anywhere in the app.
//
// This replaces four separate treatments that had drifted apart: a red pill in Home & DIY's
// overdue block, plain amber text in its due-soon block, a third wording in its full list
// ("Overdue" with no day count), and a fourth on the Homestead page ("OK" instead of the
// next date). Same underlying state, four different answers — so the same piece of equipment
// read differently depending on which list you happened to be looking at.
//
// Status and wording both come from lib/dueDates, so "due soon" means one thing everywhere.
export function DueBadge({ date, className = '' }: { date: string | null | undefined; className?: string }) {
  const status = dueStatus(date)
  const label = dueLabel(date)

  if (status === 'none') return <span className={`text-xs text-subtle ${className}`}>No schedule</span>
  if (status === 'overdue') return <span className={`text-xs font-semibold text-red-700 dark:text-red-400 ${className}`}>{label}</span>
  if (status === 'soon') return <span className={`text-xs text-amber-700 dark:text-amber-400 ${className}`}>{label}</span>
  // 'ok' — nothing to warn about, so show WHEN rather than a status word. More useful than "OK".
  return <span className={`text-xs text-subtle ${className}`}>{formatDueDate(date)}</span>
}

// ❼ ProjectsPanel — the project list that Homestead and Home & DIY each hand-rolled.
//
// The two copies were structurally identical and differed only in accent, category, the
// empty-state emoji/wording, and — almost certainly by accident — how many rows they showed
// (3 vs 4). `limit` is a prop so this extraction changes nothing visible today; when the two
// sections merge, it becomes one number.
export type ProjectLike = { id: string; title: string; status: string }

export function ProjectsPanel({
  projects,
  category,
  accent = 'stone',
  limit,
  emptyEmoji,
  emptyLabel,
}: {
  projects: ProjectLike[]
  /** Omit to show every project and link to the unfiltered board — what Household wants. */
  category?: string
  accent?: Accent
  limit: number
  emptyEmoji: string
  emptyLabel: string
}) {
  const a = ACCENT[accent]
  const href = category ? `/dashboard/projects?category=${category}` : '/dashboard/projects'
  const active = projects.filter(p => p.status === 'active')
  const upNext = projects.filter(p => p.status === 'up_next')

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-subtle uppercase tracking-widest">Projects</h3>
        <Link href={href} className={`text-xs ${a.text} transition-colors`}>View all →</Link>
      </div>

      {projects.length === 0 ? (
        <Link href={href} className="flex items-center gap-3 bg-card/40 border border-line/60 border-dashed rounded-xl px-4 py-3.5 text-subtle hover:text-content hover:border-line-strong transition-all text-sm">
          <span className="text-lg">{emptyEmoji}</span>
          <span>{emptyLabel}</span>
        </Link>
      ) : (
        <div className="space-y-2">
          {active.map(p => (
            <Link key={p.id} href={href} className={`flex items-center justify-between bg-card/60 border border-line ${a.border} rounded-xl px-4 py-3 transition-all group`}>
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                <span className="text-sm font-medium text-content truncate">{p.title}</span>
              </div>
              <span className="text-xs text-green-700 dark:text-green-400 font-medium shrink-0 ml-3">Active</span>
            </Link>
          ))}
          {upNext.slice(0, Math.max(0, limit - active.length)).map(p => (
            <Link key={p.id} href={href} className={`flex items-center justify-between bg-card/40 border border-line/60 ${a.border} rounded-xl px-4 py-3 transition-all group`}>
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`w-2 h-2 rounded-full shrink-0 ${accent === 'sky' ? 'bg-sky-500/60' : 'bg-amber-500/60'}`} />
                <span className="text-sm text-muted truncate">{p.title}</span>
              </div>
              <span className="text-xs text-subtle shrink-0 ml-3">Up next</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

// ❽ DueList — the one surface that answers "what needs doing around here?"
//
// Chores and equipment servicing are the same mechanic (last-done + interval + next-due), but
// they lived in two sections that did not know about each other. Today showed them as two
// separate COUNTS — "4 pieces of equipment overdue" and "3 chores due" — which told you a
// number and made you visit two pages to find out what it actually was.
//
// This lists the things themselves, most overdue first, with the same DueBadge used everywhere
// else. Each row links to where you can act on it.
export function DueList({ items, max = 6 }: { items: DueItem[]; max?: number }) {
  if (items.length === 0) return null
  const shown = items.slice(0, max)
  const hidden = items.length - shown.length

  return (
    <div>
      <p className="text-xs font-semibold text-subtle uppercase tracking-widest mb-3">What&apos;s due</p>
      <div className="space-y-2">
        {shown.map(item => (
          <Link
            key={`${item.kind}-${item.id}`}
            href={item.href}
            className="flex items-center justify-between bg-card/60 border border-line hover:border-line-strong rounded-xl px-4 py-3 transition-all group"
          >
            <div className="flex items-center gap-3 min-w-0">
              {/* The kind is worth showing — "the mower" and "clean the coop" are different
                  kinds of job even when they are equally overdue. */}
              <span className="text-base shrink-0" aria-hidden="true">{item.kind === 'chore' ? '🔁' : '🔧'}</span>
              <span className="text-sm font-medium text-content truncate">{item.name}</span>
            </div>
            <DueBadge date={item.dueDate} className="shrink-0 ml-3" />
          </Link>
        ))}
      </div>
      {hidden > 0 && (
        <p className="text-xs text-subtle mt-2">
          and {hidden} more {hidden === 1 ? 'item' : 'items'} due
        </p>
      )}
    </div>
  )
}
