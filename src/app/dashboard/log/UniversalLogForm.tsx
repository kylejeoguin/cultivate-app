'use client'

import { useToday, todayLocalISO } from '@/lib/use-today'

import { useState, useRef, useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Child, Subject, SchoolYear, StateRequirement, PlannerWeek, PlannerItem } from '@/lib/types'
import { DEFAULT_HOMESCHOOL_SUBJECT } from '@/lib/types'
import { builtinUnitsFor } from '@/lib/units'
import { friendlySaveError } from '@/lib/saveErrors'
import { resolveGardenEvent, gardenStatusFor, GARDEN_EVENTS, type GardenEvent } from '@/lib/gardenEvent'
import UnitSelect from '../UnitSelect'
import type { RoutingResult, RouteLogResponse } from '@/app/api/route-log/route'
import { nextDueDate, type ChoreCadence } from '@/lib/chores'

/** The chore fields the log needs: enough to match by name and to advance the schedule. */
export type ChoreForLog = {
  id: string
  name: string
  cadence_type: string
  interval_days: number | null
  weekday: number | null
}

type Step = 'describe' | 'confirm' | 'done'

// Phase C (log → planner check-off): the Monday (local) of the week containing an ISO date.
function plannerWeekMonday(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return todayLocalISO(d)
}
function plannerWeekdayIndex(iso: string): number {
  return (new Date(iso + 'T12:00:00').getDay() + 6) % 7
}
type PlannerTarget = { id: string; kind: 'daily' | 'day' | 'loop'; day?: number }

type ProjectLite = { id: string; title: string }

interface EventConfirmState {
  routing: RoutingResult
  modules: RoutingResult['modules']
  // The existing chore this event completes, resolved from the router's matched name.
  // Null when the event is not a chore, or names one the user has not defined.
  choreId: string | null
  subjects: string[]
  // Per-subject hour allocation, keyed by subject name (string for the input field).
  // Drives exact core-subject-hours compliance (MO 600 rule) — saved only when filled.
  subjectHours: Record<string, string>
  namedChildren: string[]
  hours: string
  subModule: RoutingResult['homestead']['sub_module']
  // Only meaningful when subModule === 'garden'. 'tending' saves NO garden row.
  gardenEvent: GardenEvent
  quantity: string
  unit: string
  saleAmount: string
  equipment: string
  equipmentCategory: string
  equipmentInterval: string
  // Projects: the resolved existing project this event updates (id+title), plus the
  // task line we'll add to it and whether it's already done.
  projectId: string
  projectTaskTitle: string
  projectComplete: boolean
  skip: boolean
  // True for an event the user added by hand (not from the AI split) — renders an
  // editable "what happened" line and starts with every module off.
  isManual?: boolean
}

// Equipment categories (mirror the Home & DIY equipment form).
const EQUIPMENT_CATEGORIES = ['tractor', 'hvac', 'well', 'vehicle', 'appliance', 'tool', 'generator', 'other'] as const

// A homestead event must always resolve to a concrete sub-module, or its save
// branch never fires and the entry silently vanishes (B4 defect #3). Derive the
// most likely sub-module from what the AI extracted when it didn't set one.
function defaultHomesteadSubModule(
  h: RoutingResult['homestead'] | null | undefined
): NonNullable<RoutingResult['homestead']['sub_module']> {
  if (!h) return 'general'
  // The AI sometimes returns a non-canonical sub_module (seen live: "livestock_production")
  // that matches NONE of the four save branches — which silently DROPPED the whole homestead
  // event while the UI still said "saved". Normalize anything back to a real sub-module so a
  // homestead event can never vanish, regardless of what the model calls it.
  const raw = (h.sub_module ?? '').toString().toLowerCase()
  if (raw === 'livestock' || raw === 'garden' || raw === 'preservation' || raw === 'general') {
    return raw as NonNullable<RoutingResult['homestead']['sub_module']>
  }
  if (raw && /livestock|animal|poultry|egg|milk|dairy|production|herd|flock|meat|chick|cattle|goat|sheep|pig|rabbit|bee/.test(raw)) return 'livestock'
  if (raw && /garden|crop|plant|harvest|produce|veg|fruit|orchard/.test(raw)) return 'garden'
  if (raw && /preserv|can|freez|dehydr|ferment|pickl|jar/.test(raw)) return 'preservation'
  if (h.preservation_method) return 'preservation'
  if (h.animal_type) return 'livestock'
  if (h.crop_or_item) return 'garden'
  return 'general'
}

