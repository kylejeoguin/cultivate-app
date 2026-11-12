// Derives genuinely state-specific page content from the ALREADY-VERIFIED compliance data in
// stateCompliance.ts. Created 2026-08-02 to fix measured near-duplicate content across the 51
// /state-requirements/[state] pages (token Jaccard was 0.80-0.92 between states; ~38% of
// Missouri's sentences were byte-identical to Texas's).
//
// ┌─ THE RULE THIS FILE LIVES BY ────────────────────────────────────────────────────────────┐
// │ It invents NO law. Every number here is READ OUT of a summary a human already verified    │
// │ against HSLDA (June 2026). The only thing added is ARITHMETIC on those numbers, plus      │
// │ operational guidance about RECORD-KEEPING — which is Cultivate's actual domain and is not │
// │ a legal claim. Extraction FAILS CLOSED: if a pattern doesn't match with high confidence,  │
// │ we return nothing and the page simply omits that block. A missing section is fine; a      │
// │ wrong legal number is not. See docs/LIABILITY-RULE.md.                                    │
// └──────────────────────────────────────────────────────────────────────────────────────────┘

import type { StateCompliance } from './stateCompliance'

/** Numbers extracted from a verified summary. Every field is optional — absent means "not
 *  confidently found", never "zero". */
export type RuleProfile = {
  totalHours?: number
  days?: number
  hoursPerDay?: number
  /** Hours that must be in core subjects (currently only Missouri states this numerically). */
  coreHours?: number
  /** Of the core hours, how many must happen at the home location. */
  coreAtHomeHours?: number
  /** Grade-banded hour rules, e.g. NY 900 (1-6) / 990 (7-12). */
  bands?: { label: string; hours: number }[]
  /** True when days and hours are alternatives rather than both required. */
  eitherOr: boolean
}

const num = (s: string): number => parseInt(s.replace(/,/g, ''), 10)

/**
 * Pull the numeric shape of a state's rule out of its verified summary.
 * Strict by design: patterns are anchored to the phrasing the seed data actually uses.
 */
export function getRuleProfile(state: StateCompliance): RuleProfile {
  const p: RuleProfile = { eitherOr: state.requirementType === 'days_or_hours' }

  // ── GUARD 1: no binding minimum ⇒ extract NOTHING. ───────────────────────────────────────
  // Verified 2026-08-02 against all 51 states. Several summaries mention a number while
  // explicitly saying it does NOT bind: Massachusetts names "180 days / 900 / 990" and then
  // states those are not legally binding minimums; Alabama and West Virginia describe an
  // alternate route nobody uses. Publishing arithmetic on those figures would imply a
  // requirement the state does not impose — the exact liability we must not create.
  if (state.requirementType === 'none' || state.requirementType === 'advisory') return p

  // ── GUARD 2: strip parentheticals before matching. ───────────────────────────────────────
  // The seed data consistently uses parentheses for caveats and alternate routes (e.g. Iowa's
  // IPI option, South Carolina's district option). Numbers inside them describe a path the
  // reader is probably not on, so they must never drive the headline arithmetic.
  const raw = `${state.headline} ${state.summary}`
  const t = raw.replace(/\([^)]*\)/g, ' ')

  // Grade-banded hours: "900 hours per year for grades 1-6 and 990 hours per year for grades 7-12"
  const bandRe = /([\d,]+)\s*hours per year for grades? ([\dK–—-]+)/gi
  const bands: { label: string; hours: number }[] = []
  for (const m of t.matchAll(bandRe)) bands.push({ label: `grades ${m[2]}`, hours: num(m[1]) })
  // "1,032 hours per year (elementary) and 1,080 hours per year (high school)" — read from the
  // UNSTRIPPED text, because here the parenthesis is the grade label itself, not a caveat. The
  // pattern requires it to sit immediately after "hours per year", which a caveat never does.
  // Also catches Pennsylvania's "900 hours (elementary) / 990 hours (grades 7-12)", which omits
  // "per year". PA is a named high-regulation target state, and showing only the elementary
  // figure would understate the requirement for a family with a 7th-12th grader.
  // Both spellings are needed: Nebraska writes "1,032 hours per year (elementary)" while
  // Pennsylvania writes "900 hours (elementary)". Matching only one silently drops the other.
  if (!bands.length) {
    for (const re of [
      /([\d,]{3,6})\s*hours per year \(([^)]{1,24})\)/gi,
      /([\d,]{3,6})\s*hours \(([^)]{1,24})\)/gi,
    ]) {
      for (const m of raw.matchAll(re)) {
        if (!bands.some((b) => b.hours === num(m[1]))) bands.push({ label: m[2], hours: num(m[1]) })
      }
      if (bands.length > 1) break
    }
  }
  if (bands.length > 1) p.bands = bands

  // Single total-hours figure. Excluded when grade bands already describe the rule.
  if (!p.bands) {
    const hrs =
      t.match(/([\d,]{3,6})\s*(?:instructional\s+)?hours per year/i) ||
      // Wisconsin's phrasing: "875 hours of instruction per year"
      t.match(/([\d,]{3,6})\s*hours of instruction(?: per year)?/i) ||
      t.match(/([\d,]{3,6})\s*instructional hours/i) ||
      t.match(/OR\s*([\d,]{3,6})\s*hours/i)
    if (hrs) p.totalHours = num(hrs[1])
  }

  // Day count. "180 days", "at least 175 days", "the equivalent of at least 175 days".
  const days = t.match(/(?:at least\s+)?(\d{2,3})\s*days/i)
  if (days) {
    const d = num(days[1])
    if (d >= 100 && d <= 200) p.days = d // sanity band: a school year, not a stray number
  }

  // Per-day minimum: "at least 4 instructional hours per day", "180 days of at least 4.5 hours each"
  const hpd = t.match(/([\d.]+)\s*(?:instructional\s+)?hours (?:per day|each|a day)/i)
  if (hpd) {
    const h = parseFloat(hpd[1])
    if (h > 0 && h <= 12) p.hoursPerDay = h
  }

  // Missouri's core-subject split — the only state whose summary states these numerically.
  const core = t.match(/([\d,]{3,4})\s*must be in the (?:five )?core subjects/i)
  if (core) p.coreHours = num(core[1])
  const atHome = t.match(/([\d,]{3,4})\s*of those core hours must occur at the regular home/i)
  if (atHome) p.coreAtHomeHours = num(atHome[1])

  return p
}

