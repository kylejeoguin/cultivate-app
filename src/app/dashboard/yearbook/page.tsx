import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import { getCachedUser } from '@/lib/auth'
import { checkDashboardAccess } from '@/lib/access'
import { redirect } from 'next/navigation'
import YearbookClient, { type PhotoRow } from './YearbookClient'
import type { Child, SchoolYear, DailyLog, Activity, PortfolioItem, LivestockLog, GardenEntry, PreservationLog } from '@/lib/types'

export default async function YearbookPage({
  searchParams,
}: {
  searchParams: Promise<{ year_id?: string; tab?: string; start?: string; end?: string }>
}) {
  const supabase = await createClient()
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const activeTab = params.tab === 'homestead' ? 'homestead' : 'homeschool'

  // Download access mirrors dashboard access exactly. The dashboard layout already gates
  // entry on checkDashboardAccess() and redirects non-members to /pricing, so anyone who
  // can see this page can download their own yearbook. This covers admin, beta users, and
  // BOTH active AND trialing subscriptions. (The old gate here only allowed beta-by-email +
  // status='active' — it wrongly blocked trial users and admin from downloading.)
  const canDownload = await checkDashboardAccess()

  const [
    { data: children },
    { data: schoolYears },
    { data: subjects },
  ] = await Promise.all([
    supabase.from('children').select('*').order('created_at'),
    supabase.from('school_years').select('*').order('start_date', { ascending: false }),
    supabase.from('subjects').select('*'),
  ])

  const activeYear = params.year_id
    ? (schoolYears ?? []).find((y: SchoolYear) => y.id === params.year_id)
    : (schoolYears ?? []).find((y: SchoolYear) => y.is_active) ?? (schoolYears ?? [])[0]

  // Custom date range — when the user picks an explicit start+end (e.g. a calendar year
  // Jan 1–Dec 31, or any window), it overrides the school-year default. Validate the format
  // before trusting it in a query.
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
  const customStart = params.start && DATE_RE.test(params.start) ? params.start : null
  const customEnd = params.end && DATE_RE.test(params.end) ? params.end : null
  const usingCustomRange = !!(customStart && customEnd && customStart <= customEnd)

  // Date range — custom range if chosen, else active school year, else current calendar year
  const rangeStart = usingCustomRange ? customStart! : (activeYear?.start_date ?? `${new Date().getFullYear()}-01-01`)
  const rangeEnd = usingCustomRange ? customEnd! : (activeYear?.end_date ?? `${new Date().getFullYear()}-12-31`)

  // Year-scoped homeschool tables: include a row if it's TAGGED to the scoped school year
  // (school_year_id) OR its date falls within the window. This mirrors the reports/transcript
  // `belongsToYear` logic and is robust to summer/boundary logging (e.g. a log dated in June
  // but tagged to the upcoming Aug–Jul school year). With a CUSTOM range there's no single
  // school year to match by tag, so scope purely by date (scopeYearIds = []).
  //
  // ⚠️ School years are created PER CHILD (onboarding + "add child" each insert a row keyed to
  // that child), so a multi-kid household has SEVERAL school_years rows for the same Aug–Jul
  // window — one per child, plus any exact duplicates. Scoping by a single `activeYear.id`
  // therefore only matches ONE child's logs; any child whose summer-dated (out-of-window) logs
  // are tagged to a *sibling's* same-period year row would silently drop out of the book. So we
  // match ALL year rows that share the active year's window, not just the one row `find(active)`
  // happened to pick. (For a single-child family this is exactly the one id — no behavior change.)
  const scopeYearIds = usingCustomRange || !activeYear
    ? []
    : (schoolYears ?? [])
        .filter((y: SchoolYear) => y.start_date === activeYear.start_date && y.end_date === activeYear.end_date)
        .map((y: SchoolYear) => y.id)
  const yearScoped = (table: string, dateCol: string) => {
    const q = supabase.from(table).select('*')
    if (scopeYearIds.length) {
      return q
        .or(`school_year_id.in.(${scopeYearIds.join(',')}),and(${dateCol}.gte.${rangeStart},${dateCol}.lte.${rangeEnd})`)
        .order(dateCol)
    }
    return q.gte(dateCol, rangeStart).lte(dateCol, rangeEnd).order(dateCol)
  }

  const [
    logs,
    activities,
    portfolio,
    livestock,
    garden,
    preservation,
    photos,
    { data: projects },
  ] = await Promise.all([
    // Paginated — a multi-kid year easily exceeds the 1000-row cap on daily_log.
    fetchAllRows<DailyLog>((f, t) => yearScoped('daily_log', 'log_date').range(f, t)),
    fetchAllRows<Activity>((f, t) => yearScoped('activities', 'activity_date').range(f, t)),
    fetchAllRows<PortfolioItem>((f, t) => yearScoped('portfolio_items', 'item_date').range(f, t)),
    fetchAllRows<LivestockLog>((f, t) => supabase.from('livestock_logs').select('*')
      .gte('log_date', rangeStart).lte('log_date', rangeEnd).order('log_date').range(f, t)),
    fetchAllRows<GardenEntry>((f, t) => supabase.from('garden_entries').select('*')
      .gte('created_at', rangeStart).order('created_at').range(f, t)),
    fetchAllRows<PreservationLog>((f, t) => supabase.from('preservation_logs').select('*')
      .gte('log_date', rangeStart).lte('log_date', rangeEnd).order('log_date').range(f, t)),
    // Attributed photos (per-child via child_ids) — the yearbook prefers these over the
    // legacy daily_log.photo_urls copies (deduped by URL in the client).
    fetchAllRows<PhotoRow>((f, t) => supabase.from('photos').select('url, caption, taken_on, child_ids')
      .gte('taken_on', rangeStart).lte('taken_on', rangeEnd).order('taken_on').range(f, t)),
    supabase.from('projects').select('*')
      .eq('status', 'done').order('updated_at', { ascending: false }),
  ])

  // Per-child yearbook messages (the "Dear [Name]" letters) — scoped to a real school year
  // (skipped for custom ranges, which have no single year to attach a keepsake note to).
  const noteYearId = usingCustomRange ? null : (activeYear?.id ?? null)
  const childNotes: Record<string, string> = {}
  if (noteYearId) {
    const { data: notes } = await supabase
      .from('yearbook_notes').select('child_id, message').eq('school_year_id', noteYearId)
    ;(notes ?? []).forEach((n: { child_id: string; message: string }) => { childNotes[n.child_id] = n.message })
  }

  // Hand-picked photo overrides (editable slots) for the active year. Keyed by slot_key;
  // render = override ?? default. Skipped for custom ranges (no single year to attach to),
  // which also disables photo editing there — the same rule as the letters.
  // Photo overrides work for custom ranges too now, keyed by a `scope`: the school_year_id
  // for a year book, or "range:<start>:<end>" for a custom window. slotSchoolYearId is the FK
  // for year books (null for custom). (Letters stay year-only — they use noteYearId above.)
  const slotScope = usingCustomRange ? `range:${rangeStart}:${rangeEnd}` : (activeYear?.id ?? null)
  const slotSchoolYearId = usingCustomRange ? null : (activeYear?.id ?? null)
  const photoSlots: Record<string, string> = {}
  if (slotScope) {
    const { data: slots } = await supabase
      .from('yearbook_slots').select('slot_key, photo_url').eq('scope', slotScope)
    ;(slots ?? []).forEach((s: { slot_key: string; photo_url: string }) => { photoSlots[s.slot_key] = s.photo_url })
  }

  return (
    <YearbookClient
      canDownload={canDownload}
      activeTab={activeTab}
      childNotes={childNotes}
      noteYearId={noteYearId}
      photoSlots={photoSlots}
      slotScope={slotScope}
      slotSchoolYearId={slotSchoolYearId}
      childList={(children ?? []) as Child[]}
      schoolYears={(schoolYears ?? []) as SchoolYear[]}
      activeYear={activeYear as SchoolYear | undefined}
      rangeStart={rangeStart}
      rangeEnd={rangeEnd}
      usingCustomRange={usingCustomRange}
      logs={logs ?? []}
      activities={activities ?? []}
      portfolio={portfolio ?? []}
      subjects={subjects ?? []}
      livestock={livestock ?? []}
      garden={garden ?? []}
      preservation={preservation ?? []}
      photos={photos ?? []}
      projects={projects ?? []}
    />
  )
}