// Resolve the AI's free-text child names to the user's ACTUAL stored child names.
// The model often returns a first name ("Priya") while the stored name differs
// ("Priya (PA test)", a nickname, different case…). The confirm UI and save both
// match by exact stored name, so an un-resolved name = the school event silently
// saves to no child (or the wrong default). Fuzzy-match here so it lands right.
function matchChildNames(aiNames: string[], childList: Child[]): string[] {
  const matched = new Set<string>()
  for (const ai of aiNames) {
    const a = (ai ?? '').trim().toLowerCase()
    if (!a) continue
    const c =
      childList.find(c => c.name.toLowerCase() === a) ??
      childList.find(c => c.name.toLowerCase().startsWith(a) || a.startsWith(c.name.toLowerCase())) ??
      childList.find(c => {
        const first = c.name.toLowerCase().split(/[\s(]/)[0]
        return !!first && (a === first || a.startsWith(first + ' ') || a.includes(first))
      })
    if (c) matched.add(c.name)
  }
  return [...matched]
}

// A blank routing skeleton for a user-added ("Add event") card. Every module starts off;
// homestead/home_diy objects are present (non-null) so their confirm sub-forms can render
// the moment the user toggles that module on. is_maintenance defaults true so a manually
// enabled Maintenance event actually saves (the save path gates on it).
function blankRouting(): RoutingResult {
  return {
    event_description: '',
    modules: { homeschool: false, homestead: false, home_diy: false, projects: false, chores: false },
    homeschool: { named_children: [], subjects: [], subject_hours: null, inferred_hours: null, notes_summary: null },
    homestead: { sub_module: null, animal_type: null, quantity: null, unit: null, sale_detected: false, sale_amount: null, crop_or_item: null, garden_event: null, preservation_method: null, notes_summary: null },
    home_diy: { equipment_name: null, is_maintenance: true, project_description: null, notes_summary: null },
    chores: { matched_chore: null, notes_summary: null },
    projects: { matched_project: null, task_title: null, is_complete: false, notes_summary: null },
  }
}

function initEventState(r: RoutingResult, childList: Child[] = [], projects: ProjectLite[] = [], chores: ChoreForLog[] = []): EventConfirmState {
  // The router already resolved matched_project to an exact existing title; map it to id.
  const matched = r.projects?.matched_project
    ? projects.find(p => p.title === r.projects.matched_project)
      ?? projects.find(p => p.title.toLowerCase() === r.projects!.matched_project!.toLowerCase())
    : undefined
  // Same shape for chores: the router returns an exact name from the list we gave it; map it
  // to an id here. Case-insensitive fallback for the same reason projects has one.
  const matchedChore = r.chores?.matched_chore
    ? chores.find(c => c.name === r.chores.matched_chore)
      ?? chores.find(c => c.name.toLowerCase() === r.chores!.matched_chore!.toLowerCase())
    : undefined
  return {
    routing: r,
    choreId: matchedChore?.id ?? null,
    // Both `projects` and `chores` are defaulted defensively: an older/partial routing
    // response that omits a module key would otherwise leave it undefined, and an
    // undefined module reads as neither on nor off in the chip row.
    modules: { ...r.modules, projects: r.modules?.projects ?? false, chores: r.modules?.chores ?? false },
    subjects: r.homeschool?.subjects ?? [],
    // Pre-fill the per-subject hours the AI proposed (if any); the user confirms/edits.
    // Single-subject events default that subject to the event's total hours.
    subjectHours: (() => {
      const subs = r.homeschool?.subjects ?? []
      const ai = r.homeschool?.subject_hours ?? null
      const out: Record<string, string> = {}
      if (ai) {
        for (const s of subs) if (ai[s] != null) out[s] = ai[s].toString()
      } else if (subs.length === 1 && r.homeschool?.inferred_hours != null) {
        out[subs[0]] = r.homeschool.inferred_hours.toString()
      }
      return out
    })(),
    // With exactly one child there is nothing to guess — "did math today" can only mean them.
    // With two or more, an unnamed school event is genuinely ambiguous and the confirm step
    // makes the user pick (see `needsChildPick`). It must NEVER silently pick the first child:
    // that writes hours onto one kid's compliance record off nothing but array order.
    namedChildren: (() => {
      const matched = matchChildNames(r.homeschool?.named_children ?? [], childList)
      if (matched.length === 0 && childList.length === 1 && r.modules?.homeschool) {
        return [childList[0].name]
      }
      return matched
    })(),
    hours: r.homeschool?.inferred_hours?.toString() ?? '',
    subModule: defaultHomesteadSubModule(r.homestead),
    gardenEvent: resolveGardenEvent({
      garden_event: r.homestead?.garden_event,
      quantity: r.homestead?.quantity,
      description: r.event_description,
      sale_detected: r.homestead?.sale_detected,
      sale_amount: r.homestead?.sale_amount,
    }),
    quantity: r.homestead?.quantity?.toString() ?? '',
    unit: r.homestead?.unit ?? '',
    saleAmount: r.homestead?.sale_amount?.toString() ?? '',
    equipment: r.home_diy?.equipment_name ?? '',
    equipmentCategory: 'other',
    equipmentInterval: '',
    projectId: matched?.id ?? '',
    projectTaskTitle: r.projects?.task_title ?? r.event_description ?? '',
    projectComplete: r.projects?.is_complete ?? false,
    skip: false,
  }
}

const MAX_PHOTOS = 5
const MAX_FILE_MB = 10

// A photo staged against a SPECIFIC event on the confirm step: the file, its data-URL
// preview, and the child(ren) who are IN it (drives per-child yearbook attribution).
type PendingPhoto = { key: string; file: File; preview: string; childIds: string[] }

export default function UniversalLogForm({
  childList,
  subjects,
  activeYears,
  stateRequirements,
  equipment = [],
  projects = [],
  chores = [],
  mode = 'page',
  snapshot,
}: {
  childList: Child[]
  subjects: Subject[]
  activeYears: SchoolYear[]
  stateRequirements: Record<string, StateRequirement>
  // The user's existing tracked equipment — lets the confirm step detect when a
  // maintenance event names something NOT yet tracked, and offer to create it.
  equipment?: { id: string; equipment_name: string }[]
  // The user's existing projects — lets the router route a "worked on X" entry to
  // the right project instead of mis-creating equipment.
  projects?: ProjectLite[]
  // The user's active recurring chores. A completion MUST reference one of these —
  // chore_completions.chore_id is a NOT NULL foreign key — so the log matches against this
  // list and never invents a chore from a sentence.
  chores?: ChoreForLog[]
  // 'page' = standalone full-screen log (its own chrome). 'embedded' = rendered
  // as the dashboard landing (no breadcrumb; the page provides chrome + width,
  // and `snapshot` is slotted beneath the capture box on the describe step only).
  mode?: 'page' | 'embedded'
  snapshot?: ReactNode
}) {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState<Step>('describe')
  const [description, setDescription] = useState('')
  const [logDate, setLogDate] = useToday()
  const [events, setEvents] = useState<EventConfirmState[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const descriptionRef = useRef<HTMLTextAreaElement>(null)

  // ── PER-EVENT PHOTOS ──
  // Photos are attached to a SPECIFIC event on the confirm step (not the whole day), so we
  // know exactly what each photo is of. Keyed by the event's index in `events`. Each photo
  // carries its own child tags (who's IN it) — seeded from that event's named children —
  // which drive per-child attribution in the yearbook.
  const [eventPhotos, setEventPhotos] = useState<Record<number, PendingPhoto[]>>({})
  const [photoError, setPhotoError] = useState('')
  // The log itself saved, but attaching its photos failed. Non-fatal, but the user is the
  // only one who can fix it — so it belongs on the success screen, not in the console.
  const [photoAttachWarning, setPhotoAttachWarning] = useState('')
  const photoKeyRef = useRef(0)

  // The stored-child ids named on an event (resolve stored names → ids).
  // A school event with no child picked can't be saved: we won't guess who it belongs to.
  // (A one-child family is auto-filled at init, so this never fires for them.)
  function needsChildPick(ev: EventConfirmState): boolean {
    return !ev.skip && ev.modules.homeschool && ev.namedChildren.length === 0 && childList.length > 0
  }

  function eventNamedChildIds(ev: EventConfirmState): string[] {
    return ev.namedChildren.map(n => childList.find(c => c.name === n)?.id).filter(Boolean) as string[]
  }

  function addEventPhotos(idx: number, fileList: FileList | null) {
    setPhotoError('')
    const files = Array.from(fileList ?? [])
    if (!files.length) return
    const oversized = files.find(f => f.size > MAX_FILE_MB * 1024 * 1024)
    if (oversized) { setPhotoError(`${oversized.name} is over ${MAX_FILE_MB}MB`); return }
    const cur = eventPhotos[idx] ?? []
    const room = Math.max(0, MAX_PHOTOS - cur.length)
    if (room <= 0) { setPhotoError(`Up to ${MAX_PHOTOS} photos per event`); return }
    // Seed each new photo's child tags from the event's named children: exactly one named
    // child → auto-tag it (zero taps); zero or several → start untagged so the user says
    // who's in each (mirrors the old smart auto-tag, now scoped to the event).
    const ids = eventNamedChildIds(events[idx])
    const seed = ids.length === 1 ? [ids[0]] : []
    const toAdd: PendingPhoto[] = files.slice(0, room).map(file => ({
      key: `p${photoKeyRef.current++}`, file, preview: '', childIds: [...seed],
    }))
    setEventPhotos(prev => ({ ...prev, [idx]: [...(prev[idx] ?? []), ...toAdd] }))
    // Generate previews async; match each back to its photo by stable key (index-shift safe).
    toAdd.forEach(p => {
      const reader = new FileReader()
      reader.onload = e => setEventPhotos(prev => ({
        ...prev,
        [idx]: (prev[idx] ?? []).map(x => x.key === p.key ? { ...x, preview: e.target?.result as string } : x),
      }))
      reader.readAsDataURL(p.file)
    })
  }

  function removeEventPhoto(idx: number, key: string) {
    setEventPhotos(prev => ({ ...prev, [idx]: (prev[idx] ?? []).filter(p => p.key !== key) }))
  }

  function toggleEventPhotoChild(idx: number, key: string, childId: string) {
    setEventPhotos(prev => ({
      ...prev,
      [idx]: (prev[idx] ?? []).map(p => {
        if (p.key !== key) return p
        const has = p.childIds.includes(childId)
        return { ...p, childIds: has ? p.childIds.filter(c => c !== childId) : [...p.childIds, childId] }
      }),
    }))
  }

  // Phase C: the week's planner blocks for the log date, so logging a subject can
  // check it off in the plan. Loaded at analyze time; matched per event on render.
  const [plannerWeeksC, setPlannerWeeksC] = useState<PlannerWeek[]>([])
  const [plannerItemsC, setPlannerItemsC] = useState<PlannerItem[]>([])
  // event idx → include the plan check-off (default on; set false to skip)
  const [checkPlanner, setCheckPlanner] = useState<Record<number, boolean>>({})

  // The user's own saved units (custom_units), merged into every unit dropdown here.
  // Loaded once; a unit added inline is appended so it shows immediately everywhere.
  const [customUnits, setCustomUnits] = useState<string[]>([])
  useEffect(() => {
    let active = true
    supabase.from('custom_units').select('unit').order('unit').then(({ data }) => {
      if (active && data) setCustomUnits(data.map(r => r.unit as string))
    })
    return () => { active = false }
  }, [supabase])

  async function addCustomUnit(unit: string) {
    const u = unit.trim()
    if (!u || customUnits.some(c => c.toLowerCase() === u.toLowerCase())) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    // Unique index (user_id, lower(unit)) makes a duplicate a 23505 — treat it as success
    // (the unit already exists) and reflect it locally either way.
    const { error } = await supabase.from('custom_units').insert({ user_id: user.id, unit: u })
    if (!error || error.code === '23505') {
      setCustomUnits(prev => prev.some(c => c.toLowerCase() === u.toLowerCase()) ? prev : [...prev, u])
    }
  }

  // Append a blank, user-authored event to the confirm list — a safety net for anything
  // the AI missed or a chore it intentionally omitted. Starts with no module selected.
  function addManualEvent() {
    setEvents(prev => [...prev, { ...initEventState(blankRouting(), childList, projects, chores), isManual: true }])
  }

  const allSubjectPills = (() => {
    const firstChildYear = activeYears[0]
    const req = firstChildYear ? stateRequirements[firstChildYear.state] : null
    const stateNames = req?.subjects.map(s => s.name) ?? []
    const existingNames = subjects.map(s => s.name)
    const customOnly = existingNames.filter(n => !stateNames.includes(n))
    // Always offer the catch-all so an auto-assigned "Life Skills" renders as a
    // selectable/editable pill (and users can pick it for practical-life activities).
    return [...new Set([...stateNames, ...customOnly, DEFAULT_HOMESCHOOL_SUBJECT])]
  })()

  // Does this equipment name already match a tracked item? Mirrors the save's
  // ilike %name% (existing contains entered, or entered contains existing).
  function matchExistingEquipment(name: string) {
    const n = (name ?? '').trim().toLowerCase()
    if (!n) return null
    return equipment.find(e => {
      const en = e.equipment_name.toLowerCase()
      return en.includes(n) || n.includes(en)
    }) ?? null
  }

  function updateEvent(idx: number, patch: Partial<EventConfirmState>) {
    setEvents(prev => prev.map((e, i) => i === idx ? { ...e, ...patch } : e))
  }

  function toggleEventModule(idx: number, key: keyof RoutingResult['modules']) {
    setEvents(prev => prev.map((e, i) =>
      i === idx ? { ...e, modules: { ...e.modules, [key]: !e.modules[key] } } : e
    ))
  }

  function toggleEventChild(idx: number, name: string) {
    setEvents(prev => prev.map((e, i) => {
      if (i !== idx) return e
      const has = e.namedChildren.includes(name)
      return { ...e, namedChildren: has ? e.namedChildren.filter(n => n !== name) : [...e.namedChildren, name] }
    }))
  }

  function toggleEventSubject(idx: number, name: string) {
    setEvents(prev => prev.map((e, i) => {
      if (i !== idx) return e
      const has = e.subjects.includes(name)
      const subjects = has ? e.subjects.filter(n => n !== name) : [...e.subjects, name]
      // Drop the hour allocation for a removed subject so it can't be saved orphaned.
      const subjectHours = { ...e.subjectHours }
      if (has) delete subjectHours[name]
      return { ...e, subjects, subjectHours }
    }))
  }

  function setSubjectHour(idx: number, name: string, value: string) {
    setEvents(prev => prev.map((e, i) =>
      i === idx ? { ...e, subjectHours: { ...e.subjectHours, [name]: value } } : e
    ))
  }

  // Split the event's total hours evenly across its currently-selected subjects.
  function splitHoursEvenly(idx: number) {
    setEvents(prev => prev.map((e, i) => {
      if (i !== idx) return e
      const total = parseFloat(e.hours)
      if (!e.subjects.length || !Number.isFinite(total) || total <= 0) return e
      const each = Math.round((total / e.subjects.length) * 100) / 100
      const subjectHours: Record<string, string> = {}
      e.subjects.forEach(s => { subjectHours[s] = each.toString() })
      return { ...e, subjectHours }
    }))
  }

  // Phase C: which planner blocks a homeschool event would check off — matched
  // EXACTLY by subject_id (falling back to the block's subject-name title) for each
  // named child, across the whole week, preferring the logged day. Covers daily
  // blocks (scheduled, not-yet-done) and one-off day blocks. Loop subjects keep
  // their own deliberate in-planner "Did the next one" and aren't auto-advanced here.
  function plannerMatchesForEvent(ev: EventConfirmState): { childName: string; subjectName: string; targets: PlannerTarget[] }[] {
    if (!ev.modules.homeschool || plannerWeeksC.length === 0) return []
    const monday = plannerWeekMonday(logDate)
    const dayIdx = plannerWeekdayIndex(logDate)
    // Only the children the user actually confirmed — same rule as the save path. Defaulting
    // here would tick off a planner block for a child who wasn't part of the event.
    const named = ev.namedChildren
    const out: { childName: string; subjectName: string; targets: PlannerTarget[] }[] = []
    for (const cname of named) {
      const child = childList.find(c => c.name === cname)
      if (!child) continue
      const wk = plannerWeeksC.find(w => w.child_id === child.id && w.week_start === monday)
      if (!wk) continue
      const wkItems = plannerItemsC.filter(i => i.week_id === wk.id)
      for (const sname of ev.subjects) {
        const sclean = sname.trim().toLowerCase()
        const subj = subjects.find(s => s.child_id === child.id && s.name.trim().toLowerCase() === sclean)
        const matchBlock = (b: PlannerItem) =>
          (!!subj && b.subject_id === subj.id) || (!!b.title && b.title.trim().toLowerCase() === sclean)
        // Prefer daily blocks scheduled on the logged day and not yet checked.
        const dailyT: PlannerTarget[] = wkItems
          .filter(b => b.track === 'daily' && matchBlock(b)
            && (b.daily_days ? b.daily_days[dayIdx] : true) && !(b.daily_done?.[dayIdx]))
          .map(b => ({ id: b.id, kind: 'daily', day: dayIdx }))
        let targets = dailyT
        if (targets.length === 0) {
          const dayBlocks = wkItems.filter(b => b.track === 'day' && matchBlock(b) && b.status !== 'done')
          const preferred = dayBlocks.filter(b => b.day_of_week === dayIdx)
          const chosen = (preferred.length ? preferred : dayBlocks)[0]
          if (chosen) targets = [{ id: chosen.id, kind: 'day' }]
        }
        // Fall back to a loop subject: logging it moves the line to the front,
        // drops a checked block on the logged day, and advances the rotation.
        if (targets.length === 0) {
          const loopB = wkItems.find(b => b.track === 'loop' && matchBlock(b))
          if (loopB) targets = [{ id: loopB.id, kind: 'loop' }]
        }
        if (targets.length) out.push({ childName: child.name, subjectName: sname, targets })
      }
    }
    return out
  }

  // Upload one photo file to storage; returns its public URL (or null on failure).
  async function uploadPhotoFile(userId: string, file: File): Promise<string | null> {
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${userId}/${logDate}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage
      .from('log-photos')
      .upload(path, file, { contentType: file.type, upsert: false })
    if (error) { console.error('Photo upload error:', error); return null }
    const { data: urlData } = supabase.storage.from('log-photos').getPublicUrl(path)
    return urlData?.publicUrl ?? null
  }

  async function handleAnalyze() {
    if (description.trim().length < 5) return
    setAnalyzing(true)
    setAnalyzeError('')

    try {
      const res = await fetch('/api/route-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: description.trim(),
          // Key MUST be `children` — the /api/route-log handler destructures `children`
          // from the body. (A lint rename once changed this to `childList`, silently
          // starving the router of the child list so names never resolved. Contract key,
          // not a local var — do not rename to match the `childList` prop.)
          children: childList.map(c => ({ id: c.id, name: c.name })),
          subjects: allSubjectPills.map(name => ({ name })),
          projects: projects.map(p => ({ id: p.id, title: p.title })),
          // Without this the model receives an empty chore list and, per the prompt, can
          // never set modules.chores — the branch would be dead code.
          chores: chores.map(c => ({ name: c.name })),
        }),
      })
      // Surface the server's own message (friendly capacity/too-big/parse errors) rather
      // than a generic failure — and never lose the user's typed text on a transient error.
      const data: RouteLogResponse & { error?: string } = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Analysis failed')
      setEvents(data.events.map(r => initEventState(r, childList, projects, chores)))
      setCheckPlanner({})
      // Photos are now attached per-event on the confirm step; clear any staged from a
      // previous analyze pass so indices can't drift onto the wrong (re-split) event.
      setEventPhotos({})
      // Phase C: load this week's planner blocks so we can offer plan check-off.
      // Best-effort — a planner read failing must never block logging.
      try {
        const monday = plannerWeekMonday(logDate)
        const { data: wks } = await supabase
          .from('planner_weeks').select('*').eq('week_start', monday).eq('is_template', false)
        const ids = (wks ?? []).map(w => w.id)
        const { data: pit } = ids.length
          ? await supabase.from('planner_items').select('*').in('week_id', ids)
          : { data: [] as PlannerItem[] }
        setPlannerWeeksC((wks ?? []) as PlannerWeek[])
        setPlannerItemsC((pit ?? []) as PlannerItem[])
      } catch { /* planner check-off is optional */ }
      setStep('confirm')
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : 'Could not analyze entry')
    } finally {
      setAnalyzing(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    setSaveError('')
    setPhotoAttachWarning('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    // Upload photos first, PER EVENT. Each photo is attributed to the exact event it was
    // attached to: caption = that event's description, child_ids = who's in the photo. Those
    // attributed rows go to the photos table (the yearbook reads these). The flat url list
    // still goes to daily_log via the RPC so the log-history views keep showing photos.
    const photoRows: { url: string; caption: string | null; childIds: string[] }[] = []
    for (const [idx, ev] of events.entries()) {
      if (ev.skip) continue
      const pend = eventPhotos[idx] ?? []
      const caption = ev.routing.event_description?.trim() || description.trim() || null
      for (const p of pend) {
        const url = await uploadPhotoFile(user.id, p.file)
        if (!url) continue
        photoRows.push({ url, caption, childIds: p.childIds })
      }
    }
    const photoUrls = photoRows.map(r => r.url)

    const activeEvents = events.filter(e => !e.skip)

    // Build a fully-resolved payload, then write it ALL atomically via one Postgres RPC
    // (save_log_entry) so a multi-table / multi-event save can't leave partial state or
    // duplicate on retry. The client still does the stable, tested resolution (child
    // targeting, Life-Skills fallback, sub-module normalization, hours clamp); the RPC does
    // subject + equipment find-or-create (needs live-DB idempotency) and every insert.
    const payload: Record<string, unknown>[] = []

    for (const ev of activeEvents) {
      const notes = ev.routing.event_description || description.trim()
      const out: Record<string, unknown> = { notes, is_homestead_day: ev.modules.homestead }

      // ── HOMESCHOOL ───────────────────────────────────────
      if (ev.modules.homeschool) {
        // No silent fallback to childList[0]. The confirm step blocks the save until a child
        // is picked, so an empty list here means "nothing to credit" — write no school record
        // rather than credit a child the parent never named. A wrong name on a compliance
        // record handed to a state evaluator is the failure mode INTEL §20 exists to prevent.
        const targetChildren = childList.filter(c => ev.namedChildren.includes(c.name))
        if (targetChildren.length > 0) {
          // Final guarantee: a school record must never save subject-less. Covers an empty
          // AI result OR a user clearing all pills while leaving School on (re-taggable).
          const subjectsToSave = ev.subjects.length > 0 ? ev.subjects : [DEFAULT_HOMESCHOOL_SUBJECT]
          // Per-subject hours: keyed by the SAME trimmed name the RPC iterates from `subjects`,
          // only positive values. Missing/blank subjects are simply absent (no fabricated split).
          const subjectHoursPayload: Record<string, number> = {}
          for (const s of subjectsToSave) {
            const v = parseFloat(ev.subjectHours[s] ?? '')
            if (Number.isFinite(v) && v > 0) subjectHoursPayload[s.trim()] = v
          }
          out.homeschool = {
            // Clamp hours >= 0: a negative inferred/typed value would corrupt totals.
            hours: ev.hours ? Math.max(0, parseFloat(ev.hours)) || null : null,
            subjects: subjectsToSave.map(s => s.trim()),
            subject_hours: Object.keys(subjectHoursPayload).length ? subjectHoursPayload : null,
            // Key MUST be `children` — the save_log_entry RPC iterates `hs->'children'`.
            // If this is renamed (a lint pass once made it `childList`), the RPC reads
            // null, the child loop runs zero times, and the ENTIRE school record is
            // silently dropped while the UI still says "saved". Contract key — never
            // rename to match the `childList` prop.
            children: targetChildren.map(c => ({
              child_id: c.id,
              school_year_id: activeYears.find(y => y.child_id === c.id)?.id ?? null,
            })),
          }
        }
      }

      // ── HOMESTEAD ────────────────────────────────────────
      if (ev.modules.homestead && ev.routing.homestead) {
        const r = ev.routing.homestead
        // Normalize to a REAL sub-module ∈ {livestock,garden,preservation,general} so the
        // right table is always chosen (a non-canonical value used to silently drop the event).
        const subMod = defaultHomesteadSubModule({ ...r, sub_module: ev.subModule ?? r.sub_module })
        const creditChildren = ev.namedChildren.map(n => childList.find(c => c.name === n)?.id).filter(Boolean)
        const schoolCredit = ev.modules.homeschool && ev.namedChildren.length > 0
        const qty = ev.quantity ? parseFloat(ev.quantity) : r.quantity
        // Set by the garden branch for a 'tending' event: real work, but nothing to record.
        let skipHomestead = false
        const hm: Record<string, unknown> = { sub_module: subMod, school_credit: schoolCredit, credit_child_ids: creditChildren }
        if (subMod === 'livestock' || subMod === 'general') {
          hm.animal_type = r.animal_type ?? null
          hm.quantity = qty
          hm.unit = ev.unit || r.unit || null
          // A manually-entered sale amount means it was sold even if the AI didn't flag it.
          hm.disposition = (ev.saleAmount || r.sale_detected) ? 'sold' : 'personal'
          hm.sale_amount = ev.saleAmount ? parseFloat(ev.saleAmount) : r.sale_amount
        } else if (subMod === 'garden') {
          // TENDING writes nothing. Weeding, watering, and mulching are real work but they
          // are not a point in the crop's lifecycle — there is no row to open and none to
          // close. Emitting no homestead payload here is what keeps a phantom planting from
          // being born (the old code inferred 'planted' from the absent quantity).
          // The event still reaches the RPC via its homeschool half when a child was named.
          if (ev.gardenEvent === 'tending') {
            skipHomestead = true
          } else {
            // Yield is a real column now (garden_entries.quantity/unit) — no longer folded into
            // the notes text, where it could never be summed or divided into cost.
            const harvestQty = ev.quantity || (r.quantity != null ? r.quantity.toString() : '')
            hm.crop_name = r.crop_or_item ?? null
            // Explicit, user-confirmed lifecycle stage — NOT inferred from quantity. The RPC
            // binds a harvest to the crop's OPEN planting rather than inserting a duplicate row.
            hm.garden_event = ev.gardenEvent
            hm.garden_status = gardenStatusFor(ev.gardenEvent)
            // A quantity only means anything on a harvest. "Planted 20 tomato starts" is a
            // count of seedlings, not a yield — writing it to the yield column would invent
            // a harvest of 20 lbs of tomatoes out of thin air.
            hm.quantity = ev.gardenEvent === 'harvest' ? (harvestQty || null) : null
            hm.unit = ev.gardenEvent === 'harvest' ? (ev.unit || r.unit || null) : null
            hm.garden_notes = notes || null
            // Produce revenue. Only a harvest can carry it — nothing has been picked off a
            // planting yet, and the DB enforces that (garden_entries_sale_needs_harvest).
            if (ev.gardenEvent === 'harvest') {
              const saleAmt = ev.saleAmount ? parseFloat(ev.saleAmount) : r.sale_amount
              if (saleAmt != null) {
                hm.disposition = 'sold'
                hm.sale_amount = saleAmt
              }
            }
          }
        } else if (subMod === 'preservation') {
          hm.item_name = r.crop_or_item ?? null
          hm.method = r.preservation_method ?? null
          hm.quantity = qty
          hm.unit = ev.unit || r.unit || null
          // "Sold 6 jars of jam for $30" is revenue. preservation_logs carries the sale now.
          const saleAmt = ev.saleAmount ? parseFloat(ev.saleAmount) : r.sale_amount
          if (saleAmt != null) {
            hm.disposition = 'sold'
            hm.sale_amount = saleAmt
          }
        }
        if (!skipHomestead) out.homestead = hm
      }

      // ── HOME & DIY ───────────────────────────────────────
      if (ev.modules.home_diy && ev.routing.home_diy?.is_maintenance) {
        const equipName = (ev.equipment || ev.routing.home_diy.equipment_name || '').trim()
        if (equipName) {
          // Existing-vs-new equipment match + next-service date now happen in the RPC
          // (uses live DB state, so a retry can't create a duplicate piece of equipment).
          out.home_diy = {
            equipment_name: equipName,
            category: ev.equipmentCategory || 'other',
            interval_days: ev.equipmentInterval ? parseInt(ev.equipmentInterval, 10) : null,
            notes,
          }
        }
      }

      // ── PROJECTS ─────────────────────────────────────────
      if (ev.modules.projects && ev.projectId) {
        const title = (ev.projectTaskTitle || ev.routing.event_description || description.trim()).trim()
        if (title) {
          out.project = { project_id: ev.projectId, title, is_complete: ev.projectComplete }
        }
      }

      // ── CHORES ───────────────────────────────────────────
      if (ev.modules.chores && ev.choreId) {
        const chore = chores.find(c => c.id === ev.choreId)
        if (chore) {
          const cadence = (chore.cadence_type === 'weekly'
            ? { cadence_type: 'weekly', weekday: chore.weekday }
            : { cadence_type: 'interval', interval_days: chore.interval_days }) as ChoreCadence
          out.chore = {
            chore_id: chore.id,
            // Computed HERE with the one implementation of the cadence rule. The RPC writes
            // this value; it deliberately does not recompute it.
            next_due_date: nextDueDate(cadence, logDate),
            // Deliberately NOT credited from the log. The reports sum daily_log hours AND
            // chore_completions.credit_hours, so crediting here — on a day whose hours are
            // already recorded above — would count the same work twice. Crediting a chore
            // stays on the chores page, where it is the only record of that work.
            school_credit: false,
            child_ids: [],
            subject_ids: [],
          }
        }
      }

      // Only send events that actually resolved to something saveable. Guards a manual
      // "Add event" card the user left blank (or one where every module was toggled off)
      // — otherwise it becomes a no-op payload entry.
      if (out.homeschool || out.homestead || out.home_diy || out.project || out.chore) {
        payload.push(out)
      }
    }

    // Atomic write — every event + table in ONE transaction. All-or-nothing; a failure
    // rolls back fully so a retry can't duplicate (subject/equipment resolution is
    // idempotent inside the RPC).
    const { error: rpcError } = await supabase.rpc('save_log_entry', {
      p_log_date: logDate,
      p_photo_urls: photoUrls,
      p_events: payload,
    })
    if (rpcError) {
      // Never surface the raw Postgres text (constraint names, type-coercion internals).
      // The RPC is atomic, so the rollback is complete and the user's events are untouched
      // on screen — they can fix the flagged field and hit save again.
      setSaveError(friendlySaveError(rpcError))
      setSaving(false)
      return
    }

    // Attributed photos → photos table (the yearbook reads these, per-child via child_ids).
    // Written AFTER the RPC succeeds so a failed/retried save can't leave orphan photo rows.
    // Each row's caption is its OWN event's description + child_ids are who's in that photo,
    // so a photo is tied to exactly what it was of (not just the whole day).
    if (photoRows.length > 0) {
      const { error: photoErr } = await supabase.from('photos').insert(
        photoRows.map(r => ({
          user_id: user.id,
          url: r.url,
          taken_on: logDate,
          caption: r.caption,
          child_ids: r.childIds,
          source: 'log',
        }))
      )
      // Non-fatal: the photo is already stored + on daily_log, so a photos-table hiccup must
      // not fail the whole log. But it must not be SILENT either — the photo won't appear in
      // the yearbook, and the user is the only one who can re-add it. Tell them on the
      // success screen instead of swallowing it into the console.
      if (photoErr) {
        console.error('photos insert error:', photoErr)
        setPhotoAttachWarning(
          photoRows.length === 1
            ? 'Your entry saved, but the photo couldn’t be attached. You can add it again from Manage photos.'
            : 'Your entry saved, but the photos couldn’t be attached. You can add them again from Manage photos.'
        )
      }
    }

    // ── PHASE C: check off matched blocks in this week's plan ────────────
    // Best-effort and AFTER the log is written — a planner update failing must
    // never fail the log. We only MARK planner blocks here; the universal log
    // already wrote the daily_log, so there's no planner-sourced double-count.
    for (const [idx, ev] of events.entries()) {
      if (ev.skip || !ev.modules.homeschool || checkPlanner[idx] === false) continue
      const targets = plannerMatchesForEvent(ev).flatMap(m => m.targets)
      for (const t of targets) {
        const now = new Date().toISOString()
        if (t.kind === 'daily') {
          const b = plannerItemsC.find(i => i.id === t.id)
          const dd = { ...(b?.daily_done ?? {}), [t.day as number]: true }
          await supabase.from('planner_items').update({ daily_done: dd, updated_at: now }).eq('id', t.id)
        } else if (t.kind === 'day') {
          await supabase.from('planner_items').update({ status: 'done', updated_at: now }).eq('id', t.id)
        } else {
          // Loop: mark that loop row done for the rotation and drop a checked
          // block onto the logged day. (Loop is an any-order pool now — no pointer.)
          const b = plannerItemsC.find(i => i.id === t.id)
          if (!b) continue
          await supabase.from('planner_items').update({ status: 'done', updated_at: now }).eq('id', b.id)
          await supabase.from('planner_items').insert({
            user_id: user.id, week_id: b.week_id, track: 'day', day_of_week: plannerWeekdayIndex(logDate),
            subject_id: b.subject_id, title: b.title, notes: b.notes ?? '', status: 'done', sequence: 0,
          })
        }
      }
    }

    setSaving(false)
    setStep('done')
  }

  // ── DONE SCREEN ──────────────────────────────────────────────────────────────
  if (step === 'done') {
    const active = events.filter(e => !e.skip)
    const savedPhotoCount = events.reduce((n, ev, i) => n + (ev.skip ? 0 : (eventPhotos[i]?.length ?? 0)), 0)
    const modules = { homeschool: false, homestead: false, home_diy: false, projects: false }
    active.forEach(e => {
      if (e.modules.homeschool) modules.homeschool = true
      // A garden 'tending' event writes no homestead row — mirror the save path's skip here
      // or the success screen tells the user we saved a Homestead log that doesn't exist.
      if (e.modules.homestead && !(e.subModule === 'garden' && e.gardenEvent === 'tending')) modules.homestead = true
      if (e.modules.home_diy) modules.home_diy = true
      if (e.modules.projects && e.projectId) modules.projects = true
    })
    const saved = [
      modules.homeschool && 'School record',
      modules.homestead && 'Homestead log',
      modules.home_diy && 'Maintenance log',
      modules.projects && 'Project update',
    ].filter(Boolean) as string[]

    function resetForm() {
      setStep('describe')
      setDescription('')
      setEvents([])
      setLogDate(todayLocalISO())
      setEventPhotos({})
      setPhotoAttachWarning('')
      // Refresh the server-rendered snapshot so the landing reflects what was just logged.
      if (mode === 'embedded') router.refresh()
    }

    const successInner = (
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-4">✓</div>
        <h2 className="text-2xl font-bold mb-2">Logged.</h2>
        {active.length > 1 && (
          <p className="text-muted text-sm mb-1">{active.length} events saved.</p>
        )}
        {savedPhotoCount > 0 && !photoAttachWarning && (
          <p className="text-subtle text-sm mb-1">{savedPhotoCount} photo{savedPhotoCount !== 1 ? 's' : ''} attached.</p>
        )}
        {photoAttachWarning && (
          <p role="status" className="text-amber-700 dark:text-amber-400 text-sm mb-1">{photoAttachWarning}</p>
        )}
        <p className="text-subtle text-sm mb-8">{saved.join(' · ')}</p>
        <div className="flex flex-col gap-3">
          <button
            onClick={resetForm}
            className="bg-green-700 hover:bg-green-600 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
          >
            Log another entry
          </button>
          {mode === 'page' && (
            <Link href="/dashboard" className="text-muted hover:text-content text-sm transition-colors">
              Back to dashboard
            </Link>
          )}
        </div>
      </div>
    )

    if (mode === 'embedded') {
      return <div className="flex items-center justify-center py-16">{successInner}</div>
    }
    return (
      <div className="min-h-screen bg-surface text-content flex items-center justify-center px-6">
        {successInner}
      </div>
    )
  }

  // ── MAIN RENDER ──────────────────────────────────────────────────────────────
  const body = (
    <>

        {/* ── STEP 1: DESCRIBE ── */}
        {step === 'describe' && (
          <>
            <h2 className="text-xl font-bold mb-1">What did your day look like?</h2>
            <p className="text-muted text-sm mb-8">
              Describe your whole day — school, homestead, repairs, all of it in one go.
            </p>
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2" htmlFor="date-1">Date</label>
                <input id="date-1"
                  type="date"
                  value={logDate}
                  onChange={e => setLogDate(e.target.value)}
                  className="w-full appearance-none bg-elevated border border-line-strong rounded-lg px-4 py-2.5 text-content focus:outline-none focus:border-green-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2" htmlFor="describe-your-day-2">
                  Describe your day
                </label>
                <textarea id="describe-your-day-2"
                  ref={descriptionRef}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder={
                    childList.length > 0
                      ? `e.g. "${childList[0].name} and I worked through long division and read two chapters this morning. Then we collected eggs from the Barred Rocks — 14 today. Changed the oil on the tractor in the afternoon."`
                      : 'e.g. Collected 14 eggs. Changed the oil on the tractor. Read two chapters of history with the kids this morning.'
                  }
                  rows={6}
                  className="w-full bg-elevated border border-line-strong rounded-lg px-4 py-3 text-content placeholder-subtle focus:outline-none focus:border-green-600 resize-none text-sm leading-relaxed"
                />
                <p className="text-xs text-subtle mt-2">
                  Name your kids to add school credit. Describe the whole day — we&apos;ll split it into events automatically.
                  <span className="block mt-1">📷 You&apos;ll add photos to specific events on the next step.</span>
                </p>
              </div>

              {analyzeError && <p className="text-amber-600 dark:text-amber-400 text-sm">{analyzeError}</p>}

              <button
                onClick={handleAnalyze}
                disabled={analyzing || description.trim().length < 5}
                className="w-full bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-colors text-base flex items-center justify-center gap-2"
              >
                {analyzing ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Analyzing your day...
                  </>
                ) : '✦ Review & confirm →'}
              </button>
            </div>

            {/* Landing snapshot strip — present only in embedded (dashboard) mode,
                and only on the describe step (confirm/done take over the screen). */}
            {snapshot}
          </>
        )}

        {/* ── STEP 2: CONFIRM ── */}
        {step === 'confirm' && events.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="text-xl font-bold mb-1">
                  {events.length > 1 ? `${events.length} events found` : 'Here\'s what we found'}
                </h2>
                <p className="text-muted text-sm">
                  {events.length > 1
                    ? 'We split your entry into separate events. Review each one before saving.'
                    : 'Review and adjust before saving.'}
                </p>
              </div>
              <button
                onClick={() => setStep('describe')}
                className="text-subtle hover:text-content text-sm transition-colors shrink-0 ml-4"
              >
                ← Edit
              </button>
            </div>

            {/* Original description */}
            <div className="bg-card/50 border border-line rounded-xl px-4 py-3 mb-6">
              <p className="text-xs text-subtle mb-1">{logDate}</p>
              <p className="text-sm text-content leading-relaxed line-clamp-3">{description}</p>
            </div>

            <div className="space-y-4">
              {events.map((ev, idx) => (
                <div
                  key={idx}
                  className={`border rounded-xl overflow-hidden transition-all ${
                    ev.skip ? 'border-line opacity-40' : 'border-line-strong'
                  }`}
                >
                  <div className="flex items-center justify-between px-4 py-3 bg-card/60 border-b border-line">
                    <div className="flex items-center gap-2 min-w-0">
                      {events.length > 1 && (
                        <span className="text-xs font-bold text-subtle shrink-0">{idx + 1}/{events.length}</span>
                      )}
                      <p className="text-sm text-content truncate">{ev.routing.event_description || (ev.isManual ? 'New event' : 'Event')}</p>
                    </div>
                    {events.length > 1 && (
                      <button
                        onClick={() => updateEvent(idx, { skip: !ev.skip })}
                        className="text-xs text-subtle hover:text-content shrink-0 ml-3 transition-colors"
                      >
                        {ev.skip ? 'Include' : 'Skip'}
                      </button>
                    )}
                  </div>

                  {!ev.skip && (
                    <div className="p-4 space-y-4">
                      {ev.isManual && (
                        <div>
                          <label htmlFor={`manual-desc-${idx}`} className="block text-xs text-subtle mb-1.5">What happened?</label>
                          <input
                            id={`manual-desc-${idx}`}
                            type="text"
                            value={ev.routing.event_description}
                            onChange={e => updateEvent(idx, { routing: { ...ev.routing, event_description: e.target.value } })}
                            placeholder="e.g. Mucked out the barn, split firewood"
                            className="w-full bg-elevated border border-line-strong rounded-lg px-3 py-2 text-content text-sm placeholder-subtle focus:outline-none focus:border-green-600"
                          />
                          <p className="text-xs text-subtle mt-1.5">Then pick what it counts as:</p>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {[
                          { key: 'homeschool' as const, label: '📚 School', color: 'green' },
                          { key: 'homestead' as const, label: '🌱 Garden & animals', color: 'amber' },
                          { key: 'home_diy' as const, label: '🔧 Equipment', color: 'sky' },
                          { key: 'projects' as const, label: '🔨 Projects', color: 'purple' },
                          ...(chores.length
                            ? [{
                                key: 'chores' as const,
                                // Name the chore on the chip. Confirming this marks it done and moves its
                                // next due date; "Chores" alone would not say which one.
                                label: `🔁 ${chores.find(c => c.id === ev.choreId)?.name ?? 'Chores'}`,
                                color: 'amber' as const,
                              }]
                            : []),
                        ].map(({ key, label, color }) => {
                          const active = ev.modules[key]
                          return (
                            <button
                              key={key}
                              type="button"
                              aria-pressed={active}
                              onClick={() => toggleEventModule(idx, key)}
                              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                                active
                                  ? color === 'green'
                                    ? 'bg-green-100 border-green-300 text-green-800 dark:bg-green-800/60 dark:border-green-700 dark:text-green-300'
                                    : color === 'amber'
                                      ? 'bg-amber-100 border-amber-300 text-amber-800 dark:bg-amber-900/40 dark:border-amber-800 dark:text-amber-300'
                                      : color === 'purple'
                                        ? 'bg-purple-100 border-purple-300 text-purple-800 dark:bg-purple-900/40 dark:border-purple-800 dark:text-purple-300'
                                        : 'bg-sky-100 border-sky-300 text-sky-800 dark:bg-sky-900/40 dark:border-sky-800 dark:text-sky-300'
                                  : 'bg-elevated/40 border-line-strong text-subtle'
                              }`}
                            >
                              {label} {active ? '✓' : '–'}
                            </button>
                          )
                        })}
                      </div>

                      {ev.modules.homeschool && (
                        <div className="bg-green-50 border border-green-200 dark:bg-green-950/20 dark:border-green-900/40 rounded-lg p-3 space-y-3">
                          <p className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wider">School record</p>
                          {childList.length > 0 && (
                            <div>
                              {needsChildPick(ev) ? (
                                <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1.5">
                                  ⚠ Who did this? We won’t guess which child to credit.
                                </p>
                              ) : (
                                <p className="text-xs text-subtle mb-1.5">Children</p>
                              )}
                              <div className="flex flex-wrap gap-2">
                                {childList.map(c => {
                                  const sel = ev.namedChildren.includes(c.name)
                                  return (
                                    // aria-pressed: these are toggles, and colour alone was the only
                                    // signal of who is being credited — invisible to a screen reader.
                                    <button key={c.id} type="button" aria-pressed={sel}
                                      onClick={() => toggleEventChild(idx, c.name)}
                                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${sel ? 'bg-green-700 text-white' : 'bg-elevated text-muted hover:bg-line-strong'}`}>
                                      {c.name}
                                    </button>
                                  )
                                })}
                              </div>
                              <p className="text-xs text-subtle mt-1">Only named children get school credit.</p>
                            </div>
                          )}
                          <div>
                            <p className="text-xs text-subtle mb-1.5">Subjects</p>
                            <div className="flex flex-wrap gap-1.5">
                              {allSubjectPills.map(name => {
                                const sel = ev.subjects.includes(name)
                                return (
                                  <button key={name} onClick={() => toggleEventSubject(idx, name)}
                                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${sel ? 'bg-green-700 text-white' : 'bg-elevated text-muted hover:bg-line-strong'}`}>
                                    {name}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-subtle">Hours</p>
                            <input
                              type="number" value={ev.hours}
                              onChange={e => updateEvent(idx, { hours: e.target.value })}
                              min="0" max="24" step="0.5" placeholder="e.g. 2"
                              className="w-20 bg-elevated border border-line-strong rounded-lg px-3 py-1 text-content text-sm focus:outline-none focus:border-green-600 text-center"
                            />
                            <span className="text-xs text-subtle">hrs total</span>
                          </div>

                          {/* Per-subject hours — drives exact core-subject compliance. Optional,
                              but the more it's filled the more precise the state report. */}
                          {ev.subjects.length > 0 && (() => {
                            const allocated = ev.subjects.reduce((s, name) => {
                              const v = parseFloat(ev.subjectHours[name] ?? '')
                              return s + (Number.isFinite(v) && v > 0 ? v : 0)
                            }, 0)
                            const total = parseFloat(ev.hours)
                            const totalNum = Number.isFinite(total) ? total : 0
                            const allocRounded = Math.round(allocated * 100) / 100
                            const mismatch = totalNum > 0 && Math.abs(allocRounded - totalNum) > 0.05
                            return (
                              <div className="rounded-lg border border-line/60 bg-elevated/40 p-2.5 space-y-2">
                                <div className="flex items-center justify-between">
                                  <p className="text-xs text-subtle">Hours per subject <span className="text-subtle/70">(optional)</span></p>
                                  {ev.subjects.length > 1 && totalNum > 0 && (
                                    <button type="button" onClick={() => splitHoursEvenly(idx)}
                                      className="text-xs text-green-700 dark:text-green-400 hover:underline">Split evenly</button>
                                  )}
                                </div>
                                <div className="space-y-1.5">
                                  {ev.subjects.map(name => (
                                    <div key={name} className="flex items-center gap-2">
                                      <span className="text-xs text-content flex-1 truncate">{name}</span>
                                      <input
                                        type="number" value={ev.subjectHours[name] ?? ''}
                                        onChange={e => setSubjectHour(idx, name, e.target.value)}
                                        min="0" max="24" step="0.25" placeholder="—"
                                        className="w-16 bg-surface border border-line-strong rounded-md px-2 py-1 text-content text-xs focus:outline-none focus:border-green-600 text-center"
                                      />
                                      <span className="text-xs text-subtle w-6">hrs</span>
                                    </div>
                                  ))}
                                </div>
                                {(allocRounded > 0 || totalNum > 0) && (
                                  <p className={`text-xs ${mismatch ? 'text-amber-600 dark:text-amber-400' : 'text-subtle'}`}>
                                    Allocated {allocRounded}h{totalNum > 0 ? ` of ${totalNum}h` : ''}
                                    {mismatch ? ' — doesn’t match the total yet (that’s OK; only allocated hours count toward core subjects).' : ''}
                                  </p>
                                )}
                              </div>
                            )
                          })()}
                          {(() => {
                            const matches = plannerMatchesForEvent(ev)
                            if (matches.length === 0) return null
                            const checked = checkPlanner[idx] !== false
                            const labels = matches.map(m => `${m.subjectName}${ev.namedChildren.length > 1 ? ` (${m.childName})` : ''}`)
                            return (
                              <label className="flex items-start gap-2 text-xs text-green-800 dark:text-green-300 bg-green-100/60 dark:bg-green-900/30 rounded-lg px-2.5 py-2 cursor-pointer">
                                <input type="checkbox" checked={checked} className="mt-0.5 accent-green-600"
                                  onChange={e => setCheckPlanner(prev => ({ ...prev, [idx]: e.target.checked }))} />
                                <span>Check off in this week&rsquo;s plan: <span className="font-medium">{labels.join(', ')}</span></span>
                              </label>
                            )
                          })()}
                        </div>
                      )}

                      {ev.modules.homestead && ev.routing.homestead && (
                        <div className="bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/40 rounded-lg p-3 space-y-2">
                          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Homestead log</p>
                          <div className="flex flex-wrap gap-1.5">
                            {(['livestock', 'garden', 'preservation', 'general'] as const).map(mod => (
                              <button key={mod} onClick={() => updateEvent(idx, { subModule: mod })}
                                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors capitalize border ${ev.subModule === mod ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-700/60 dark:text-amber-200 dark:border-amber-600' : 'bg-elevated text-muted border-line-strong hover:bg-line-strong'}`}>
                                {mod}
                              </button>
                            ))}
                          </div>
                          {ev.routing.homestead.animal_type && (
                            <p className="text-xs text-muted">Animal: <span className="text-content">{ev.routing.homestead.animal_type}</span></p>
                          )}
                          {ev.routing.homestead.crop_or_item && (
                            <p className="text-xs text-muted">Item: <span className="text-content">{ev.routing.homestead.crop_or_item}</span></p>
                          )}
                          {ev.subModule === 'garden' && (
                            <div className="space-y-1.5">
                              <p className="text-xs text-subtle">What happened to this crop?</p>
                              <div className="flex flex-wrap gap-1.5">
                                {GARDEN_EVENTS.map(g => (
                                  <button key={g} onClick={() => updateEvent(idx, { gardenEvent: g })}
                                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors capitalize border ${ev.gardenEvent === g ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-700/60 dark:text-amber-200 dark:border-amber-600' : 'bg-elevated text-muted border-line-strong hover:bg-line-strong'}`}>
                                    {g}
                                  </button>
                                ))}
                              </div>
                              {ev.gardenEvent === 'tending' && (
                                <p className="text-xs text-muted leading-relaxed">
                                  Nothing to track here — tending won’t create a garden record.
                                  {ev.namedChildren.length > 0 && ' The school credit above still saves.'}
                                  {' '}Pick <span className="text-content font-medium">Planting</span> or{' '}
                                  <span className="text-content font-medium">Harvest</span> if we read that wrong.
                                </p>
                              )}
                            </div>
                          )}
                          {(() => {
                            // Anything you can sell: animals, produce, and preserved goods. A garden
                            // sale is only possible on a harvest — never a planting or a tending.
                            const showSale = ev.subModule === 'livestock' || ev.subModule === 'general' ||
                              ev.subModule === 'preservation' ||
                              (ev.subModule === 'garden' && ev.gardenEvent === 'harvest')
                            // A tending event has no quantity to capture, and a planting's
                            // "quantity" would be seedlings, not yield — don't offer the field.
                            if (ev.subModule === 'garden' && ev.gardenEvent !== 'harvest') return null
                            return (
                              <>
                                <p className="text-xs text-subtle">
                                  Quantity, unit{showSale ? ', and sale price (if you sold it)' : ''}
                                </p>
                                <div className="flex gap-2 flex-wrap items-center">
                                  <input type="number" value={ev.quantity}
                                    onChange={e => updateEvent(idx, { quantity: e.target.value })}
                                    placeholder={ev.routing.homestead.quantity?.toString() ?? 'Qty'}
                                    className="w-16 bg-elevated border border-line-strong rounded-lg px-2 py-1 text-content text-xs focus:outline-none focus:border-amber-600 text-center"
                                  />
                                  <UnitSelect
                                    value={ev.unit}
                                    onChange={u => updateEvent(idx, { unit: u })}
                                    options={builtinUnitsFor({ subModule: ev.subModule, animal: ev.routing.homestead.animal_type, method: ev.routing.homestead.preservation_method })}
                                    customUnits={customUnits}
                                    onAddCustom={addCustomUnit}
                                    className="w-28 bg-elevated border border-line-strong rounded-lg px-2 py-1 text-content text-xs focus:outline-none focus:border-amber-600"
                                    manageHref="/dashboard/account#units"
                                  />
                                  {showSale && (
                                    <input type="number" value={ev.saleAmount}
                                      onChange={e => updateEvent(idx, { saleAmount: e.target.value })}
                                      placeholder={ev.routing.homestead.sale_amount?.toString() ?? '$ sold'}
                                      className="w-20 bg-elevated border border-line-strong rounded-lg px-2 py-1 text-content text-xs focus:outline-none focus:border-amber-600 text-center"
                                    />
                                  )}
                                </div>
                              </>
                            )
                          })()}
                        </div>
                      )}

                      {ev.modules.home_diy && ev.routing.home_diy && (
                        <div className="bg-sky-50 border border-sky-200 dark:bg-sky-950/20 dark:border-sky-900/40 rounded-lg p-3 space-y-2">
                          <p className="text-xs font-semibold text-sky-700 dark:text-sky-400 uppercase tracking-wider">Maintenance log</p>
                          <input type="text" value={ev.equipment}
                            onChange={e => updateEvent(idx, { equipment: e.target.value })}
                            placeholder={ev.routing.home_diy.equipment_name ?? 'Equipment name'}
                            className="w-full bg-elevated border border-line-strong rounded-lg px-3 py-1.5 text-content text-sm focus:outline-none focus:border-sky-600"
                          />
                          {(() => {
                            const name = (ev.equipment || ev.routing.home_diy?.equipment_name || '').trim()
                            if (!name) return <p className="text-xs text-subtle">Name the equipment to log this service.</p>
                            const existing = matchExistingEquipment(name)
                            if (existing) {
                              return <p className="text-xs text-subtle">✓ Will update {existing.equipment_name}&apos;s last service date to {logDate}</p>
                            }
                            return (
                              <div className="space-y-2 pt-1">
                                <p className="text-xs text-sky-700 dark:text-sky-300">New equipment — we&apos;ll start tracking it.</p>
                                <div className="flex flex-wrap items-center gap-2">
                                  <select value={ev.equipmentCategory}
                                    onChange={e => updateEvent(idx, { equipmentCategory: e.target.value })}
                                    className="bg-elevated border border-line-strong rounded-lg px-2 py-1 text-content text-xs focus:outline-none focus:border-sky-600 capitalize">
                                    {EQUIPMENT_CATEGORIES.map(c => <option key={c} value={c} className="bg-card text-content capitalize">{c}</option>)}
                                  </select>
                                  <span className="text-xs text-subtle">service every</span>
                                  <input type="number" min="0" value={ev.equipmentInterval}
                                    onChange={e => updateEvent(idx, { equipmentInterval: e.target.value })}
                                    placeholder="—"
                                    className="w-14 bg-elevated border border-line-strong rounded-lg px-2 py-1 text-content text-xs focus:outline-none focus:border-sky-600 text-center"
                                  />
                                  <span className="text-xs text-subtle">days (optional)</span>
                                </div>
                              </div>
                            )
                          })()}
                        </div>
                      )}

                      {ev.modules.projects && (
                        <div className="bg-purple-50 border border-purple-200 dark:bg-purple-950/20 dark:border-purple-900/40 rounded-lg p-3 space-y-2">
                          <p className="text-xs font-semibold text-purple-700 dark:text-purple-400 uppercase tracking-wider">Project update</p>
                          <select
                            value={ev.projectId}
                            onChange={e => updateEvent(idx, { projectId: e.target.value })}
                            className="w-full bg-elevated border border-line-strong rounded-lg px-3 py-1.5 text-content text-sm focus:outline-none focus:border-purple-600"
                          >
                            <option value="" className="bg-card text-content">Select a project…</option>
                            {projects.map(p => (
                              <option key={p.id} value={p.id} className="bg-card text-content">{p.title}</option>
                            ))}
                          </select>
                          <input type="text" value={ev.projectTaskTitle}
                            onChange={e => updateEvent(idx, { projectTaskTitle: e.target.value })}
                            placeholder="What did you do? (added as a task)"
                            className="w-full bg-elevated border border-line-strong rounded-lg px-3 py-1.5 text-content text-sm focus:outline-none focus:border-purple-600"
                          />
                          <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
                            <input type="checkbox" checked={ev.projectComplete}
                              onChange={e => updateEvent(idx, { projectComplete: e.target.checked })} />
                            Mark this task complete
                          </label>
                          {!ev.projectId && (
                            <p className="text-xs text-subtle">Pick a project to log this update.</p>
                          )}
                        </div>
                      )}

                      {ev.modules.chores && (
                        <div className="bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/40 rounded-lg p-3 space-y-2">
                          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Chore done</p>
                          {/* A picker, not a label: the router can match the wrong chore or none at all,
                              and without this the chip could be switched on and quietly do nothing —
                              a completion needs a chore id, so an unmatched toggle writes nothing. */}
                          <select
                            value={ev.choreId ?? ''}
                            onChange={e => updateEvent(idx, { choreId: e.target.value || null })}
                            aria-label="Which chore did this complete?"
                            className="w-full bg-elevated border border-line-strong rounded-lg px-3 py-1.5 text-content text-sm focus:outline-none focus:border-amber-600"
                          >
                            <option value="" className="bg-card text-content">Select a chore…</option>
                            {chores.map(c => (
                              <option key={c.id} value={c.id} className="bg-card text-content">{c.name}</option>
                            ))}
                          </select>
                          {ev.choreId ? (
                            <p className="text-[11px] text-subtle">
                              Marks it done on this date and moves its next due date forward.
                            </p>
                          ) : (
                            <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                              Pick the chore this finished, or switch this off — nothing is recorded without one.
                            </p>
                          )}
                        </div>
                      )}

                      {/* ── PHOTOS FOR THIS EVENT ── */}
                      <div className="border-t border-line pt-3">
                        <p className="text-xs font-semibold text-subtle uppercase tracking-wider mb-2">
                          📷 Photos <span className="normal-case font-normal text-subtle/70">for this event · optional</span>
                        </p>
                        {(eventPhotos[idx]?.length ?? 0) > 0 && (
                          <div className="space-y-2 mb-2">
                            {eventPhotos[idx].map(p => (
                              <div key={p.key} className="flex items-start gap-2">
                                <div className="relative shrink-0">
                                  {p.preview ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={p.preview} alt="" className="w-14 h-14 object-cover rounded-md border border-line-strong" />
                                  ) : (
                                    <div className="w-14 h-14 rounded-md border border-line-strong bg-elevated animate-pulse" />
                                  )}
                                  <button type="button" onClick={() => removeEventPhoto(idx, p.key)}
                                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-elevated border border-line-strong rounded-full text-xs text-muted hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-800 flex items-center justify-center transition-colors"
                                    aria-label="Remove photo">✕</button>
                                </div>
                                {childList.length > 0 && (
                                  <div className="min-w-0">
                                    <p className="text-[11px] text-subtle mb-1">Who&rsquo;s in it? <span className="text-subtle/70">(optional)</span></p>
                                    <div className="flex flex-wrap gap-1">
                                      {childList.map(c => {
                                        const sel = p.childIds.includes(c.id)
                                        return (
                                          <button key={c.id} type="button" onClick={() => toggleEventPhotoChild(idx, p.key, c.id)}
                                            className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${sel ? 'bg-green-700 text-white' : 'bg-elevated text-muted hover:bg-line-strong'}`}>
                                            {c.name}
                                          </button>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {(eventPhotos[idx]?.length ?? 0) < MAX_PHOTOS && (
                          <>
                            <input type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple
                              onChange={e => { addEventPhotos(idx, e.target.files); e.target.value = '' }}
                              className="hidden" id={`photo-upload-${idx}`} />
                            <label htmlFor={`photo-upload-${idx}`}
                              className="inline-flex items-center gap-2 px-3 py-1.5 bg-elevated border border-line-strong border-dashed rounded-lg text-subtle hover:text-content cursor-pointer transition-colors text-xs">
                              <span className="text-sm">📷</span>
                              {(eventPhotos[idx]?.length ?? 0) === 0 ? 'Add photos' : `Add more (${eventPhotos[idx]!.length}/${MAX_PHOTOS})`}
                            </label>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Safety net: add anything the AI split missed (or a chore it omitted). */}
              <button
                type="button"
                onClick={addManualEvent}
                className="w-full border border-dashed border-line-strong rounded-xl py-3 text-sm text-subtle hover:text-content hover:border-line transition-colors"
              >
                ＋ Add an event
              </button>

              {photoError && <p className="text-red-600 dark:text-red-400 text-xs">{photoError}</p>}
              {saveError && <p className="text-red-600 dark:text-red-400 text-sm">{saveError}</p>}

              {/* We won't write school hours to a child the parent never named. */}
              {events.some(needsChildPick) && (
                <p role="alert" className="text-amber-700 dark:text-amber-400 text-sm text-center">
                  Pick who each school event was for — we won’t guess which child to credit.
                </p>
              )}

              <button
                onClick={handleSave}
                disabled={saving || events.every(e => e.skip) || events.some(needsChildPick)}
                className="w-full bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-colors text-base"
              >
                {saving
                  ? 'Saving...'
                  : events.length > 1
                    ? `Confirm & save ${events.filter(e => !e.skip).length} event${events.filter(e => !e.skip).length !== 1 ? 's' : ''}`
                    : 'Confirm & save'}
              </button>
              <p className="text-xs text-subtle text-center">Nothing is saved until you tap Confirm.</p>
            </div>
          </>
        )}
    </>
  )

  // Embedded (dashboard landing): the page owns the chrome, width, and padding.
  if (mode === 'embedded') return body

  // Standalone page: full-screen with its own breadcrumb.
  return (
    <div className="min-h-screen bg-surface text-content">
      <nav className="border-b border-line px-6 py-4 flex items-center gap-3">
        <Link href="/dashboard" className="text-subtle hover:text-content text-sm transition-colors">← Dashboard</Link>
        <span className="text-line-strong">/</span>
        <span className="text-sm font-semibold text-green-600 dark:text-green-400">
          {step === 'describe' ? 'Log Today' : 'Confirm Entry'}
        </span>
      </nav>
      <main className="max-w-lg mx-auto px-6 py-8">{body}</main>
    </div>
  )
}
