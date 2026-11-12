import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { STATE_COMPLIANCE, LAST_VERIFIED } from '@/lib/stateCompliance'
import { getDerivedMath, getFaqEntries, getRecordImplications } from '@/lib/stateDerived'
import { allStateSlugs, stateBySlug, stateSlug } from '@/lib/stateSlug'
import { getHomesteadAngle } from '@/lib/stateHomestead'
import LeadForm from './LeadForm'

const BASE = (process.env.NEXT_PUBLIC_APP_URL || 'https://mycultivate.app').replace(/\/$/, '')
const SOURCE = 'seo' // organic search → its own attribution channel

// Only the 51 known states; any other slug 404s.
export const dynamicParams = false

export function generateStaticParams() {
  return allStateSlugs().map((state) => ({ state }))
}

function clamp(s: string, n: number): string {
  if (s.length <= n) return s
  const cut = s.slice(0, n)
  return cut.slice(0, cut.lastIndexOf(' ')).trimEnd() + '…'
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ state: string }>
}): Promise<Metadata> {
  const { state: slug } = await params
  const s = stateBySlug(slug)
  if (!s) return {}
  const url = `${BASE}/state-requirements/${slug}`
  const title = `${s.name} Homeschool Requirements (2026) | Cultivate`
  const description = clamp(s.summary, 155)
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: 'Cultivate',
      type: 'article',
      // Next.js does NOT inherit the root layout's og:image when a page defines
      // its own openGraph block — without this, shared state pages get a plain
      // text card. Point at the branded card so social shares stay on-brand.
      images: [
        {
          url: '/og-image.png',
          width: 1200,
          height: 630,
          alt: `${s.name} homeschool requirements — Cultivate`,
        },
      ],
    },
    twitter: { card: 'summary_large_image', title, description, images: ['/og-image.png'] },
  }
}

