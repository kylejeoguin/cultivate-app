import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAccessInfo, sparkDailyLimit } from '@/lib/access'
import { appToday, seasonContext, MONTHS } from '@/lib/date'
import type { Child, SchoolYear } from '@/lib/types'

// The LLM call is fast (Haiku 4.5) but give it explicit headroom.
export const maxDuration = 30

const client = new Anthropic()

// Cap the log-history context so a power user with thousands of entries can't balloon a
// single call's input tokens (cost is tiny either way, but keep it bounded + fast).
const HISTORY_DAYS = 45
const MAX_NOTE_SNIPPETS = 6
const NOTE_CLIP = 160

type LogRow = { log_date: string; child_id?: string | null; notes: string | null; subject_ids: string[] | null }

function getAge(birthdate: string | null): number | null {
  if (!birthdate) return null
  const birth = new Date(birthdate)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  if (today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) {
    age--
  }
  return age
}

function clip(s: string, n: number): string {
  const t = s.trim()
  return t.length > n ? t.slice(0, n).trimEnd() + '…' : t
}

// Compact subject-coverage summary (top subjects by frequency) — signal without dumping raw logs.
function summarizeSubjects(logs: LogRow[], subjectMap: Record<string, string>): string {
  const freq: Record<string, number> = {}
  for (const l of logs) for (const id of (l.subject_ids ?? [])) {
    const name = subjectMap[id]
    if (name) freq[name] = (freq[name] ?? 0) + 1
  }
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 8)
  return sorted.length ? sorted.map(([n, c]) => `${n} (${c}x)`).join(', ') : 'none logged yet'
}

function recentNotes(logs: LogRow[]): string {
  const notes = logs
    .map(l => l.notes)
    .filter((n): n is string => !!n && !!n.trim())
    .slice(0, MAX_NOTE_SNIPPETS)
    .map(n => `- ${clip(n, NOTE_CLIP)}`)
  return notes.length ? notes.join('\n') : '(nothing logged recently)'
}

// --- Extra tailoring context (all from the family's own real data) ---

type Animal = { animal_type: string | null; name: string | null }
type GardenRow = { crop_name: string | null; variety: string | null; status: string | null; expected_harvest: string | null }
type StateSubject = { name: string; required: boolean }
type CurriculumUnitRow = { title: string | null; status: string | null; sequence: number | null }
type CurriculumPlanRow = { program_name: string | null; goals: string | null; subject_id: string | null; curriculum_units: CurriculumUnitRow[] | null }
type PlannerItemRow = { title: string | null }

// Everything Spark knows about a family beyond the child's own log history. Empty strings
// are omitted from the prompt, so a family that hasn't filled a section just doesn't see it.
type SparkContext = {
  season: string
  homestead: string       // shared: animals + live garden state ('' if they don't homestead)
  hasHomestead: boolean   // true only if they actually track animals/garden — gates all homestead framing
  stateSubjects: string   // shared: names of subjects the state emphasizes (a soft steer)
  notes: string           // ai_notes — per-child, or a family roster of notes
  curriculum: string      // program(s) + in-progress units
  planner: string         // titles on their weekly plan
}

// A crop counts as ready to harvest if its expected-harvest date is within this many days.
const HARVEST_SOON_DAYS = 21

// Whole days from date string `from` to `to` (both YYYY-MM-DD). Parsed as UTC midnight, so
// the difference is exact and DST-immune.
function daysUntil(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000)
}

// "November 2026" from a YYYY-MM-DD string — so we can say when a still-growing crop matures.
function monthYear(iso: string): string {
  const [y, m] = iso.split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}

