import type { StateCompliance } from './stateCompliance'

/**
 * THE BRIDGE SECTION for each state page.
 *
 * Why (Kyle, 2026-08-07): every state page sold Cultivate as a homeschool compliance tool and
 * never mentioned the homestead or the workshop. His directive was that each page must "make
 * sense altogether as a single message" about the whole product.
 *
 * It is also the SEO fix. All 51 state pages ARE linked and in the sitemap (verified
 * 2026-08-07 — 51 server-rendered links on the index, 51 sitemap entries), so the indexing
 * failure is thin/duplicate content, not orphaning. Differentiation must come from real
 * per-state substance.
 *
 * ⚖️ LIABILITY: never asserts an activity SATISFIES a requirement. It describes how families
 * commonly categorise practical work, and defers to the state. See docs/LIABILITY-RULE.md.
 */

/**
 * Required subjects per state, by abbreviation.
 *
 * SOURCE: `state_requirements.subjects` in Supabase (51 rows) — a fixed 8-subject taxonomy
 * with a per-state `required` boolean. Extracted 2026-08-07. Empty array = the state
 * prescribes no subject list, which is itself a meaningful difference and is rendered as
 * such rather than as filler.
 *
 * Kept as a static map on purpose: the public state pages are deliberately DB-free and
 * statically generated (see stateCompliance.ts). Re-extract if the seed data changes.
 */
const REQUIRED_SUBJECTS: Record<string, string[]> = {
  AK: [], AL: [], AR: [], DE: [], FL: [], HI: [], ID: [], IN: [], KS: [], MD: [],
  MN: [], MS: [], MT: [], NC: [], NH: [], NJ: [], OK: [], OR: [], TN: [], UT: [], VA: [],
  SD: ['Reading', 'Language Arts', 'Mathematics'],
  CT: ['Reading', 'Language Arts', 'Mathematics', 'Social Studies'],
  KY: ['Reading', 'Language Arts', 'Mathematics', 'Social Studies'],
  TX: ['Reading', 'Language Arts', 'Mathematics', 'Social Studies'],
  AZ: ['Reading', 'Language Arts', 'Mathematics', 'Science', 'Social Studies'],
  CO: ['Reading', 'Language Arts', 'Mathematics', 'Science', 'Social Studies'],
  GA: ['Reading', 'Language Arts', 'Mathematics', 'Science', 'Social Studies'],
  IA: ['Reading', 'Language Arts', 'Mathematics', 'Science', 'Social Studies'],
  LA: ['Reading', 'Language Arts', 'Mathematics', 'Science', 'Social Studies'],
  MO: ['Reading', 'Language Arts', 'Mathematics', 'Science', 'Social Studies'],
  ND: ['Reading', 'Language Arts', 'Mathematics', 'Science', 'Social Studies'],
  NM: ['Reading', 'Language Arts', 'Mathematics', 'Science', 'Social Studies'],
  NV: ['Reading', 'Language Arts', 'Mathematics', 'Science', 'Social Studies'],
  OH: ['Reading', 'Language Arts', 'Mathematics', 'Science', 'Social Studies'],
  SC: ['Reading', 'Language Arts', 'Mathematics', 'Science', 'Social Studies'],
  WV: ['Reading', 'Language Arts', 'Mathematics', 'Science', 'Social Studies'],
  WY: ['Reading', 'Language Arts', 'Mathematics', 'Science', 'Social Studies'],
  MI: ['Reading', 'Language Arts', 'Mathematics', 'Science', 'Social Studies', 'Health'],
  NE: ['Reading', 'Language Arts', 'Mathematics', 'Science', 'Social Studies', 'Health'],
  WI: ['Reading', 'Language Arts', 'Mathematics', 'Science', 'Social Studies', 'Health'],
  RI: ['Reading', 'Language Arts', 'Mathematics', 'Social Studies', 'Health', 'Physical Education'],
  MA: ['Reading', 'Language Arts', 'Mathematics', 'Social Studies', 'Health', 'Physical Education', 'Fine Arts'],
  WA: ['Reading', 'Language Arts', 'Mathematics', 'Science', 'Social Studies', 'Health', 'Fine Arts'],
  CA: ['Reading', 'Language Arts', 'Mathematics', 'Science', 'Social Studies', 'Health', 'Physical Education', 'Fine Arts'],
  DC: ['Reading', 'Language Arts', 'Mathematics', 'Science', 'Social Studies', 'Health', 'Physical Education', 'Fine Arts'],
  IL: ['Reading', 'Language Arts', 'Mathematics', 'Science', 'Social Studies', 'Health', 'Physical Education', 'Fine Arts'],
  ME: ['Reading', 'Language Arts', 'Mathematics', 'Science', 'Social Studies', 'Health', 'Physical Education', 'Fine Arts'],
  NY: ['Reading', 'Language Arts', 'Mathematics', 'Science', 'Social Studies', 'Health', 'Physical Education', 'Fine Arts'],
  PA: ['Reading', 'Language Arts', 'Mathematics', 'Science', 'Social Studies', 'Health', 'Physical Education', 'Fine Arts'],
  VT: ['Reading', 'Language Arts', 'Mathematics', 'Science', 'Social Studies', 'Health', 'Physical Education', 'Fine Arts'],
}