const round1 = (n: number): string => (Math.round(n * 10) / 10).toString()

/** Filing/paperwork facts, read out of the verified summary. All optional; absent = not found. */
export type Paperwork = {
  /** e.g. "Notice of Intent", "notarized affidavit", "Certificate of Enrollment", "Form 4140" */
  filing?: string
  /** e.g. "Aug 15" */
  deadline?: string
  oneTime: boolean
  annual: boolean
  /** The verbatim required-subjects sentence, when the summary states one. */
  subjects?: string
}

/**
 * Extracts the paperwork side of a state's rule. This is what actually separates two states that
 * both have "no minimum hours" — Texas asks for nothing at all, Arizona wants a notarized
 * affidavit, Florida wants a notice plus an annual evaluation. Added 2026-08-02 because rule-type
 * bucketing alone still left same-bucket pages near-identical (TX/AK measured 0.93 after the
 * first pass). Verbatim-or-nothing: we quote the seed data's own wording, never paraphrase a
 * legal requirement into something it didn't say.
 */
export function getPaperwork(state: StateCompliance): Paperwork {
  const s = state.summary
  const p: Paperwork = {
    oneTime: /\bone-time\b/i.test(s),
    annual: /\bannual(?:ly)?\b/i.test(s),
  }

  const filing = s.match(
    /\b(notarized affidavit|Notice of Intent|notice of intent|Certificate of Enrollment|Declaration of Intent|declaration of intent|Statement of Election[^.,;]*|letter of intent|Form \d+[A-Za-z]*|affidavit|Individualized Home Instruction Plan)/
  )
  // Trim a trailing "... by <date>" so the deadline isn't duplicated inside the filing's name
  // (Nebraska's summary reads "Statement of Election and Assurances by July 15").
  if (filing) p.filing = filing[1].replace(/\s+by\s+\w+\.?\s*\d{1,2}\s*$/i, '').trim()
  else if (/\bno notice\b/i.test(s)) p.filing = undefined

  const deadline = s.match(/\bby (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)[a-z]*\.?\s*(\d{1,2})\b/)
  if (deadline) p.deadline = `${deadline[1]} ${deadline[2]}`

  const subjects = s.match(/((?:Required subjects?[^.]*|Teach (?:subjects|reading)[^.]*|(?:Ten|Eleven|Six|Nine|Twelve) subject areas[^.]*)\.)/)
  if (subjects) p.subjects = subjects[1].trim()

  return p
}