// The family's real homestead — animals they keep + what's actually in the garden right now.
// Grounds ideas in their real animals and crops, and gives a live, harvest-aware read on the
// garden (a crop can be planted/growing yet MONTHS from harvest — we split ready-now from
// still-growing so ideas don't tell a kid to eat kale that won't mature until November).
function summarizeHomestead(animals: Animal[], garden: GardenRow[]): string {
  const lines: string[] = []
  if (animals.length) {
    const byType: Record<string, string[]> = {}
    for (const a of animals) {
      const t = (a.animal_type ?? 'animals').trim() || 'animals'
      ;(byType[t] ??= [])
      if (a.name?.trim()) byType[t].push(a.name.trim())
    }
    const parts = Object.entries(byType).map(([t, names]) => names.length ? `${t} (${names.join(', ')})` : t)
    lines.push(`Animals they keep: ${parts.join('; ')}`)
  }

  const today = appToday()
  const ready: string[] = []
  const growing: string[] = []
  const planned: string[] = []
  for (const g of garden) {
    const crop = [g.crop_name, g.variety ? `(${g.variety})` : ''].filter(Boolean).join(' ')
    if (!crop) continue
    if (g.status === 'planned') { planned.push(crop); continue }
    // status is 'growing' or 'planted' — decide readiness from the expected-harvest date.
    const eh = g.expected_harvest
    if (eh && eh <= today) ready.push(`${crop} (past due — pick now)`)
    else if (eh && daysUntil(today, eh) <= HARVEST_SOON_DAYS) ready.push(`${crop} (ready ~${eh})`)
    else if (eh) growing.push(`${crop} — still growing, not ready to harvest until ${monthYear(eh)}`)
    else growing.push(`${crop} — growing`)
  }
  if (ready.length) lines.push(`Ready / near harvest now: ${ready.join(', ')}`)
  if (growing.length) lines.push(`Growing but NOT yet harvestable: ${growing.join(', ')}`)
  if (planned.length) lines.push(`Planned to plant (not in the ground yet): ${planned.join(', ')}`)
  return lines.join('\n')
}

// Names of subjects the family's state marks required. A SOFT steering signal only — never a
// legal claim (see LIABILITY-RULE.md: Cultivate stores/organizes, it is not the authority).
function requiredSubjects(row: { subjects: StateSubject[] | null } | null): string {
  if (!row?.subjects || !Array.isArray(row.subjects)) return ''
  return row.subjects.filter(s => s?.required).map(s => s.name).filter(Boolean).join(', ')
}

// What they're actually teaching: each plan's program + goal + its next un-finished units.
function summarizeCurriculum(plans: CurriculumPlanRow[], subjectMap: Record<string, string>): string {
  const lines: string[] = []
  for (const p of plans.slice(0, 6)) {
    const label = p.program_name?.trim() || (p.subject_id ? subjectMap[p.subject_id] : '') || 'Course'
    const units = (p.curriculum_units ?? [])
      .filter(u => u.status !== 'done' && u.status !== 'complete')
      .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
      .map(u => u.title).filter(Boolean).slice(0, 3)
    const goal = p.goals?.trim() ? ` — goal: ${clip(p.goals, 80)}` : ''
    const unitStr = units.length ? ` [next: ${units.join('; ')}]` : ''
    lines.push(`- ${label}${goal}${unitStr}`)
  }
  return lines.join('\n')
}

function summarizePlanner(items: PlannerItemRow[]): string {
  const titles = items.map(i => i.title?.trim()).filter((t): t is string => !!t)
  return [...new Set(titles)].slice(0, 10).join(', ')
}

// Per-child ai_notes for the group prompt (only kids who have notes).
function familyNotes(children: Child[]): string {
  return children
    .filter(c => c.ai_notes?.trim())
    .map(c => `${c.name}: ${clip(c.ai_notes as string, 120)}`)
    .join('\n')
}

// Non-empty labelled block for the prompt; multi-line bodies get the label on its own line.
function block(label: string, body: string): string {
  const b = body.trim()
  if (!b) return ''
  return b.includes('\n') ? `${label}:\n${b}` : `${label}: ${b}`
}

// --- Homestead-conditional prompt pieces ---
// Not every homeschool family homesteads. When they DON'T track animals/garden, we drop the
// "on a homestead" framing, the homestead-grounding + harvest rules, and the egg/garden example
// output — otherwise the model invents chickens and crops the family doesn't have.

function homesteadSetting(hs: boolean): string {
  return hs ? 'homeschool family on a homestead' : 'homeschool family'
}

// The homestead-only rules (grounding + harvest timing) when they homestead; otherwise a single
// rule that steers to real life broadly and explicitly forbids assuming a homestead. Trailing
// newline included so it drops straight into the rules list.
function homesteadRules(hs: boolean): string {
  if (hs) {
    return `- Ground ideas in THIS family's real homestead when it fits — reference the actual animals and crops they have, not generic ones
- Only harvest or eat a crop listed as ready/near harvest — for crops still growing (not yet harvestable), ideas should tend, observe, measure, or care for them, never pick or eat them early
`
  }
  return `- Connect to real life, hands-on projects, nature, and the world around them — this family does NOT track a garden or animals, so do NOT assume they have a homestead, livestock, or crops
`
}