/** What real homestead / DIY work looks like under each subject heading. */
const EXAMPLES: Record<string, string> = {
  Reading:
    'the equipment manual, the seed catalogue, the label on the feed sack, a repair guide that assumes you already know the vocabulary',
  'Language Arts':
    'writing up a build plan, keeping a project journal, narrating what went wrong with the pump and why',
  Mathematics:
    'feed cost per bird, board feet for a fence run, doubling a canning recipe, fall per foot on a drain line, whether the garden actually paid for itself',
  Science:
    'germination rates and soil amendments, why a hen stops laying in October, how a circuit or a water heater actually works, what the fermentation is doing in the crock',
  'Social Studies':
    'where your food and your county come from, farm economics, why the land is zoned as it is, selling at a market and dealing with a customer',
  Health:
    'food safety in a canning kitchen, what you eat when you grew it, treating the cut you got from the fence wire',
  'Physical Education':
    'hauling, stacking, digging, and hauling again — a day of real work is a day of real work',
  'Fine Arts':
    'drawing a garden plan to scale, design decisions on a build, photographing the year as it happens',
}

export type SubjectBridge = { subject: string; examples: string }

export type HomesteadAngle = {
  heading: string
  intro: string
  bridges: SubjectBridge[]
  closing: string
}

export function getHomesteadAngle(state: StateCompliance): HomesteadAngle {
  const required = REQUIRED_SUBJECTS[state.abbr] ?? []
  const bridges: SubjectBridge[] = required
    .filter((s) => EXAMPLES[s])
    .map((s) => ({ subject: s, examples: EXAMPLES[s] }))

  const testingRequired = state.testing.trim().toLowerCase().startsWith('yes')
  const hasMinimum = state.requirementType !== 'none'
  const countsHours = state.requirementType.includes('hour')
  const n = bridges.length

  const heading = n
    ? `A day around the place, against ${state.name}'s ${n} required subjects`
    : `Garden, animal, and project work in your ${state.name} records`

  const intro = n
    ? `${state.name} names ${n} required subject${n === 1 ? '' : 's'}, and an ordinary day around ` +
      `the house, the garden, and the animals touches most of them before lunch. This is how families commonly categorise the practical ` +
      `work they are already doing — whether any particular activity counts is ${state.name}'s ` +
      `call, not ours, but the record of it is the part you control.`
    : `${state.name} doesn't prescribe a subject list, which means how you categorise your ` +
      `children's practical work is almost entirely your own judgement. That is more freedom than ` +
      `most states allow — and it puts the whole weight on your records, because there is no ` +
      `official framework to fall back on if anyone ever asks what a year looked like.`

  let closing: string
  if (countsHours) {
    closing =
      `${state.name} counts hours. The hours your children spend on this work are real hours — but ` +
      `only if something wrote them down while it was happening. That is the problem Cultivate ` +
      `solves: describe the day in plain English and the garden, the goats, the tractor repair and ` +
      `the reading lesson all land in the right record at once.`
  } else if (testingRequired) {
    closing =
      `${state.name} requires an assessment, which means at some point someone outside your family ` +
      `looks at what you did. Practical work documents well — a built thing, a harvest tally, a ` +
      `repaired machine — and it reads better in a portfolio than a stack of worksheets.`
  } else if (hasMinimum) {
    closing =
      `${state.name} sets a minimum you have to meet, and days around a working place rarely look like a ` +
      `school timetable. The record is what turns an ordinary working day into something you can ` +
      `show — without bolting a second job onto the end of it.`
  } else {
    closing =
      `${state.name} sets no minimum, which sounds freeing until the year you need to prove ` +
      `something — a move to a stricter state, a return to school, a college application. Recording ` +
      `the work costs almost nothing while it is happening and is close to impossible to ` +
      `reconstruct afterwards.`
  }

  return { heading, intro, bridges, closing }
}
