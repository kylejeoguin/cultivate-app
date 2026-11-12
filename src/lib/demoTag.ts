// Pure, testable logic for the PUBLIC /try demo tagger. Kept out of the route handler (like
// routeLog.ts) so it can be exercised without an HTTP request, and so the public endpoint's
// surface stays thin.
//
// The demo mirrors what the REAL app captures from one sentence: not just school subjects, but
// the whole multi-module record — homeschool credit, homestead production, a logged sale, and
// equipment maintenance. Showing only subject pills undersold the homestead-as-a-business moat
// that is Cultivate's actual differentiator, so the demo surfaces all of it.
//
// SAFETY: every field is bounded — subjects are whitelisted to a fixed vocabulary, numbers are
// clamped, and free-text summaries are control-stripped + length-capped. A hostile visitor's
// prompt-injection can at worst produce an odd-but-short string, never arbitrary/unbounded output.

// A curated, public-safe subject spread. NOT a real family's subjects (a logged-out visitor has
// none) — just a believable slice of what Cultivate tags, weighted to the homeschool + homestead
// life. After signup the real app re-tags against the family's actual subjects.
export const DEMO_SUBJECT_VOCAB = [
  'Reading', 'Writing', 'Language Arts', 'Math', 'Science', 'Nature Study',
  'History', 'Geography', 'Social Studies', 'Art', 'Music', 'Physical Education',
  'Health', 'Home Economics', 'Handicraft', 'Life Skills',
] as const

const VOCAB_SET = new Set<string>(DEMO_SUBJECT_VOCAB)
const FALLBACK_SUBJECT = 'Life Skills'

export interface DemoTags {
  subjects: string[]          // 0–3 whitelisted school subjects
  minutes: number | null      // total, clamped
  homestead: string | null    // e.g. "Collected 12 eggs" (short, sanitized)
  sale: number | null         // dollars, if anything was sold
  maintenance: string | null  // e.g. "Tractor oil change"
}

export function buildDemoTagPrompt(description: string): string {
  return `You are the logging intelligence for Cultivate, an app for homeschooling homestead families. A visitor typed ONE description of their day. Show EVERYTHING Cultivate would capture from it — across school, homestead, and home. Do not drop the homestead production or any sale.

DESCRIPTION:
"${description.trim()}"

Extract as JSON:
- "subjects": 0 to 3 homeschool subjects that genuinely apply, ONLY from this exact list (verbatim): ${DEMO_SUBJECT_VOCAB.join(', ')}. Use [] if there was no learning/child activity. Hands-on work done with kids (cooking, animal care, gardening, selling) = "Life Skills"/"Home Economics"/"Handicraft" plus any academic subject that fits (counting money = Math).
- "minutes": total minutes the described activities took (whole number), or null.
- "homestead": a SHORT phrase (max 8 words) for any homestead RESULT — eggs/milk/meat collected, a harvest, or a preservation batch — WITH the quantity if stated. Examples: "Collected 12 eggs", "Harvested 9 lbs of tomatoes", "Canned 6 pints of salsa". null if there is no homestead result.
- "sale": the dollar amount as a NUMBER (no $ sign) if anything was SOLD, else null.
- "maintenance": a SHORT phrase (max 6 words) if a tool, vehicle, or appliance was serviced (e.g. "Tractor oil change"), else null.

Return ONLY valid JSON, no markdown, no explanation:
{"subjects":["Math","Life Skills"],"minutes":90,"homestead":"Collected 12 eggs","sale":5,"maintenance":null}`
}

// Bound a free-text summary from the model: strip control chars, collapse whitespace, cap length.
function cleanPhrase(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.replace(/[\x00-\x1f\x7f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
  return t || null
}

export function parseDemoTags(text: string): DemoTags {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  let raw: unknown = null
  try {
    raw = JSON.parse(cleaned)
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/)
    if (m) { try { raw = JSON.parse(m[0]) } catch { /* give up — fall through to defaults */ } }
  }
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}

  // Whitelist subjects to the fixed vocabulary — THE injection guard for the school tags.
  const subjects = Array.isArray(obj.subjects)
    ? [...new Set(obj.subjects.filter((s): s is string => typeof s === 'string' && VOCAB_SET.has(s)))].slice(0, 3)
    : []

  const mn = Number(obj.minutes)
  const minutes = Number.isFinite(mn) && mn > 0 ? Math.min(600, Math.max(5, Math.round(mn))) : null

  const homestead = cleanPhrase(obj.homestead, 60)
  const maintenance = cleanPhrase(obj.maintenance, 50)

  const sn = Number(obj.sale)
  const sale = Number.isFinite(sn) && sn > 0 ? Math.min(100000, Math.round(sn * 100) / 100) : null

  // Never render an empty result: if nothing at all parsed, fall back to a single school tag.
  const finalSubjects = subjects.length || homestead || maintenance ? subjects : [FALLBACK_SUBJECT]

  return { subjects: finalSubjects, minutes, homestead, sale, maintenance }
}