function seasonRule(hs: boolean): string {
  return hs
    ? `- Fit the season and the family's state/climate: only suggest what's actually doable right now (e.g. a winter garden is dormant — lean to seed-starting, planning, indoor/preserved-harvest, or cold-weather outdoor work; save planting/harvest ideas for their real season). Account for daylight and typical weather. Their live garden state above overrides the calendar if the two disagree.`
    : `- Fit the season and the family's state/climate: match ideas to what's actually available now — weather, daylight, and what's outdoors (e.g. cold-weather indoor builds in winter, outdoor exploration in summer). Don't suggest out-of-season outdoor activities.`
}

function exampleIdeas(hs: boolean, group: boolean): string {
  if (hs && group) return '["Butcher-paper map the property and mark every fruit tree, coop, and bed — little kids draw and color, older kids add a scale and measure distances", "Bake bread together: preschoolers knead, middle kids double the recipe on paper, teens calculate cost per loaf"]'
  if (hs) return '["Measure and record the weight of today\'s egg harvest and calculate the weekly average", "Read one chapter of a living history book and narrate it back to you", "Identify 3 plants in the garden by leaf shape and sketch them in a nature journal", "Write today\'s date and a one-sentence summary of what the animals did"]'
  if (group) return '["Bake a batch of cookies together: preschoolers measure and stir, middle kids double the recipe on paper, teens calculate cost per cookie", "Build the tallest freestanding tower from recycling — little kids stack, older kids test and re-engineer, then everyone measures the winner"]'
  return '["Measure the ingredients for a snack and double the recipe on paper", "Read one chapter of a living history book and narrate it back to you", "Find and sketch 3 different leaves from the yard or a nearby park in a nature journal", "Write a one-sentence summary of something learned today"]'
}

function buildChildPrompt(
  child: Child, year: SchoolYear | undefined, subjectMap: Record<string, string>, logs: LogRow[], ctx: SparkContext,
): string {
  const support = (child.learning_support ?? []).filter(Boolean)
  const hs = ctx.hasHomestead
  const extra = [
    block('Notes about this student', ctx.notes),
    block('Their homestead', ctx.homestead),
    block('What they are currently studying', ctx.curriculum),
    block('On their weekly plan', ctx.planner),
    block('Subjects their state emphasizes (a soft steer, not a rule)', ctx.stateSubjects),
  ].filter(Boolean).join('\n')
  return `You are helping a ${homesteadSetting(hs)} plan today's learning for ONE child. Give 4 concrete, doable activity ideas that fit their real life.

Child: ${child.name}
Age: ${getAge(child.birthdate) ? `${getAge(child.birthdate)} years old` : 'unknown'}
Grade: ${child.grade_level || 'ungraded'}
Learning style: ${child.learning_style || 'eclectic'}
Learning support needs: ${support.length ? support.join(', ') : 'none noted'}
State: ${year?.state || 'unknown'}
Time of year: ${ctx.season}
Subjects covered (last ${HISTORY_DAYS} days): ${summarizeSubjects(logs, subjectMap)}
Recent things they actually did:
${recentNotes(logs)}
${extra ? `\n${extra}\n` : ''}
Rules:
- Build on what they've been doing; lean toward subjects that are under-covered above
${homesteadRules(hs)}- Every idea must be something a real child can physically do — concrete and possible. NO talking to, "interviewing", or negotiating with animals or plants, and no make-believe steps
${seasonRule(hs)}
- Reinforce what they're currently studying and what's on their weekly plan when you can
- When balancing subjects, gently favor ones the state emphasizes if they're under-covered — don't force it
- Match the age — be specific and realistic, no fluff
- Mix subjects — don't give 4 of the same kind
- Each idea: one sentence, active verb
- Return ONLY a JSON array of 4 strings. No markdown, no preamble.

Example output: ${exampleIdeas(hs, false)}`
}

