// The universal log's routing brain: split a free-text day into discrete events and route
// each one to the right module(s).
//
// This lives in lib/, not in the route handler, so it can be exercised WITHOUT an HTTP
// request or a signed-in session. The log is Cultivate's primary function and every change
// to it must be re-run against the messy-input corpus (scripts/stress-corpus.ts, see
// docs/LOG-STRESS-CORPUS.md). When this logic lived inside the route handler, adding the
// denial-of-wallet auth guard silently broke that harness — every corpus case came back 401,
// so the regression suite scored nothing while appearing to run. The route handler is now a
// thin wrapper: auth, request parsing, and status codes. Everything below is pure and testable.
import Anthropic from '@anthropic-ai/sdk'
import { DEFAULT_HOMESCHOOL_SUBJECT } from '@/lib/types'
import { resolveGardenEvent } from '@/lib/gardenEvent'

export interface RoutingResult {
  // A single parsed event — one entry in the events array
  event_description: string
  modules: {
    homeschool: boolean
    homestead: boolean
    home_diy: boolean
    projects: boolean
    chores: boolean
  }
  homeschool: {
    named_children: string[]
    subjects: string[]
    // Hours attributed to each subject for this event, keyed by subject name
    // (e.g. {"Mathematics": 1, "Reading": 0.5}). Null when the entry doesn't state a
    // per-subject split — the confirm step then lets the user allocate exactly. For
    // compliance we never silently estimate: the saved value is always user-confirmed.
    subject_hours: Record<string, number> | null
    inferred_hours: number | null
    notes_summary: string | null
  }
  homestead: {
    sub_module: 'livestock' | 'garden' | 'preservation' | 'general' | null
    animal_type: string | null
    quantity: number | null
    unit: string | null
    sale_detected: boolean
    sale_amount: number | null
    crop_or_item: string | null
    // Which point of the crop's lifecycle this event is. Only meaningful when
    // sub_module is 'garden'. This used to be INFERRED from quantity alone
    // (`harvestQty ? 'harvested' : 'planted'`), so any garden event without a
    // number — "weeded the tomato bed" — silently became a phantom PLANTING row
    // that then skewed yield, success rate, and cost-vs-yield forever. It is now
    // an explicit, user-confirmable classification. 'tending' writes NO row.
    garden_event: 'planting' | 'harvest' | 'tending' | null
    preservation_method: 'canning' | 'freezing' | 'dehydrating' | 'fermenting' | 'other' | null
    notes_summary: string | null
  }
  home_diy: {
    equipment_name: string | null
    is_maintenance: boolean
    project_description: string | null
    notes_summary: string | null
  }
  chores: {
    // The EXACT name of an existing recurring chore this event completes (from the
    // supplied list), or null. A chore completion MUST reference a chore the user has
    // already defined — chore_completions.chore_id is a NOT NULL foreign key — so the
    // router matches against the list rather than inventing one. Logging "fed the
    // chickens" must never silently create a new recurring chore.
    matched_chore: string | null
    notes_summary: string | null
  }
  projects: {
    // The EXACT title of an existing project this event is about (from the supplied
    // list), or null if it doesn't reference one.
    matched_project: string | null
    // A short task/progress line to add to that project (5-12 words).
    task_title: string | null
    // True if the described work is already done (task added as complete).
    is_complete: boolean
    notes_summary: string | null
  }
}

export interface RouteLogResponse {
  events: RoutingResult[]
}

export type ChildLite = { name: string }
export type SubjectLite = { name: string }
export type ProjectLite = { title: string }
export type ChoreLite = { name: string }

export const ROUTING_MODEL = 'claude-haiku-4-5-20251001'

export const anthropic = new Anthropic({
  // The SDK retries 429/5xx with exponential backoff and honors Retry-After headers.
  // Bumped from the default 2 so brief org-level rate-limit spikes (Haiku caps: 10k
  // output-tokens/min, 50 req/min) are absorbed transparently instead of failing the
  // user's log — the app's PRIMARY function. If it still fails, the caller returns
  // a friendly retry message, never a 500.
  maxRetries: 4,
})

