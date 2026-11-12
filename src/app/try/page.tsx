import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DemoTagBox from './DemoTagBox'

// Paid-traffic landing page. The identity/pain/homestead Meta ads point here. Its whole job is
// to deliver the product's aha moment — "type your day → watch the AI tag it" — ABOVE THE FOLD,
// before the signup wall, then invite the visitor into the real free trial (v1 is a pure demo;
// nothing is saved). Message-matched to the identity ads; visually continuous with the dark
// marketing funnel (homepage/signup are the same dark-stone system — deliberately, per INTEL §3).

export const metadata = {
  title: 'Try Cultivate — home, garden, animals, and school in one place',
  description:
    'Write down what your family did today and watch Cultivate file it — school records, garden and animal logs, equipment history. The work around the place counts as school. Try it free for 7 days.',
}

function LeafLogo() {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-9 h-9" aria-hidden="true">
      <path d="M16 4C16 4 6 10 6 20C6 25.523 10.477 30 16 30C21.523 30 26 25.523 26 20C26 10 16 4 16 4Z" fill="url(#leafGradTry)" />
      <path d="M16 4C16 4 6 10 6 20" stroke="#4ade80" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
      <path d="M16 30L16 12" stroke="#052e16" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <defs>
        <linearGradient id="leafGradTry" x1="16" y1="4" x2="16" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4ade80" />
          <stop offset="100%" stopColor="#15803d" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export default async function TryPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; state?: string }>
}) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) redirect('/dashboard')
  } catch (e) {
    if ((e as { digest?: string })?.digest?.startsWith('NEXT_REDIRECT')) throw e
  }

  // Forward ?source=&state= onto the signup CTA so trial→paid reads per channel — same
  // attribution pattern as the homepage and the state-requirements front door.
  const sp = await searchParams
  const attr = new URLSearchParams()
  const source = (sp.source || '').slice(0, 60)
  const state = (sp.state || '').slice(0, 10)
  if (source) attr.set('source', source)
  if (state) attr.set('state', state)
  const q = attr.toString()
  const signupHref = q ? `/signup?${q}` : '/signup'

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
            <Link href="/login" className="text-sm text-muted hover:text-content transition-colors">
              Sign in
            </Link>
            <Link
              href={signupHref}
              className="text-sm bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded-lg transition-colors font-medium"
            >
              Try it free
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero + live demo */}
      <section className="max-w-3xl mx-auto px-6 pt-16 pb-20 text-center">
        <div className="inline-flex items-center gap-2 bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-900/50 rounded-full px-4 py-1.5 mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0"></span>
          <span className="text-green-700 dark:text-green-400 text-xs font-medium">Built by a homeschooling family, for ours and yours</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight leading-tight mb-5">
          The house, the garden, the animals, the school day.<br />
          <span className="text-green-700 dark:text-green-400">One place for all of it.</span>
        </h1>

        <p className="text-muted text-lg leading-relaxed max-w-xl mx-auto">
          Write down what your family did today — the reading, the chickens, the busted water
          heater. Cultivate sorts each piece where it belongs, and the work around the place
          counts toward school.
        </p>

        <DemoTagBox signupHref={signupHref} source={source} />

        <p className="text-subtle text-xs mt-6">
          It&apos;s a live demo — nothing is saved until you start your free trial.
        </p>
      </section>

      {/* How it works — brief */}
      <section className="border-t border-line bg-elevated">
        <div className="max-w-4xl mx-auto px-6 py-16">
          <p className="text-xs font-semibold text-subtle uppercase tracking-widest mb-4 text-center">How it works</p>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center mb-12">
            Describe your day. We handle the rest.
          </h2>
          <div className="grid sm:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Log in plain English', body: 'Write what you actually did — "read about the Civil War, made cheese, fixed the tractor belt." Two minutes, done.' },
              { step: '02', title: 'AI reads and routes it', body: 'Cultivate figures out where it belongs — school records, garden and livestock logs, equipment maintenance, or all three. You review and confirm with one tap.' },
              { step: '03', title: 'Your record builds itself', body: 'Attendance, hours, subject coverage, and state compliance — tracked automatically. Print a transcript any time.' },
            ].map((item) => (
              <div key={item.step} className="relative">
                <div className="text-5xl font-bold text-subtle mb-4 leading-none" aria-hidden="true">{item.step}</div>
                <h3 className="font-semibold text-content mb-2">{item.title}</h3>
                <p className="text-muted text-sm leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What you end up with.
          The demo box above proves the INPUT is easy. It said nothing about what you get out,
          which was the gap: a visitor could not see the app at all before deciding to hand over
          a card — there was not one screenshot anywhere on the site. These are real screens from
          a seeded example account, labelled as such. */}
      <section className="border-t border-line">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <p className="text-xs font-semibold text-subtle uppercase tracking-widest mb-4 text-center">What you end up with</p>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center mb-3">
            A few minutes a day, and the record writes itself.
          </h2>
          <p className="text-muted text-center leading-relaxed max-w-2xl mx-auto mb-12">
            This is a real account partway through a school year — not a mockup. Example family,
            example records.
          </p>

          <div className="space-y-12">
            {[
              {
                src: '/demo/history.png',
                alt: 'A list of logged days. Each entry shows what the family did that day, how long it took, and the subjects it counted toward.',
                title: 'What you wrote down',
                body: 'You describe the day the way you would say it. Cultivate attaches the hours and the subjects — including the work that happened outside a book.',
              },
              {
                src: '/demo/report.png',
                alt: 'A year-to-date report: days present, days absent, hours logged, progress against the state hour requirement, and core-subject hours.',
                title: 'Where you stand',
                body: 'Hours against what your state asks for, core-subject totals, and which subjects are running light — updated as you log, not assembled in a panic in April.',
              },
              {
                src: '/demo/attendance.png',
                alt: 'A month of the school year as a calendar, each school day marked present, with running totals for days present, absent, and excused.',
                title: 'The attendance record',
                body: 'Every logged day counts itself. Print it, or hand it to an evaluator.',
              },
            ].map(shot => (
              <div key={shot.src}>
                <h3 className="font-semibold text-content mb-1">{shot.title}</h3>
                <p className="text-muted text-sm leading-relaxed mb-4 max-w-2xl">{shot.body}</p>
                <div className="rounded-xl border border-line overflow-hidden bg-card">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={shot.src} alt={shot.alt} className="w-full h-auto block" loading="lazy" />
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-subtle text-center mt-10">
            Screens from an example account with sample records — not a real family&apos;s data.
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-lg mx-auto px-6 py-20 text-center">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
          Your whole life, one place.
        </h2>
        <p className="text-muted mb-2 leading-relaxed">
          Homeschool, garden and animals, and the house — all three modules, unlimited children,
          state compliance tracking, and print-ready transcripts.
        </p>
        <p className="text-subtle text-sm mb-8">$5/mo or $50/year · Family $8/mo or $80/yr</p>
        <Link
          href={signupHref}
          className="inline-flex items-center justify-center w-full bg-gradient-to-r from-green-700 to-green-600 hover:from-green-600 hover:to-green-500 text-white font-semibold px-8 py-4 rounded-xl transition-all shadow-lg shadow-green-900/30 text-base mb-3"
        >
          Try it free →
        </Link>
        <p className="text-subtle text-xs">The full app, 7 days. Cancel anytime before it ends.</p>
      </section>

      {/* Footer */}
      <footer className="border-t border-line px-6 py-8">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <LeafLogo />
            <span className="text-sm font-semibold text-muted">Cultivate</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-subtle">
            <Link href="/pricing" className="hover:text-muted transition-colors">Pricing</Link>
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