/** True when the state genuinely asks for no filing at all — the Texas/Alaska shape. */
function filesNothing(state: StateCompliance): boolean {
  return /\bno notice\b/i.test(state.summary) && !getPaperwork(state).filing
}

/**
 * Plain-English arithmetic on the verified figures. Everything returned here is a CALCULATION,
 * never a requirement — the page labels it as such. Returns [] when there's nothing to compute.
 */
export function getDerivedMath(state: StateCompliance): string[] {
  const p = getRuleProfile(state)
  const out: string[] = []
  const SCHOOL_WEEKS = 36 // the conventional academic year
  const YEAR_ROUND = 52 // the baseline: school doesn't stop for summer

  if (p.totalHours && p.days) {
    out.push(
      `${p.totalHours.toLocaleString()} hours spread across ${p.days} days averages about ` +
        `${round1(p.totalHours / p.days)} hours a day.`
    )
  } else if (p.totalHours) {
    out.push(
      `On a conventional 36-week school year, ${p.totalHours.toLocaleString()} hours is about ` +
        `${round1(p.totalHours / SCHOOL_WEEKS)} hours a week — roughly ` +
        `${round1(p.totalHours / SCHOOL_WEEKS / 5)} hours a day on a five-day week.`
    )
    // The year-round baseline. For families who don't stop for summer — which is most homestead
    // and unschooling families — this is the number that actually describes their life, and it is
    // dramatically lighter than the school-calendar figure. Kyle's ask, 2026-08-02.
    out.push(
      `Spread across all 52 weeks instead, five days a week, the same ` +
        `${p.totalHours.toLocaleString()} hours is about ${round1(p.totalHours / YEAR_ROUND)} hours a week — ` +
        `roughly ${round1(p.totalHours / YEAR_ROUND / 5)} hours a day. Year-round schooling doesn't add ` +
        `hours; it just spreads the same total thinner.`
    )
  }

  if (p.days && p.hoursPerDay) {
    out.push(
      `${p.days} days at ${p.hoursPerDay} hours each works out to ` +
        `${Math.round(p.days * p.hoursPerDay).toLocaleString()} hours over the year — though ` +
        `${state.name} sets the daily minimum, not that annual total.`
    )
  } else if (p.days && !p.totalHours) {
    out.push(
      `${p.days} days is about ${round1(p.days / 5)} school weeks — roughly ` +
        `${round1(p.days / SCHOOL_WEEKS)} days a week across a 36-week year, or about ` +
        `${round1(p.days / YEAR_ROUND)} days a week if you school year-round instead of stopping for summer.`
    )
  }

  if (p.bands?.length) {
    out.push(
      p.bands
        .map((b) => `${b.hours.toLocaleString()} hours for ${b.label} is about ${round1(b.hours / SCHOOL_WEEKS)} hours a week`)
        .join('; ') + ' on a 36-week year.'
    )
    out.push(
      `Across all 52 weeks instead, that same total comes down to ` +
        p.bands.map((b) => `${round1(b.hours / YEAR_ROUND)} hours a week for ${b.label}`).join(', and ') +
        `.`
    )
  }

  if (p.coreHours && p.totalHours) {
    const elective = p.totalHours - p.coreHours
    out.push(
      `Of the ${p.totalHours.toLocaleString()} hours, ${p.coreHours.toLocaleString()} must be core — ` +
        `which leaves ${elective.toLocaleString()} hours that can be anything else you count as school.`
    )
    if (p.coreAtHomeHours) {
      out.push(
        `${p.coreAtHomeHours.toLocaleString()} of those ${p.coreHours.toLocaleString()} core hours have to happen at home, ` +
          `so up to ${(p.coreHours - p.coreAtHomeHours).toLocaleString()} core hours can happen at co-op, ` +
          `on a field trip, or anywhere else.`
      )
    }
  }

  if (p.eitherOr && p.days) {
    if (p.totalHours) {
      out.push(
        `Because either measure satisfies ${state.name}, it's worth tracking both and reporting whichever ` +
          `you reach first — ${p.totalHours.toLocaleString()} hours works out to ` +
          `${round1(p.totalHours / p.days)} hours a day if you also hit ${p.days} days.`
      )
    } else if (p.bands?.length) {
      out.push(
        `Either measure satisfies ${state.name}, so it's worth tracking both and reporting whichever you ` +
          `reach first. Against ${p.days} days, the hours option comes out to ` +
          p.bands.map((b) => `${round1(b.hours / p.days!)} hours a day for ${b.label}`).join(', and ') +
          `.`
      )
    }
  }

  return out
}