function LeafLogo() {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-9 h-9">
      <path d="M16 4C16 4 6 10 6 20C6 25.523 10.477 30 16 30C21.523 30 26 25.523 26 20C26 10 16 4 16 4Z" fill="url(#leafGradST)" />
      <path d="M16 4C16 4 6 10 6 20" stroke="#4ade80" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
      <path d="M16 30L16 12" stroke="#052e16" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <defs>
        <linearGradient id="leafGradST" x1="16" y1="4" x2="16" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4ade80" />
          <stop offset="100%" stopColor="#15803d" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export default async function StateRequirementsPage({
  params,
}: {
  params: Promise<{ state: string }>
}) {
  const { state: slug } = await params
  const state = stateBySlug(slug)
  if (!state) notFound()

  const trialHref = `/signup?source=${SOURCE}&state=${state.abbr}`
  const testingRequired = state.testing.trim().toLowerCase().startsWith('yes')

  // State-specific derivations (see lib/stateDerived.ts — arithmetic on verified figures and
  // record-keeping guidance, never a legal claim; returns nothing when unsure).
  const derivedMath = getDerivedMath(state)
  const implication = getRecordImplications(state)
  const faqEntries = getFaqEntries(state)
  const noMinimum = state.requirementType === 'none'
  // The bridge section — maps real homestead/DIY work onto THIS state's named subjects.
  // The only part of the page that describes the whole product rather than the school half.
  const homestead = getHomesteadAngle(state)
  // Rule-shape flags — drive the closing pitch so it isn't one identical block × 51.
  const countsHours = state.requirementType.includes('hour')
  const countsDays = !countsHours && state.requirementType.includes('day')

  // "How to start" — trimmed from five near-identical steps to three, with the generic filler
  // removed. The wording branches on this state's actual rule shape so the section differs
  // state to state instead of repeating one framework 51 times. NOT legal instruction.
  const startSteps = [
    {
      name: `Check what ${state.name} asks for before you begin`,
      text: `${state.summary} Confirm the exact form, deadline, and current wording with ${state.name} or HSLDA before you rely on any of it.`,
    },
    {
      name: noMinimum
        ? `Teach on whatever schedule suits your family`
        : `Teach on a schedule that satisfies ${state.headline === 'See your state rule below' ? `${state.name}'s rule` : state.headline.toLowerCase()}`,
      text: noMinimum
        ? `${state.name} sets no instructional-time minimum, so the calendar is yours — year-round, four days a week, evenings, whatever fits. Choose your curriculum and go.`
        : `${implication.body}`,
    },
    {
      name: testingRequired
        ? `Complete ${state.name}'s required testing or assessment`
        : `Decide whether to assess — ${state.name} doesn't require it`,
      text: testingRequired
        ? `${state.testing} Confirm the accepted tests, the grades they apply to, and the timing with ${state.name}, and keep the results with your records.`
        : `${state.name} requires no standardized test. Some families test anyway to check progress or to have something on file if they later move to a stricter state.`,
    },
  ]

  const howTo = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: `How to start homeschooling in ${state.name}`,
    step: startSteps.map((s) => ({ '@type': 'HowToStep', name: s.name, text: s.text })),
  }

  // FAQ rich-results structured data — generated from the same verified data as the visible FAQ
  // below, so the two can never drift apart. Questions and answers now vary by this state's rule
  // shape rather than being one generic set with the name swapped in.
  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqEntries.map((e) => ({
      '@type': 'Question',
      name: e.q,
      acceptedAnswer: { '@type': 'Answer', text: e.a },
    })),
  }

  // A few sibling states for internal linking (next states alphabetically, wrapping).
  const idx = STATE_COMPLIANCE.findIndex((s) => s.abbr === state.abbr)
  const others = [1, 2, 3, 4].map((o) => STATE_COMPLIANCE[(idx + o) % STATE_COMPLIANCE.length])

  return (
    <div className="min-h-screen bg-surface text-content">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faq) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(howTo) }} />

      {/* Nav */}
      <nav className="border-b border-line px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <LeafLogo />
            <span className="text-lg font-bold tracking-tight text-content">Cultivate</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm text-muted hover:text-content transition-colors">
              Sign in
            </Link>
            <Link
              href={trialHref}
              className="text-sm bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded-lg transition-colors font-medium"
            >
              Start free trial
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-3xl mx-auto px-6 pt-16 pb-8">
        <nav className="text-xs text-subtle mb-6" aria-label="Breadcrumb">
          <Link href="/state-requirements" className="hover:text-content">Homeschool requirements by state</Link>
          <span className="mx-2 text-subtle">/</span>
          <span className="text-muted">{state.name}</span>
        </nav>
        <div className="inline-flex items-center gap-2 bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-900/50 rounded-full px-4 py-1.5 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0"></span>
          <span className="text-green-700 dark:text-green-400 text-xs font-medium">Free · Updated {LAST_VERIFIED}</span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight mb-4">
          {state.name} homeschool requirements
        </h1>
        {/* Leads with the one job the searcher came for, then opens the door to the whole
            product in the second sentence — per the 08-07 messaging research, breadth in the
            opening line reads as "complicated", but the page still has to make sense as one
            message about what Cultivate actually is. */}
        <p className="text-muted text-lg leading-relaxed">
          What {state.name} requires to homeschool — instruction time, testing, and the exact legal
          citation, in plain English. Then the part most guides skip: how the garden, the animals and
          the work you do around the place fit into the same record.
        </p>
      </section>

      {/* The detail */}
      <section className="max-w-2xl mx-auto px-6 pb-16">
        <div className="bg-card border border-line rounded-2xl p-6 sm:p-8">
          <p className="text-subtle text-xs mb-6">
            Last verified {LAST_VERIFIED} · A starting point, not legal advice — {state.name} sets the rules and they change.
          </p>

          {/* At a glance */}
          <div className="rounded-xl border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/20 divide-y divide-stone-800/70 mb-7">
            <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 px-4 py-3">
              <span className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide sm:w-40 shrink-0">Instruction required</span>
              <span className="text-sm text-muted">{state.headline}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 px-4 py-3">
              <span className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide sm:w-40 shrink-0">Standardized testing</span>
              <span className="text-sm text-muted">{state.testing}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 px-4 py-3">
              <span className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide sm:w-40 shrink-0">Legal citation</span>
              <span className="text-sm text-muted">{state.citation}</span>
            </div>
          </div>

          {/* The rule */}
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-2">The rule, in plain English</h2>
          <p className="text-muted leading-relaxed mb-5">{state.summary}</p>

          {/* Derived arithmetic — computed from the verified figures above. Labelled as OUR
              calculation, never as a requirement. Omitted entirely when nothing is confidently
              extractable, and never shown for states with no binding minimum. */}
          {derivedMath.length > 0 && (
            <div className="rounded-xl border border-line bg-elevated px-4 py-4 mb-5">
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2.5">
                What that works out to
              </h3>
              <ul className="space-y-2 mb-3">
                {derivedMath.map((m, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-muted leading-relaxed">
                    <span className="text-green-700 dark:text-green-400 mt-0.5 shrink-0">→</span>
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
              <p className="text-subtle text-xs leading-relaxed">
                Our arithmetic on the figures above, to make planning easier — shown against a
                conventional 36-week school year and against a full 52-week year for families who
                school year-round. {state.name} sets the requirement; these numbers are not part of it.
              </p>
            </div>
          )}

          {/* Confirm-with-your-state — visible, points to the authority */}
          <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/15 px-4 py-3.5 mb-7 flex items-start gap-3">
            <span className="text-amber-700 dark:text-amber-400 text-lg leading-none mt-0.5 shrink-0">⚖️</span>
            <p className="text-sm text-muted leading-relaxed">
              Laws change — always confirm the current rules for {state.name} yourself before relying on them.
              {' '}
              <a
                href={state.hslda}
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-700 dark:text-amber-400 underline underline-offset-2 hover:text-amber-200 font-medium"
              >
                See {state.name}&apos;s official requirements on HSLDA →
              </a>
            </p>
          </div>

          {/* Email gate → PDF */}
          <LeadForm
            stateAbbr={state.abbr}
            stateName={state.name}
            checklistPdf={state.checklistPdf}
            source={SOURCE}
          />
        </div>

        <p className="text-subtle text-xs text-center mt-4 max-w-xl mx-auto">
          This is a plain-English summary for your convenience, not legal advice. Cultivate helps you
          store, organize, and produce your homeschool records — it isn&apos;t the authority on what your
          state requires. Homeschool laws change; always confirm current rules with your state or a
          homeschool legal resource (e.g., HSLDA) before relying on them.
        </p>
      </section>

      {/* How to start — general orientation (HowTo schema above). Not legal instruction. */}
      <section className="border-t border-line">
        <div className="max-w-2xl mx-auto px-6 py-14">
          <h2 className="text-2xl font-bold tracking-tight mb-2">How to start homeschooling in {state.name}</h2>
          <p className="text-subtle text-sm mb-7">
            The general path most families follow. {state.name}&apos;s specific requirements are in the
            summary above — confirm the exact steps and deadlines with your state before relying on them.
          </p>
          <ol className="space-y-5">
            {startSteps.map((s, i) => (
              <li key={i} className="flex gap-4">
                <span className="shrink-0 w-7 h-7 rounded-full bg-green-900/40 border border-green-200 dark:border-green-800/60 text-green-700 dark:text-green-300 text-sm font-semibold flex items-center justify-center">{i + 1}</span>
                <div>
                  <p className="font-semibold text-content mb-1">{s.name}</p>
                  <p className="text-muted text-sm leading-relaxed">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* What records to keep — best practice + the product wedge */}
      <section className="border-t border-line">
        <div className="max-w-2xl mx-auto px-6 py-14">
          {/* Record-keeping guidance derived from THIS state's rule shape (hours vs days vs both
              vs either vs per-day-minimum vs advisory vs none). Operational advice about what to
              track — deliberately not a statement of law. */}
          <h2 className="text-2xl font-bold tracking-tight mb-3">{implication.heading}</h2>
          <p className="text-muted leading-relaxed mb-6">{implication.body}</p>

          <h3 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">
            What to keep in {state.name}
          </h3>
          <ul className="space-y-2.5 mb-7">
            {[
              noMinimum
                ? `A simple record of what was taught and when — no state minimum to hit, but it's the thing you'll wish you had`
                : `Attendance — the ${state.requirementType.includes('hour') ? 'hours' : 'days'} that count toward ${state.name}'s requirement`,
              testingRequired
                ? `Samples of your child's work — writing, math, projects, and photographs of things they built or grew. This is what an ${state.name} evaluation is easiest to face with.`
                : `Samples of your child's work — writing, math, projects, and photographs of things they built or grew. ${state.name} won't ask for them; the year you need them, nothing else will do.`,
              homestead.bridges.length > 0
                ? `The curriculum and materials you used, and which of ${state.name}'s ${homestead.bridges.length} required subjects each one covered`
                : `The curriculum and materials you used — ${state.name} names no subject list, so your own record of what you covered is the only map of the year`,
              testingRequired
                ? `Your ${state.name} test or evaluation results — required, so keep them filed`
                : `Any assessment you choose to do (${state.name} doesn't require one)`,
              countsHours
                ? `Grades and a transcript — and note that hours logged by subject are what a transcript is built from, so the two are the same job`
                : `Grades and a transcript — especially for high school, and especially if you ever move somewhere stricter than ${state.name}`,
            ].map((r, i) => (
              <li key={i} className="flex items-start gap-3 text-muted text-sm">
                <span className="text-green-700 dark:text-green-400 mt-0.5 shrink-0">✓</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
          <div className="rounded-xl border border-green-200 dark:border-green-900/40 bg-green-50 dark:bg-green-950/20 px-5 py-4">
            <p className="text-muted text-sm leading-relaxed">
              This is exactly what <span className="text-content font-semibold">Cultivate</span> keeps for you.
              {' '}
              {countsHours
                ? `Describe the day in plain English and it files the hours by subject against ${state.name}'s total as you go.`
                : countsDays
                  ? `Describe the day in plain English and it keeps the day count ${state.name} expects, without you counting anything.`
                  : testingRequired
                    ? `Describe the day in plain English and it assembles the work, samples and results your ${state.name} assessment will draw on.`
                    : `Describe the day in plain English and it builds the record ${state.name} never asks for — quietly, in the background.`}
              {' '}
              The chicken tally, the fence repair and the reading lesson go in the same box and come out sorted.
            </p>
          </div>
        </div>
      </section>

      {/* THE BRIDGE — the only section that describes the whole product rather than the
          school half. Content is derived from THIS state's named subjects (lib/stateHomestead.ts),
          so it differs materially state to state instead of being one block with a name swapped.
          ⚖️ Describes how families commonly categorise practical work; never asserts that an
          activity satisfies a requirement. */}
      <section className="border-t border-line">
        <div className="max-w-2xl mx-auto px-6 py-14">
          <h2 className="text-2xl font-bold tracking-tight mb-3">{homestead.heading}</h2>
          <p className="text-muted leading-relaxed mb-7">{homestead.intro}</p>

          {homestead.bridges.length > 0 && (
            <div className="rounded-xl border border-line bg-elevated divide-y divide-line mb-7">
              {homestead.bridges.map((b) => (
                <div key={b.subject} className="flex flex-col sm:flex-row gap-1 sm:gap-4 px-4 py-3.5">
                  <span className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide sm:w-32 shrink-0 pt-0.5">
                    {b.subject}
                  </span>
                  <span className="text-sm text-muted leading-relaxed">{b.examples}</span>
                </div>
              ))}
            </div>
          )}

          <p className="text-muted leading-relaxed mb-5">{homestead.closing}</p>

          <p className="text-subtle text-xs leading-relaxed">
            How practical work is categorised is a judgement your family and {state.name} make —
            Cultivate records what you did, it doesn&apos;t decide what counts. Confirm anything you
            intend to rely on with {state.name} or{' '}
            <a
              href={state.hslda}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-muted"
            >
              HSLDA
            </a>
            .
          </p>
        </div>
      </section>

      {/* Visible FAQ (single source — mirrors the JSON-LD above) */}
      <section className="border-t border-line">
        <div className="max-w-2xl mx-auto px-6 py-14">
          <h2 className="text-2xl font-bold tracking-tight mb-6">{state.name} homeschool requirements — FAQ</h2>
          <div className="space-y-6">
            {faqEntries.map((e, i) => (
              <div key={i}>
                <h3 className="font-semibold text-content mb-1.5">{e.q}</h3>
                <p className="text-muted text-sm leading-relaxed">{e.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How Cultivate helps */}
      <section className="border-t border-line bg-elevated">
        <div className="max-w-2xl mx-auto px-6 py-16 text-center">
          <p className="text-xs font-semibold text-subtle uppercase tracking-widest mb-4">Stop tracking this on paper</p>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-5">
            Cultivate keeps your records — and produces the documents.
          </h2>
          {/* Branches on THIS state's rule shape. Was one identical ~80-word block on all 51
              pages — the single largest duplicate-content contributor left after the bridge
              section. Each variant names the job that state actually creates. */}
          <p className="text-muted leading-relaxed mb-8">
            {state.name} sets the rules. Cultivate does the part that has to happen every day:
            {' '}
            {countsHours
              ? `you describe the day in plain English and it tallies the hours by subject as you go — so the ${state.name} total is already counted, not reconstructed in May from memory.`
              : countsDays
                ? `you describe the day in plain English and it keeps the attendance record ${state.name} expects, so the day count is never a guess.`
                : testingRequired
                  ? `you describe the day in plain English and it builds the running record of work, subjects and samples that an ${state.name} assessment is easiest to face with.`
                  : `you describe the day in plain English and it keeps the record ${state.name} doesn't ask for — the one you'll want the year something changes.`}
            {' '}
            The garden, the animals, the workshop and the school day all go in the same place, and come
            out as print-ready reports and transcripts whenever you need them.
          </p>
          <Link
            href={trialHref}
            className="inline-flex items-center justify-center bg-gradient-to-r from-green-700 to-green-600 hover:from-green-600 hover:to-green-500 text-white font-semibold px-8 py-3.5 rounded-xl transition-all shadow-lg shadow-green-900/30"
          >
            Start your free 7-day trial
          </Link>
          <p className="text-subtle text-xs mt-4">
            7-day free trial · Cancel anytime before it ends
          </p>
        </div>
      </section>

      {/* Other states — internal linking */}
      <section className="border-t border-line">
        <div className="max-w-2xl mx-auto px-6 py-12">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-4">Other states</h2>
          <div className="flex flex-wrap gap-2">
            {others.map((o) => (
              <Link
                key={o.abbr}
                href={`/state-requirements/${stateSlug(o.name)}`}
                className="text-sm text-muted bg-card border border-line hover:border-green-800 hover:text-green-700 dark:text-green-300 px-3 py-1.5 rounded-lg transition-colors"
              >
                {o.name}
              </Link>
            ))}
            <Link
              href="/state-requirements"
              className="text-sm text-green-700 dark:text-green-400 hover:text-green-700 dark:text-green-300 px-3 py-1.5 rounded-lg transition-colors"
            >
              All 50 states + DC →
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-line px-6 py-8">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2">
            <LeafLogo />
            <span className="text-sm font-semibold text-muted">Cultivate</span>
          </Link>
          <div className="flex items-center gap-6 text-xs text-subtle">
            <Link href="/pricing" className="hover:text-muted transition-colors">Pricing</Link>
            <Link href="/login" className="hover:text-muted transition-colors">Sign in</Link>
            <Link href="/privacy" className="hover:text-muted transition-colors">Privacy</Link>
          </div>
          <p className="text-xs text-subtle">Built by a homeschooling family — for ours, and for yours.</p>
        </div>
      </footer>
    </div>
  )
}