function buildGroupPrompt(
  children: Child[], years: SchoolYear[], subjectMap: Record<string, string>, logs: LogRow[],
  ctx: SparkContext, state: string,
): string {
  const roster = children.map(c => {
    const age = getAge(c.birthdate)
    return `- ${c.name}${age ? `, ${age} years` : ''}${c.grade_level ? `, ${c.grade_level}` : ''}`
  }).join('\n')
  const hs = ctx.hasHomestead
  const extra = [
    block('Notes about the kids', ctx.notes),
    block('Their homestead', ctx.homestead),
    block('What the family is currently studying', ctx.curriculum),
    block('On their weekly plan', ctx.planner),
    block('Subjects their state emphasizes (a soft steer, not a rule)', ctx.stateSubjects),
  ].filter(Boolean).join('\n')
  return `You are helping a ${homesteadSetting(hs)} plan a learning activity the WHOLE family can do TOGETHER today. Give 5 concrete, multi-age ideas that work for kids of different ages at the same time.

Children:
${roster}
State: ${state}
Time of year: ${ctx.season}
Subjects covered across the family (last ${HISTORY_DAYS} days): ${summarizeSubjects(logs, subjectMap)}
Recent things the family actually did:
${recentNotes(logs)}
${extra ? `\n${extra}\n` : ''}
Rules:
- Every idea must work for MULTIPLE ages at once (older kids stretch further, younger kids join in)
${homesteadRules(hs)}- Every idea must be something a real child can physically do — concrete and possible. NO talking to, "interviewing", or negotiating with animals or plants, and no make-believe steps
${seasonRule(hs)}
- Reinforce what the family is currently studying and what's on their weekly plan when you can
- When balancing subjects, gently favor ones the state emphasizes if they're under-covered — don't force it
- Lean into ${hs ? 'homestead, nature, projects, and real-life skills' : 'real life, nature, and hands-on projects'} — the together-time this family already lives
- Vary the subjects across the 5 ideas — don't give 5 of the same kind
- Each idea: one sentence, active verb, and briefly name how different ages plug in
- Return ONLY a JSON array of 5 strings. No markdown, no preamble.

Example output: ${exampleIdeas(hs, true)}`
}

function parseIdeas(text: string, max: number): string[] {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  let ideas: unknown = []
  try { ideas = JSON.parse(cleaned) } catch {
    const m = cleaned.match(/\[[\s\S]*\]/)
    if (m) { try { ideas = JSON.parse(m[0]) } catch { /* give up */ } }
  }
  return (Array.isArray(ideas) ? ideas : []).filter((x): x is string => typeof x === 'string').slice(0, max)
}