/**
 * What the rule means for RECORD-KEEPING — operational guidance, not a legal statement.
 * Keyed by requirement type so the page's shape genuinely differs state to state, and woven
 * with the state's own numbers so two states in the same bucket still don't read alike.
 */
export function getRecordImplications(state: StateCompliance): { heading: string; body: string } {
  const p = getRuleProfile(state)
  const n = state.name
  const hrs = p.totalHours?.toLocaleString()
  const days = p.days

  switch (state.requirementType) {
    case 'hours':
      return {
        heading: `In ${n}, the unit that matters is the hour`,
        body:
          `Because ${n} counts ${hrs ? `${hrs} hours` : 'instructional hours'} rather than days, a log that only ` +
          `records "we did school today" won't answer the question you'd actually be asked. You need time, and ` +
          `for most families the hardest part isn't the teaching — it's remembering to write down 40 minutes of ` +
          `read-aloud three days later.${p.coreHours ? ` ${n} also splits core from everything else, so the log has to know which subject an hour belongs to, not just that an hour happened.` : ''} ` +
          `A running per-subject tally is far easier to keep than a year-end reconstruction.`,
      }
    case 'days':
      return {
        heading: `In ${n}, the unit that matters is the day`,
        body:
          `${n} counts ${days ? `${days} days` : 'days of instruction'}, not hours, which makes the record simpler ` +
          `than an hours state — but it also makes gaps obvious. What you need is an attendance calendar you can ` +
          `show: which days were school days, across the whole year. Families who track this in their heads tend to ` +
          `discover in spring that they're not sure whether they're at ${days ? days - 20 : 150} or ${days ?? 180}, ` +
          `and there's no way to reconstruct it honestly after the fact.`,
      }
    case 'days_and_hours':
      return {
        heading: `${n} counts both days and hours — and they have to agree`,
        body:
          `This is the most demanding shape of rule to document, because two separate tallies have to hold up at ` +
          `once${hrs && days ? ` — ${hrs} hours AND ${days} days` : ''}. Hitting one and missing the other doesn't ` +
          `satisfy it. Practically, that means every school day needs both a date and a duration, and the two have ` +
          `to reconcile at year end. A calendar alone won't do it; neither will a stopwatch.`,
      }
    case 'days_or_hours':
      return {
        heading: `${n} lets you choose — so track both and use whichever helps`,
        body:
          `Either measure satisfies ${n}${hrs && days ? ` (${days} days or ${hrs} hours)` : ''}, which is more ` +
          `forgiving than it first looks. A family doing long, intensive days may reach the hours total well before ` +
          `the day count; a family doing short daily lessons will hit days first. You only find out which describes ` +
          `you by recording both — and the cost of tracking the second one, if you're already tracking the first, is ` +
          `close to nothing.`,
      }
    case 'days_plus_hours_per_day':
      return {
        heading: `In ${n}, a day only counts if it's long enough`,
        body:
          `This is the rule most families misread. ${n} asks for ${days ?? 'a set number of'} days ` +
          `${p.hoursPerDay ? `of at least ${p.hoursPerDay} hours each` : 'of a minimum length'} — so a short ` +
          `day may not count toward the total at all. There is no stated annual hours figure to fall back on. ` +
          `The record you need therefore has to show duration per day, not just presence, because the qualifying ` +
          `question is asked of each individual day rather than of the year as a whole.`,
      }
    case 'advisory':
      return {
        heading: `${n} has no binding minimum — but you'll still be asked`,
        body:
          `The figures that circulate for ${n} come from public-school guidance rather than a statute that binds ` +
          `homeschoolers, and an approved education plan may reference them. That puts you in an awkward spot: ` +
          `nothing to strictly comply with, but a real conversation to have with a district. The families who find ` +
          `that conversation easy are the ones holding a specific, dated record of what was taught — not because a ` +
          `law demanded it, but because it ends the discussion.`,
      }
    default: {
      // The largest bucket — 30 of 51 states set no instructional minimum. Rule type alone can't
      // separate them, so this branch leans on what actually differs: the paperwork each state
      // asks for, its deadline, and whether it names required subjects.
      const pw = getPaperwork(state)
      const nothing = filesNothing(state)

      const opening = nothing
        ? `${n} is about as hands-off as it gets: no filing, no state minimum, no test. That freedom is real, ` +
          `and it quietly moves the entire burden of proof onto you — because there is no form on file anywhere ` +
          `showing that your child was educated at all.`
        : pw.filing
          ? `${n} sets no hour or day minimum, so the instruction-time question is settled. What's left is the ` +
            `paperwork: ${pw.oneTime ? 'a one-time' : pw.annual ? 'an annually renewed' : 'a'} ${pw.filing}` +
            `${pw.deadline ? `, due ${pw.deadline}` : ''}. Miss that and the issue isn't your teaching — it's ` +
            `that you're not formally on the books.`
          : `${n} sets no hour or day minimum, which settles the instruction-time question and leaves the rest ` +
            `to you.`

      const middle = testingOrAssessmentPhrase(state)

      const closing =
        `Either way, records in ${n} stop being about compliance and start being about what comes after — a ` +
        `transcript for college admission, a portfolio if you move to a stricter state, or simply knowing what ` +
        `your kid actually covered. Families who keep nothing rarely regret it until one of those arrives.` +
        (pw.subjects ? ` ${n} does name what to cover: ${pw.subjects.replace(/\.$/, '')} — worth logging by subject so you can show it.` : '')

      return { heading: `${n} doesn't set a minimum — which changes why you'd keep records`, body: `${opening} ${middle} ${closing}` }
    }
  }
}

