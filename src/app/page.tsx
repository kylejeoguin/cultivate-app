import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Cultivate — Built for the homeschool family that never separated school from life',
  description: 'Keep your homeschool records, your garden and animals, and your house projects in one place. Built by a homeschooling family, for families like yours.',
}

function LeafLogo() {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-9 h-9">
      <path d="M16 4C16 4 6 10 6 20C6 25.523 10.477 30 16 30C21.523 30 26 25.523 26 20C26 10 16 4 16 4Z" fill="url(#leafGradL)" />
      <path d="M16 4C16 4 6 10 6 20" stroke="#4ade80" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
      <path d="M16 30L16 12" stroke="#052e16" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <defs>
        <linearGradient id="leafGradL" x1="16" y1="4" x2="16" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4ade80" />
          <stop offset="100%" stopColor="#15803d" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; state?: string }>
}) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) redirect('/dashboard')
  } catch (e) {
    // If redirect() was called, rethrow it — otherwise swallow auth errors
    if ((e as { digest?: string })?.digest?.startsWith('NEXT_REDIRECT')) throw e
  }

  // Acquisition attribution — forward ?source=<channel>&state=<abbr> from the
  // marketing front door onto every signup/pricing CTA so trial→paid can be read
  // per channel. Without this, warm-post traffic (?source=warm) lands tagged
  // 'direct' at /signup and can't be separated from cold buyers. Mirrors the
  // cold funnel in state-requirements/StateRequirementsClient.tsx.
  const sp = await searchParams
  const attr = new URLSearchParams()
  const source = (sp.source || '').slice(0, 60)
  const state = (sp.state || '').slice(0, 10)
  if (source) attr.set('source', source)
  if (state) attr.set('state', state)
  const q = attr.toString()
  const signupHref = q ? `/signup?${q}` : '/signup'
  const pricingHref = q ? `/pricing?${q}` : '/pricing'

  return (
    <div className="min-h-screen bg-surface text-content">

      {/* Nav */}
      <nav className="border-b border-line px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <LeafLogo />
            <span className="text-lg font-bold tracking-tight text-content">Cultivate</span>
          </div>
          <div className="flex items-center gap-4">
            {/* SEO: the 51 statically-generated /state-requirements/[state] pages had ZERO inbound
                links from this page (verified 2026-08-02) — the whole cluster was orphaned, which
                is a likely contributor to 50 of 52 never being indexed. Anchor text deliberately
                matches the target query pattern ("[state] homeschool requirements"). Hidden on
                small screens by CSS only, so it stays in the HTML and remains crawlable. */}
            <Link
              href="/state-requirements"
              className="hidden sm:inline text-sm text-muted hover:text-content transition-colors"
            >
              Homeschool requirements by state
            </Link>
            <Link href="/login" className="text-sm text-muted hover:text-content transition-colors">
              Sign in
            </Link>
            <Link
              href={signupHref}
              className="text-sm bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded-lg transition-colors font-medium"
            >
              Start free trial
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-900/50 rounded-full px-4 py-1.5 mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0"></span>
          <span className="text-green-700 dark:text-green-400 text-xs font-medium">Built by a homeschooling family, for ours and yours</span>
        </div>

        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight mb-6">
          Built for the homeschool family<br />
          <span className="text-green-700 dark:text-green-400">that never separated school from life.</span>
        </h1>

        <p className="text-muted text-lg leading-relaxed max-w-2xl mx-auto mb-6">
          The house, the garden, the animals, and the school day all happen in the same day.
          Your records should reflect that — and until now, no tool has.
        </p>
        <p className="text-subtle text-base leading-relaxed max-w-xl mx-auto mb-10">
          The afternoon your daughter helped put up green beans — Science, Life Skills, Home Economics.
          The morning you worked out what the feed actually costs — Math and Economics.
          The Saturday you rebuilt the mower together — Shop and Problem Solving.
          It counted as school, and it counted as a record you&apos;ll want later.
          Cultivate keeps one record that does both.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href={signupHref}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-gradient-to-r from-green-700 to-green-600 hover:from-green-600 hover:to-green-500 text-white font-semibold px-8 py-3.5 rounded-xl transition-all shadow-lg shadow-green-900/30 text-base"
          >
            Start your free 7-day trial
          </Link>
          <Link
            href={pricingHref}
            className="w-full sm:w-auto inline-flex items-center justify-center text-muted hover:text-content text-sm transition-colors px-4 py-3.5"
          >
            See pricing →
          </Link>
        </div>
        <p className="text-subtle text-xs mt-4">7-day free trial. Cancel anytime before it ends.</p>
      </section>

      {/* The problem */}
      <section className="border-t border-line bg-elevated">
        <div className="max-w-4xl mx-auto px-6 py-20">
          <p className="text-xs font-semibold text-subtle uppercase tracking-widest mb-4 text-center">The problem with every other app</p>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center mb-6">
            Every other tool was built for one slice of your life.
          </h2>
          <p className="text-muted text-center leading-relaxed max-w-2xl mx-auto mb-16">
            Homeschool apps treat your home like a classroom. Homestead apps ignore education entirely.
            Home management apps don&apos;t know you exist. Your family lives all three simultaneously —
            and you&apos;ve been stitching together a different tool for each one.
          </p>

          <div className="grid sm:grid-cols-3 gap-6">
            {[
              {
                icon: '📋',
                title: 'Paperwork without purpose',
                body: 'Existing apps turn daily logging into a second job. Cultivate takes 2 minutes — describe your day, and it builds your record automatically.',
              },
              {
                icon: '🌾',
                title: 'The rest of your life disappears',
                body: "Every other tool ignores the garden, the animals, the canning shelf, and the equipment. The record you need to run the place better never gets captured — and neither does the school credit your kids earned doing the work.",
              },
              {
                icon: '📜',
                title: 'Compliance feels like a threat',
                body: "State requirements feel unclear and scary. Cultivate keeps your state's rules in front of you as a dated starting point to verify, tracks your hours and subjects, reminds you before filing deadlines, and gives you a print-ready transcript — plus a portfolio builder for the states that require one.",
              },
            ].map(item => (
              <div key={item.title} className="bg-card border border-line rounded-2xl p-6">
                <div className="text-3xl mb-4">{item.icon}</div>
                <h3 className="font-semibold text-content mb-2 text-base">{item.title}</h3>
                <p className="text-muted text-sm leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-4xl mx-auto px-6 py-20">
        <p className="text-xs font-semibold text-subtle uppercase tracking-widest mb-4 text-center">How it works</p>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center mb-16">
          Describe your day. We handle the rest.
        </h2>

        <div className="grid sm:grid-cols-3 gap-8">
          {[
            {
              step: '01',
              title: 'Log in plain English',
              body: 'No forms, no dropdowns, no subject codes. Write what you actually did — "read about the Civil War, made cheese, fixed the tractor belt." Two minutes, done.',
            },
            {
              step: '02',
              title: 'AI reads and routes it',
              body: 'Cultivate reads what you typed and figures out where it belongs — school records, homestead log, equipment maintenance, or all three. A confirmation card shows everything it plans to write. You review and confirm with one tap.',
            },
            {
              step: '03',
              title: 'Your record builds itself',
              body: "Attendance, hours, subject coverage, and state compliance — tracked automatically. Print a transcript at any time. Hand it to an evaluator or a college with confidence.",
            },
          ].map(item => (
            <div key={item.step} className="relative">
              <div className="text-5xl font-bold text-subtle mb-4 leading-none" aria-hidden="true">{item.step}</div>
              <h3 className="font-semibold text-content mb-2">{item.title}</h3>
              <p className="text-muted text-sm leading-relaxed">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* One record two purposes */}
      <section className="border-t border-line bg-elevated">
        <div className="max-w-4xl mx-auto px-6 py-20">
          <p className="text-xs font-semibold text-subtle uppercase tracking-widest mb-4 text-center">One record. Two purposes.</p>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center mb-6">
            There&apos;s a lot of work in a day.<br />Most of it is also school.
          </h2>
          <p className="text-muted text-center leading-relaxed max-w-2xl mx-auto mb-16">
            Most families decide by memory — what to plant again, what was worth the effort, when the mower was
            last serviced — because nothing ever helped them write it down. Cultivate changes that.
            And because your kids are right there working alongside you, every record does double duty.
          </p>

          <div className="grid sm:grid-cols-2 gap-6">
            {[
              {
                emoji: '📊',
                color: 'border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/15',
                accent: 'text-amber-700 dark:text-amber-400',
                title: 'Keep track of your place',
                points: [
                  'Track production year over year — know what\'s actually working',
                  'Log costs and yields — know your real margins before next season',
                  'Maintenance records for every piece of equipment',
                  'Compare this year\'s harvest to last — make data-driven decisions',
                  'Know exactly what you put up, when, and how much',
                ],
              },
              {
                emoji: '🎓',
                color: 'border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/20',
                accent: 'text-green-700 dark:text-green-400',
                title: 'Build a complete education record',
                points: [
                  'Work around the place flows into school credit',
                  'Feed cost calculations = Math and Business Economics',
                  'Animal husbandry = Biology, Agriculture, Vocational Ed',
                  'Food preservation = Chemistry, Home Economics, Life Skills',
                  'Every hour of real work is a documented learning hour',
                ],
              },
            ].map(item => (
              <div key={item.title} className={`border rounded-2xl p-6 ${item.color}`}>
                <div className="text-3xl mb-3">{item.emoji}</div>
                <h3 className={`font-bold text-base mb-4 ${item.accent}`}>{item.title}</h3>
                <ul className="space-y-2.5">
                  {item.points.map(p => (
                    <li key={p} className="flex items-start gap-2 text-sm text-muted">
                      <span className={`mt-0.5 shrink-0 text-xs ${item.accent}`}>✓</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What's inside */}
      <section className="border-t border-line bg-elevated">
        <div className="max-w-4xl mx-auto px-6 py-20">
          <p className="text-xs font-semibold text-subtle uppercase tracking-widest mb-4 text-center">Everything in one place</p>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center mb-16">
            Three modules. One family. One place.
          </h2>

          <div className="grid sm:grid-cols-3 gap-6">
            {[
              {
                emoji: '📚',
                color: 'border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/20',
                accent: 'text-green-700 dark:text-green-400',
                label: 'Homeschool',
                features: [
                  'Daily log with AI subject tagging',
                  'Attendance & hours for all 50 states',
                  'Filing-deadline reminders for your state',
                  'Print-ready transcripts + portfolio builder',
                  'Assessment & evaluation records',
                  'Achievement certificates for the kids',
                  'Homeschool expense & tax tracking',
                  'Subject gap detection',
                  'Unlimited children + annual yearbook',
                ],
              },
              {
                emoji: '🌾',
                color: 'border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/15',
                accent: 'text-amber-700 dark:text-amber-400',
                label: 'Homestead',
                features: [
                  'Livestock production logs',
                  'Garden tracking by season',
                  'Food preservation records',
                  'Year-over-year production intelligence',
                  'Cost vs. yield — know your real margins',
                  'Count the work as school credit',
                  'Annual homestead wrap-up yearbook',
                ],
              },
              {
                emoji: '🏠',
                color: 'border-sky-200 dark:border-sky-900/50 bg-sky-50 dark:bg-sky-950/15',
                accent: 'text-sky-700 dark:text-sky-400',
                label: 'Home & DIY',
                features: [
                  'Equipment maintenance tracker',
                  'Service date reminders',
                  'Renovation project budgets',
                  'Project timelines',
                  'Cost tracking',
                  'Progress documentation',
                ],
              },
            ].map(module => (
              <div key={module.label} className={`border rounded-2xl p-6 ${module.color}`}>
                <div className="text-3xl mb-3">{module.emoji}</div>
                <h3 className={`font-bold text-base mb-4 ${module.accent}`}>{module.label}</h3>
                <ul className="space-y-2">
                  {module.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm text-muted">
                      <span className={`mt-0.5 shrink-0 text-xs ${module.accent}`}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section className="max-w-4xl mx-auto px-6 py-20">
        <p className="text-xs font-semibold text-subtle uppercase tracking-widest mb-4 text-center">Who this is for</p>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center mb-4">
          You&apos;ll know immediately if this is you.
        </h2>
        <p className="text-muted text-center max-w-xl mx-auto mb-16">
          Cultivate isn&apos;t for everyone. It&apos;s for a specific kind of family living a specific kind of life.
        </p>

        <div className="grid sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
          {[
            'Your kids learn by doing, not by sitting',
            'The farm, garden, or animals are part of the curriculum',
            'You want to decide by your own records, not by memory',
            'You care about state compliance but refuse to let it define your approach',
            'You believe learning is lifelong — not a K-12 problem to solve and move on from',
            'You\'re new to homeschooling and want to start right',
            'You\'ve been doing this for years on spreadsheets and notebooks',
            'Life and school are the same thing in your house — and always have been',
          ].map(item => (
            <div key={item} className="flex items-start gap-3 bg-card border border-line rounded-xl px-4 py-3">
              <span className="text-green-700 mt-0.5 shrink-0 font-bold text-sm">✓</span>
              <span className="text-muted text-sm">{item}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing CTA */}
      <section className="border-t border-line bg-elevated">
        <div className="max-w-lg mx-auto px-6 py-20 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
            Simple pricing. Everything included.
          </h2>
          <p className="text-muted mb-8 leading-relaxed">
            Unlimited children, all three modules, state compliance tracking, transcript generation.
            Individual or Family plan. No upsells. No feature gates.
          </p>

          <div className="bg-card border border-line-strong rounded-2xl p-8 mb-8">
            <div className="flex items-end justify-center gap-2 mb-1">
              <span className="text-5xl font-bold tracking-tight">$5</span>
              <span className="text-muted text-base mb-2">/month</span>
            </div>
            <p className="text-subtle text-sm mb-1">or $50/year — like 2 months free · Family plan $8/mo or $80/yr</p>
            <p className="text-green-700 dark:text-green-400 text-sm font-medium mt-3">7-day free trial · Cancel anytime before it ends</p>
            <div className="border-t border-line mt-6 pt-6 space-y-2.5 text-left">
              {[
                'All three modules — Homeschool, Homestead, Home & DIY',
                'Unlimited children',
                'State compliance tracking + print-ready transcripts',
                'AI subject tagging on every log entry',
                'Annual yearbook — homeschool recap + homestead wrap-up, ready to print',
                'Your data is always yours — export anytime',
              ].map(f => (
                <div key={f} className="flex items-start gap-2.5 text-sm text-muted">
                  <span className="text-green-700 shrink-0 mt-0.5">✓</span>
                  {f}
                </div>
              ))}
            </div>
          </div>

          <Link
            href={signupHref}
            className="inline-flex items-center justify-center w-full bg-gradient-to-r from-green-700 to-green-600 hover:from-green-600 hover:to-green-500 text-white font-semibold px-8 py-4 rounded-xl transition-all shadow-lg shadow-green-900/30 text-base mb-4"
          >
            Start your free 7-day trial
          </Link>
          <p className="text-subtle text-xs">Cancel anytime before your trial ends and you won’t be charged. Your data is always yours.</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-line px-6 py-8">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <LeafLogo />
            <span className="text-sm font-semibold text-muted">Cultivate</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-subtle">
            <Link href={pricingHref} className="hover:text-muted transition-colors">Pricing</Link>
            {/* Second crawl path to the state-page cluster — always visible, incl. mobile. */}
            <Link href="/state-requirements" className="hover:text-muted transition-colors">Requirements by state</Link>
            <Link href="/login" className="hover:text-muted transition-colors">Sign in</Link>
            <Link href="/privacy" className="hover:text-muted transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-muted transition-colors">Terms</Link>
          </div>
          <p className="text-xs text-subtle">Built by a homeschooling family — for ours, and for yours.</p>
        </div>
      </footer>

    </div>
  )
}