export async function POST(req: NextRequest) {
  try {
    // Auth guard: this endpoint proxies a paid LLM — require a signed-in user (denial-of-wallet).
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ ideas: [], error: 'Unauthorized' }, { status: 401 })
    }

    // Entitlement → daily limit. getAccessInfo also guards non-subscribers (defense in depth;
    // the dashboard layout already redirects them, but never trust the caller reached us cleanly).
    const access = await getAccessInfo()
    if (!access.hasAccess) {
      return NextResponse.json({ ideas: [], error: 'No active subscription' }, { status: 403 })
    }
    const limit = sparkDailyLimit(access.reason)

    // Rate limit — read the tamper-proof server-only counter BEFORE calling the LLM.
    const admin = createAdminClient()
    const today = appToday()
    const { data: usageRow } = await admin
      .from('spark_usage')
      .select('count')
      .eq('user_id', user.id)
      .eq('usage_date', today)
      .maybeSingle()
    const used = (usageRow?.count as number | undefined) ?? 0
    if (used >= limit) {
      return NextResponse.json(
        { ideas: [], error: 'limit', limit, used, remaining: 0 },
        { status: 429 },
      )
    }

    // Parse the (small, structural) request — mode + optional childId. No unbounded strings:
    // all the prompt context is fetched server-side from the DB below.
    const body = await req.json().catch(() => ({}))
    const mode: 'group' | 'individual' = body?.mode === 'group' ? 'group' : 'individual'
    const childId: string | null = typeof body?.childId === 'string' ? body.childId : null

    // Context is fetched RLS-scoped (user client) → a user can only spark their OWN children.
    const historyFrom = new Date(Date.now() - HISTORY_DAYS * 86400000).toISOString().split('T')[0]
    const [{ data: childrenData }, { data: yearsData }, { data: subjectsData }] = await Promise.all([
      supabase.from('children').select('*').order('created_at'),
      supabase.from('school_years').select('*').eq('is_active', true),
      supabase.from('subjects').select('id, name').eq('is_active', true),
    ])
    const children = (childrenData as Child[] | null) ?? []
    const years = (yearsData as SchoolYear[] | null) ?? []
    if (children.length === 0) {
      return NextResponse.json({ ideas: [], error: 'No students' }, { status: 400 })
    }
    const subjectMap: Record<string, string> = {}
    for (const s of (subjectsData ?? []) as { id: string; name: string }[]) subjectMap[s.id] = s.name

    const season = seasonContext()

    // Family state (they usually share one) → the subjects that state emphasizes.
    const stateCount: Record<string, number> = {}
    for (const y of years) if (y.state) stateCount[y.state] = (stateCount[y.state] ?? 0) + 1
    const familyState = Object.entries(stateCount).sort((a, b) => b[1] - a[1])[0]?.[0] || ''

    // Shared context — the real homestead + the state's emphasized subjects. Homestead is
    // RLS-scoped to this user; state_requirements is public reference data (read via admin).
    const [animalsRes, gardenRes, stateReqRes] = await Promise.all([
      supabase.from('livestock_animals').select('animal_type, name').eq('is_active', true),
      supabase.from('garden_entries').select('crop_name, variety, status, expected_harvest')
        .in('status', ['growing', 'planted', 'planned']),
      familyState
        ? admin.from('state_requirements').select('subjects').eq('state', familyState).maybeSingle()
        : Promise.resolve({ data: null }),
    ])
    const homestead = summarizeHomestead(
      (animalsRes.data as Animal[] | null) ?? [], (gardenRes.data as GardenRow[] | null) ?? [])
    const stateSubjects = requiredSubjects(stateReqRes.data as { subjects: StateSubject[] | null } | null)

    let prompt: string
    let maxIdeas: number
    if (mode === 'group') {
      const [logsRes, plansRes, plannerRes] = await Promise.all([
        supabase.from('daily_log').select('log_date, child_id, notes, subject_ids')
          .gte('log_date', historyFrom).order('log_date', { ascending: false }).limit(120),
        supabase.from('curriculum_plans')
          .select('program_name, goals, subject_id, curriculum_units(title, status, sequence)').limit(20),
        supabase.from('planner_items').select('title').eq('status', 'todo').limit(30),
      ])
      const ctx: SparkContext = {
        season, homestead, hasHomestead: homestead.length > 0, stateSubjects,
        notes: familyNotes(children),
        curriculum: summarizeCurriculum((plansRes.data as CurriculumPlanRow[] | null) ?? [], subjectMap),
        planner: summarizePlanner((plannerRes.data as PlannerItemRow[] | null) ?? []),
      }
      prompt = buildGroupPrompt(children, years, subjectMap, (logsRes.data as LogRow[] | null) ?? [], ctx, familyState || 'unknown')
      maxIdeas = 5
    } else {
      const child = children.find(c => c.id === childId)
      if (!child) {
        return NextResponse.json({ ideas: [], error: 'Unknown student' }, { status: 400 })
      }
      const [logsRes, plansRes, plannerRes] = await Promise.all([
        supabase.from('daily_log').select('log_date, notes, subject_ids')
          .eq('child_id', child.id).gte('log_date', historyFrom).order('log_date', { ascending: false }).limit(60),
        supabase.from('curriculum_plans')
          .select('program_name, goals, subject_id, curriculum_units(title, status, sequence)')
          .eq('child_id', child.id).limit(12),
        supabase.from('planner_items').select('title, planner_weeks!inner(child_id)')
          .eq('planner_weeks.child_id', child.id).eq('status', 'todo').limit(20),
      ])
      const year = years.find(y => y.child_id === child.id)
      const ctx: SparkContext = {
        season, homestead, hasHomestead: homestead.length > 0, stateSubjects,
        notes: child.ai_notes?.trim() ? clip(child.ai_notes, 240) : '',
        curriculum: summarizeCurriculum((plansRes.data as CurriculumPlanRow[] | null) ?? [], subjectMap),
        planner: summarizePlanner((plannerRes.data as PlannerItemRow[] | null) ?? []),
      }
      prompt = buildChildPrompt(child, year, subjectMap, (logsRes.data as LogRow[] | null) ?? [], ctx)
      maxIdeas = 4
    }

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text.trim() : '[]'
    const ideas = parseIdeas(text, maxIdeas)

    if (ideas.length === 0) {
      // Don't burn the user's daily quota on an empty/failed generation.
      return NextResponse.json({ ideas: [], error: 'Could not generate ideas. Try again.', limit, used, remaining: Math.max(0, limit - used) })
    }

    // Count this successful generation (atomic-enough at this scale; increment-on-success only).
    await admin
      .from('spark_usage')
      .upsert(
        { user_id: user.id, usage_date: today, count: used + 1, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,usage_date' },
      )

    return NextResponse.json({
      ideas,
      limit,
      used: used + 1,
      remaining: Math.max(0, limit - (used + 1)),
    })
  } catch (err) {
    // Log the real error server-side (also captured by Sentry) but never leak it to the client.
    console.error('[spark] error:', err)
    return NextResponse.json(
      { ideas: [], error: 'Something went wrong generating ideas. Please try again.' },
      { status: 500 },
    )
  }
}