/** One sentence about this state's assessment posture, phrased from the verified `testing` field. */
function testingOrAssessmentPhrase(state: StateCompliance): string {
  const required = state.testing.trim().toLowerCase().startsWith('yes')
  return required
    ? `${state.name} does require a standardized test or evaluation, so that result is the one document you ` +
        `genuinely have to produce and keep.`
    : `No test is required either, so nothing is generated on your behalf that you could point to later.`
}

/** State-specific FAQ built from verified fields. Answers vary by rule shape, not just by name. */
export function getFaqEntries(state: StateCompliance): { q: string; a: string }[] {
  const p = getRuleProfile(state)
  const n = state.name
  const none = state.requirementType === 'none'
  const testingRequired = state.testing.trim().toLowerCase().startsWith('yes')

  const timeAnswer = none
    ? `${n} does not set a minimum number of instructional hours or days for homeschoolers. ${state.summary}`
    : `${state.headline === 'See your state rule below' ? state.summary : `${state.headline}. ${state.summary}`}`

  const entries: { q: string; a: string }[] = [
    { q: `What does ${n} require to homeschool?`, a: state.summary },
    {
      q: none
        ? `How many hours a year do you have to homeschool in ${n}?`
        : `How many ${p.totalHours && !p.days ? 'hours' : 'days'} do you have to homeschool in ${n}?`,
      a: timeAnswer,
    },
    {
      q: `Does ${n} require standardized testing for homeschoolers?`,
      a: `${state.testing}. ${
        testingRequired
          ? `Confirm the accepted tests, the grades they apply to, and the timing with ${n} or HSLDA, and keep the results with your records.`
          : `Some ${n} families still choose to test to track progress or to have it on file. Confirm the current rule with ${n} or HSLDA.`
      }`,
    },
    {
      q: `What records should I keep to homeschool in ${n}?`,
      a: getRecordImplications(state).body,
    },
    {
      q: `What is the legal citation for homeschooling in ${n}?`,
      a: `${n}'s homeschool law: ${state.citation}. Always confirm the current rules with ${n} or a homeschool legal resource such as HSLDA.`,
    },
  ]

  const math = getDerivedMath(state)
  if (math.length) {
    entries.splice(2, 0, {
      q: `What does ${n}'s requirement work out to per week?`,
      a: `${math.join(' ')} These are our calculations from the figures above, offered to make planning easier — ${n} sets the requirement, not the arithmetic.`,
    })
  }

  return entries
}