// The model returns a child's first name ("Nora") while the stored name may differ
// ("Nora (NY test)", a nickname, or different case). Resolve to the canonical stored
// name so legitimate school credit isn't stripped by an exact-match check — which then
// force-dropped the entire school event. Returns null for genuinely unrecognized names.
export function resolveChildName(aiName: string, childNames: string[]): string | null {
  const a = (aiName ?? '').trim().toLowerCase()
  if (!a) return null
  return (
    childNames.find(n => n.toLowerCase() === a) ??
    childNames.find(n => n.toLowerCase().startsWith(a) || a.startsWith(n.toLowerCase())) ??
    childNames.find(n => {
      const first = n.toLowerCase().split(/[\s(]/)[0]
      return !!first && (a === first || a.includes(first))
    }) ??
    null
  )
}

// Resolve the model's free-text project reference to an EXACT existing project title:
// exact match, then contains-either-way. Returns null when nothing plausibly matches, so we
// never attach a task to the wrong project.
//
// There used to be a third rule — match if the description contains the project's FIRST WORD.
// It was far too loose, and it silently attached ordinary chores to unrelated projects:
//   "fed the chickens"            → Chicken Coop Build
//   "weeded the garden"           → Garden Fence
//   "cooked dinner in the kitchen"→ Kitchen Remodel
//   "cleaned the bathroom"        → Bathroom Tile
// Every legitimate case it was meant to catch — the model answering "Coop" or "chicken coop"
// for "Chicken Coop Build" — is already caught by contains-either-way. A wrong project task is
// a record the user has to find and delete; a missed one costs them a tap. Prefer the miss.
export function resolveProjectTitle(aiTitle: string, projectTitles: string[]): string | null {
  const a = (aiTitle ?? '').trim().toLowerCase()
  if (!a) return null
  return (
    projectTitles.find(t => t.toLowerCase() === a) ??
    projectTitles.find(t => t.toLowerCase().includes(a) || a.includes(t.toLowerCase())) ??
    null
  )
}

export function buildRoutingPrompt(opts: {
  description: string
  childNames: string[]
  subjectList: string
  projectList: string
  choreList: string
}): string {
  const { description, childNames, subjectList, projectList, choreList } = opts
  return `You are the routing intelligence for Cultivate, a family management app for homesteading homeschool families.

The user has written a log entry that may describe ONE event or MULTIPLE distinct events from their day.

Your job:
1. Split the description into discrete events (one thing that happened)
2. Route each event independently to the correct modules
3. Return an array of events — one object per event

FAMILY PROFILE:
- Children's names: ${childNames.length > 0 ? childNames.join(', ') : 'none registered'}
- State-required homeschool subjects: ${subjectList || 'not specified'}
- The subject "${DEFAULT_HOMESCHOOL_SUBJECT}" is ALWAYS available as a catch-all, in addition to the list above.
- Existing projects: ${projectList || 'none'}
- Existing recurring chores: ${choreList || 'none'}

LOG ENTRY:
"${description.trim()}"

EVENT SPLITTING RULES:
- Split on: "then", "after that", "also", "later", time references ("this morning", "this afternoon", "tonight"), or a clear TOPIC shift between school/animals/repairs/garden/preservation
- If the entry is clearly one continuous activity, return a SINGLE event object in the array
- Do NOT over-split — "we read about the Civil War and discussed it" is one event. "we did math then fed the chickens" is two events.
- SPLIT HARVEST FROM PRESERVATION: harvesting a crop and preserving it are TWO separate homestead events, even when said in one breath ("harvested tomatoes AND canned salsa"). A harvest produces a garden record; preserving produces a preservation record — they cannot share one event. More generally, ONE event carries only ONE homestead result: each distinct homestead result (a garden harvest, a livestock product, a preservation batch, a sale of a different item) is its own event.
- DO NOT SPLIT A SALE OFF ITS OWN HARVEST: selling part of what you harvested in the SAME entry belongs to that harvest event — it is not a second harvest. "Picked 12 lbs of tomatoes and sold 4 lbs for $10" is ONE garden harvest event (quantity 12, sale_detected true, sale_amount 10), NEVER a 12 lb harvest plus a 4 lb harvest. Emitting two harvest events for the same crop in one entry DOUBLE-COUNTS the yield: the family picked 12 lbs, and the records would say 16. Only a sale of a DIFFERENT item, or a sale of something not harvested in this entry, is its own event.
- SOLD-VS-KEPT IS NOT A SPLIT: dividing one harvest into the part sold and the part kept is still ONE harvest event, and its quantity is the TOTAL picked. "Sold 10 lbs of tomatoes for $20 and kept 5 lbs for us" = ONE garden harvest, quantity 15, sale_amount 20 — not a 10 lb event and a 5 lb event.
- This sale rule merges ONLY the sale. It never merges TENDING into a harvest: weeding, watering, or pruning a crop stays its OWN event even when the same sentence goes on to harvest or sell that crop.
- SPLIT MAINTENANCE BY EQUIPMENT: servicing two different pieces of equipment is TWO maintenance events ("serviced the furnace and the water heater" = a Furnace event AND a Water Heater event). ONE maintenance event names exactly ONE piece of equipment — never combine two names into one equipment_name.
- Each event gets its own brief description (5-15 words) summarizing just that event
- Up to 12 events per entry. Do NOT merge two DISTINCT activities just to shorten the list — a reading session and a PE session are SEPARATE events even for the same child, and servicing a piece of equipment vs. working on a project are separate events. (A single integrated activity that happens to touch two subjects is still ONE event — see the no-split example below.) Only if an entry genuinely exceeds 12 events, combine the smallest closely-related leftovers.

SPLITTING EXAMPLE:
Input: "Emma and I worked through long division this morning. Then I collected 14 eggs from the Barred Rocks and sold two dozen to the neighbors for $12. Changed the oil on the tractor this afternoon."
Correct output: 3 events:
  Event 1: "Long division math lesson with Emma" → homeschool only, Emma named
  Event 2: "Collected eggs, sold two dozen for $12" → homestead only, no child named
  Event 3: "Changed tractor oil" → home_diy only, no child named

HARVEST + PRESERVE EXAMPLE:
Input: "Picked 9 lbs of tomatoes from the garden and canned 6 pints of salsa with Priya."
Correct output: 2 events:
  Event 1: "Harvested 9 lbs of tomatoes" → homestead (garden), garden_event "harvest", crop_or_item "tomatoes", quantity 9, unit "lbs"
  Event 2: "Canned 6 pints of salsa with Priya" → homestead (preservation: method canning, item "salsa", quantity 6, unit "pints") AND homeschool (Priya named, subject "${DEFAULT_HOMESCHOOL_SUBJECT}")

NO-SPLIT EXAMPLE:
Input: "We spent the morning reading about the Civil War and doing a map activity"
Correct output: 1 event → homeschool, reading + social studies

ROUTING RULES (apply to each event independently):

HOMESCHOOL: Route here if a child is explicitly named OR there is clear academic content.
CRITICAL: Never assume a child was involved just because it is a homestead or DIY task.
named_children must only contain names that actually appear in THIS event's text.
SUBJECTS: For practical, hands-on, or vocational learning done WITH a named child — cooking, canning, animal care, repairs, gardening, budgeting — use the subject "${DEFAULT_HOMESCHOOL_SUBJECT}" when no more specific academic subject fits. NEVER route an event to homeschool with an empty subjects array: if a child is named but you can't identify a subject, use "${DEFAULT_HOMESCHOOL_SUBJECT}".

HOMESTEAD: Route here when there is a TRACKABLE RESULT — a planting, a harvest, livestock production (eggs, milk, meat), a food-preservation batch, or a sale of homestead products — or when the event is GARDEN work of any kind (see GARDEN LIFECYCLE below).
Routine NON-GARDEN tending that produces no result on its own — cleaning pens/coops, feeding animals, general chores — is NOT a homestead record.
- If a CHILD participated in such a chore, route it to HOMESCHOOL only (practical life skills / vocational), not homestead.
- If a non-garden tending chore has no child involved and no trackable result, it is still NOT a homestead
  record — but do NOT drop it. If it matches one of the user's existing recurring chores, emit the event and
  route it to CHORES below. Only when it matches no chore, involves no child, and has no trackable result may
  you omit it from the events array entirely.
- ANIMAL ACCURACY: set animal_type to the animal that actually PRODUCED the result. Eggs come from chickens (unless another bird — ducks, quail — is explicitly named). Never attribute a product to an animal that was only mentioned as a separate chore (e.g. "gathered eggs, fed the goats" → the eggs are chicken, NOT goat).
- QUANTITY NORMALIZATION: convert egg counts to a number — "a dozen" = 12, "2 dozen" = 24, "half a dozen" = 6 (unit "eggs"). Convert worded numbers to digits ("a gallon" → quantity 1, unit "gallon").

GARDEN LIFECYCLE — set garden_event on EVERY event where sub_module is "garden". This is REQUIRED and must never be null for a garden event. Choose exactly one:
- "planting" — the crop is being PUT IN the ground: planted, sowed, seeded, transplanted, set out, started seeds. Quantity is usually absent; that is normal and does NOT make it something else.
- "harvest" — the crop is being TAKEN OUT: harvested, picked, pulled, dug, gathered, cut. Set quantity + unit when a yield is stated.
- "tending" — care of a crop that is already in the ground and is neither going in nor coming out: weeding, watering, mulching, pruning, staking, thinning, trellising, pest-checking, fertilizing, hilling, deadheading.
CRITICAL: "tending" is the correct answer for garden work that produces no yield and plants nothing. Do NOT label tending as "planting" just because there is no quantity — a weeded bed was NOT planted, and recording it as a planting corrupts the family's garden records. When genuinely unsure between the three, choose "tending" (the safe, non-destructive option — it creates no record).
Still set crop_or_item on a tending event when a crop is named ("weeded the TOMATO bed" → crop_or_item "tomatoes", garden_event "tending").

GARDEN LIFECYCLE EXAMPLES:
  "Planted two rows of garlic" → sub_module "garden", garden_event "planting", crop_or_item "garlic", quantity null
  "Picked 9 lbs of tomatoes" → sub_module "garden", garden_event "harvest", crop_or_item "tomatoes", quantity 9, unit "lbs"
  "Weeded the tomato bed" → sub_module "garden", garden_event "tending", crop_or_item "tomatoes", quantity null
  "Watered the greenhouse and staked the beans" → sub_module "garden", garden_event "tending"

HOME & DIY: Route here ONLY for servicing or maintaining a specific tool, appliance, vehicle, or home system — an oil change, a filter swap, sharpening a blade, fixing a leak, a furnace tune-up. This is about a piece of EQUIPMENT.

PROJECTS: Route here when the event is progress on one of the user's EXISTING projects (listed above) — e.g. "worked on the chicken coop", "put up two fence panels on the garden fence", "painted the kitchen".
CRITICAL: If the event references an existing project (by name or obvious description), set modules.projects = true, set projects.matched_project to the EXACT project title from the list above, and set projects.task_title to a short line describing what was done. Set projects.is_complete = true only if the described work is clearly finished.
- A project update is NOT equipment maintenance. When an event is about a project, do NOT also set home_diy.is_maintenance or home_diy.equipment_name unless the user ALSO specifically serviced a piece of equipment. Naming a project must never create a new equipment record.
- If the work clearly relates to a project the user is doing but matches NO existing project title, leave matched_project null (we won't guess).
- CHORES AT A PROJECT'S SITE ARE NOT PROGRESS ON IT. Only work that BUILDS, ADVANCES, or FINISHES the project counts. Routine upkeep, cleaning, or using the thing the project made is NOT project progress, even when the same words appear in the title:
    "Cleaned out the chicken coop" → NOT the "Chicken Coop Build" project (that's a chore; matched_project null)
    "Added nesting boxes to the coop" → IS the "Chicken Coop Build" project (that's construction)
    "Fed the chickens" / "gathered eggs from the coop" → NOT a project
    "Weeded the garden" → NOT the "Garden Fence" project
    "Put up two fence panels" → IS the "Garden Fence" project
    "Cooked dinner in the kitchen" → NOT the "Kitchen Remodel" project
    "Cleaned the bathroom" → NOT the "Bathroom Tile" project
  When the event is a chore rather than construction, set modules.projects = false and matched_project = null.

CHORES: Route here when the event describes doing one of the user's EXISTING recurring chores (listed above) — "cleaned the coop", "fed the animals", "moved the chicken tractor". These are the routine jobs that come due again; they are deliberately NOT homestead production records and NOT project progress.
- Set modules.chores = true and chores.matched_chore to the EXACT chore name from the list.
- If the work is routine upkeep but matches NO chore on the list, set modules.chores = false and matched_chore = null. We do NOT invent recurring chores from a one-off sentence — the user defines those deliberately, and a wrong one would come due forever.
- If the list is empty, modules.chores is always false.
- A chore CAN coexist with homeschool on the same event: "Emma cleaned the coop" is both a completed chore and, if she is named, school credit.
    "Cleaned out the chicken coop" + a "Clean the coop" chore exists → matched_chore "Clean the coop"
    "Cleaned out the chicken coop" + no such chore → matched_chore null
    "Added nesting boxes to the coop" → construction, a PROJECT, not a chore

Multiple modules can be true for a single event.

inferred_hours: Estimate the TOTAL hours for THIS event. Null if impossible. Quick task = 0.25h, reading = 0.5-1h, half-day activity = 2-3h.

subject_hours: If — and only if — the entry states or clearly implies time PER SUBJECT (e.g. "an hour of math, then 30 minutes of reading"), return an object mapping each subject to its hours: {"Mathematics": 1, "Reading": 0.5}. Only use subject names that also appear in THIS event's "subjects" array. The values should sum to inferred_hours. If the time is given only as a single total across multiple subjects, OR can't be split, return null — do NOT guess a split. (When null, the app asks the user to allocate, so the saved record is exact and user-confirmed.) For a single-subject event you may set {"<that subject>": inferred_hours}.

Return ONLY valid JSON — an array of event objects, no explanation or markdown:
[
  {
    "event_description": "Brief summary of just this event",
    "modules": { "homeschool": boolean, "homestead": boolean, "home_diy": boolean, "projects": boolean, "chores": boolean },
    "homeschool": {
      "named_children": [],
      "subjects": [],
      "subject_hours": null,
      "inferred_hours": null,
      "notes_summary": null
    },
    "homestead": {
      "sub_module": null,
      "animal_type": null,
      "quantity": null,
      "unit": null,
      "sale_detected": false,
      "sale_amount": null,
      "crop_or_item": null,
      "garden_event": null,
      "preservation_method": null,
      "notes_summary": null
    },
    "home_diy": {
      "equipment_name": null,
      "is_maintenance": false,
      "project_description": null,
      "notes_summary": null
    },
    "projects": {
      "matched_project": null,
      "task_title": null,
      "is_complete": false,
      "notes_summary": null
    }
  }
]`
}

/**
 * Validate and enforce Cultivate's compliance + data-integrity rules on each event
 * independently. Pure — no I/O. The model is a suggestion engine; this is the gate.
 */
export function normalizeEvents(
  input: RoutingResult[],
  ctx: { childNames: string[]; subjectNames: string[]; projectTitles: string[] }
): RoutingResult[] {
  const { childNames, subjectNames, projectTitles } = ctx

  // The catch-all is always valid even when it's not in the family's state subject list,
  // so the AI's "Life Skills" tag for practical activities survives the filter below.
  const validSubjectNames = new Set([...subjectNames, DEFAULT_HOMESCHOOL_SUBJECT])

  return input.map(event => {
    // Validate subjects against actual subject list
    if (event.homeschool?.subjects) {
      event.homeschool.subjects = event.homeschool.subjects.filter(
        (s: string) => validSubjectNames.has(s)
      )
    }

    // Keep subject_hours consistent with the validated subjects: drop any key that
    // isn't a recognized subject in this event and coerce to non-negative numbers.
    // (The confirm step re-derives/edits this anyway, but we never pass junk downstream.)
    if (event.homeschool?.subject_hours && typeof event.homeschool.subject_hours === 'object') {
      const validSet = new Set(event.homeschool.subjects ?? [])
      const cleaned: Record<string, number> = {}
      for (const [name, h] of Object.entries(event.homeschool.subject_hours)) {
        const hn = Number(h)
        if (validSet.has(name) && Number.isFinite(hn) && hn >= 0) cleaned[name] = hn
      }
      event.homeschool.subject_hours = Object.keys(cleaned).length ? cleaned : null
    }

    // Resolve named_children to canonical stored names (fuzzy) rather than dropping
    // any name that isn't an exact match — exact-match silently killed school credit
    // whenever the model returned a first name or nickname.
    if (event.homeschool?.named_children) {
      event.homeschool.named_children = [...new Set(
        event.homeschool.named_children
          .map((n: string) => resolveChildName(n, childNames))
          .filter((n): n is string => !!n)
      )]
    }

    // Compliance enforcement per event: if no children named and no subjects matched,
    // don't route to homeschool — even if the AI thought it should
    const namedCount = event.homeschool?.named_children?.length ?? 0
    const subjectCount = event.homeschool?.subjects?.length ?? 0
    if (namedCount === 0 && subjectCount === 0) {
      event.modules.homeschool = false
    } else if (event.modules.homeschool && subjectCount === 0 && event.homeschool) {
      // A school event with a named child but no recognized subject (e.g. the AI
      // tagged a non-state label that got filtered out) would otherwise save with
      // hours but NULL subject — incomplete for per-subject compliance. Fall back to
      // the catch-all so no school record is ever subject-less; the user can re-tag.
      event.homeschool.subjects = [DEFAULT_HOMESCHOOL_SUBJECT]
    }

    // Garden lifecycle: never let a garden event reach the confirm card without an
    // explicit stage. The model omits or invents `garden_event` often enough that the
    // save path can't be allowed to fall back on quantity (that fallback is exactly what
    // turned "weeded the tomato bed" into a planting). An unresolvable event resolves to
    // 'tending', which writes nothing — the user confirms or corrects it on the card.
    // (The model returns non-canonical sub_modules — "garden_harvest" has been seen live —
    // so match the same way the confirm card's normalizer does. The card re-resolves this
    // on its own state regardless; this pass is a best-effort pre-fill.)
    if (event.homestead && event.modules?.homestead) {
      const rawSub = (event.homestead.sub_module ?? '').toString().toLowerCase()
      const isGarden = rawSub === 'garden' ||
        (!!rawSub && /garden|crop|plant|harvest|produce|veg|fruit|orchard/.test(rawSub)) ||
        (!rawSub && !!event.homestead.crop_or_item && !event.homestead.animal_type && !event.homestead.preservation_method)
      event.homestead.garden_event = isGarden
        ? resolveGardenEvent({
            garden_event: event.homestead.garden_event,
            quantity: event.homestead.quantity,
            description: event.event_description,
            sale_detected: event.homestead.sale_detected,
            sale_amount: event.homestead.sale_amount,
          })
        : null
    }

    // Projects: resolve the model's project reference to a real, existing title (fuzzy).
    // Only keep the projects module on when it actually maps to one of the user's
    // projects — otherwise we'd attach a task to nothing (or the wrong project).
    if (!event.projects) {
      event.projects = { matched_project: null, task_title: null, is_complete: false, notes_summary: null }
    }
    const resolvedProject = resolveProjectTitle(event.projects.matched_project ?? '', projectTitles)
    event.projects.matched_project = resolvedProject
    event.modules.projects = !!resolvedProject
    // A pure project update must never spawn equipment. If this event mapped to a
    // project and the model didn't name a specific serviced tool, suppress the
    // maintenance path (this is the exact mis-route Kyle hit).
    if (resolvedProject && event.home_diy && !event.home_diy.equipment_name) {
      event.home_diy.is_maintenance = false
      event.modules.home_diy = false
    }

    return event
  })
}

export type RouteLogOutcome =
  | { ok: true; events: RoutingResult[] }
  | { ok: false; status: number; error: string }

/**
 * Split + route a free-text description. Calls the model, parses defensively, then applies
 * `normalizeEvents`. Throws only on transport failures the caller should classify (rate
 * limits, outages); every content-level failure comes back as `{ ok: false }`.
 */
export async function routeLogDescription(opts: {
  description: string
  children?: ChildLite[]
  subjects?: SubjectLite[]
  projects?: ProjectLite[]
  chores?: ChoreLite[]
  client?: Anthropic
}): Promise<RouteLogOutcome> {
  const { description, children = [], subjects = [], projects = [], chores = [], client = anthropic } = opts

  const childNames = children.map(c => c.name)
  const subjectNames = subjects.map(s => s.name)
  const projectTitles = projects.map(p => p.title)
  const choreNames = chores.map(c => c.name)

  const prompt = buildRoutingPrompt({
    description,
    childNames,
    subjectList: subjectNames.join(', '),
    projectList: projectTitles.join(', '),
    choreList: choreNames.join(', '),
  })

  const message = await client.messages.create({
    model: ROUTING_MODEL,
    // Each event object is verbose (~300 tokens). A big "whole day" entry can now be
    // up to 12 events (raised from 6 so 7+ distinct activities aren't force-merged).
    // 8192 comfortably fits 12 events with headroom so the JSON never truncates
    // mid-object — and if a genuinely huge entry ever does, the parse-fail path below
    // returns the friendly "log it in two entries" 422, never a silent loss.
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text.trim() : '[]'
  let cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
  // Be tolerant of prose wrapping: slice to the outermost JSON array if present.
  const firstBracket = cleaned.indexOf('[')
  const lastBracket = cleaned.lastIndexOf(']')
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    cleaned = cleaned.slice(firstBracket, lastBracket + 1)
  }

  let events: RoutingResult[]
  try {
    events = JSON.parse(cleaned)
  } catch {
    // Don't 500 with a raw parser message. If the model was cut off (stop_reason
    // 'max_tokens') or produced invalid JSON, ask the user to shorten — without
    // pretending we saved anything.
    const truncated = message.stop_reason === 'max_tokens'
    return {
      ok: false,
      status: 422,
      error: truncated
        ? 'That was a big day! Try logging it in two shorter entries.'
        : 'Could not read that into events. Try rephrasing or splitting it up.',
    }
  }

  // Ensure it's an array (graceful handling if AI returns a single object)
  if (!Array.isArray(events)) {
    events = [events as RoutingResult]
  }

  return { ok: true, events: normalizeEvents(events, { childNames, subjectNames, projectTitles }) }
}
