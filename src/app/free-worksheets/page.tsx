import type { Metadata } from 'next'
import Link from 'next/link'
import FreeWorksheetsClient from './FreeWorksheetsClient'

export const metadata: Metadata = {
  title: 'Free Pre-Writing Worksheets for Preschoolers | Cultivate',
  description:
    'A free printable pre-writing pack — 11 stroke and shape sheets in color and ink-saver. Lines, curves, zigzags, and shapes to build the fine-motor control handwriting needs.',
  alternates: { canonical: '/free-worksheets' },
}

const STROKES = [
  'Vertical lines', 'Horizontal lines', 'Circles', 'Squares', 'Triangles', 'Waves',
  'Zigzags', 'Slants (left)', 'Slants (right)', 'Plus', 'X',
]

// The public door for the free pack. Pinterest pins, the Etsy worksheet PDFs, and Cultivate's
// own top-of-funnel all point here. It must work for a stranger with no account — Cultivate is
// trial→paid with no free tier, so a `tier='free'` row inside /dashboard/resources is only free
// to people who ALREADY pay. This page is the one that isn't.
//
// `source` is read here on the SERVER and passed down. Reading it with useSearchParams() in the
// client would opt this page's Suspense boundary out of prerendering and ship an empty shell to
// a Pinterest crawler — the same defect that blanked /login.
export default async function FreeWorksheetsPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>
}) {
  const params = await searchParams
  const source = (params.source ?? 'free-worksheets').slice(0, 60)

  return (
    <div className="min-h-screen bg-surface text-content">
      <nav className="border-b border-line px-6 py-4 flex items-center justify-between">
        <Link href="/" className="font-bold tracking-tight">Cultivate</Link>
        <Link
          href="/signup"
          className="text-sm bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded-lg transition-colors font-medium"
        >
          Start free trial
        </Link>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-12 sm:py-16">
        <div className="inline-flex items-center gap-2 bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-900/50 rounded-full px-4 py-1.5 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0"></span>
          <span className="text-xs font-medium text-green-700 dark:text-green-400">Free download · No account needed</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
          Free pre-writing worksheets
        </h1>
        <p className="text-muted text-base leading-relaxed mb-8">
          Eleven stroke and shape sheets — the lines, curves, and corners that hands need to
          practice before letters make any sense. Every sheet comes twice: a color version, and
          an ink-saver version for when the printer is running on fumes.
        </p>

        <div className="bg-card border border-line rounded-2xl p-6 sm:p-8 mb-10">
          <FreeWorksheetsClient source={source} />
        </div>

        <div className="bg-card border border-line rounded-2xl p-6 sm:p-8 mb-10">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-widest mb-4">
            What&apos;s inside — 22 sheets
          </h2>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-2 mb-6">
            {STROKES.map(s => (
              <li key={s} className="flex items-center gap-2 text-sm text-muted">
                <span className="text-green-700 text-xs">✓</span>
                {s}
              </li>
            ))}
          </ul>
          <p className="text-subtle text-xs leading-relaxed">
            11 strokes × 2 versions (Color + Ink-Saver). PDF, US Letter, print at home.
          </p>
        </div>

        <div className="border-t border-line pt-8">
          <h2 className="text-lg font-semibold mb-2">Where this came from</h2>
          <p className="text-muted text-sm leading-relaxed mb-5">
            We built these for our own girls. They&apos;re part of a growing printable library
            inside Cultivate — the alphabet and number packs add farm and garden art to every sheet:
            chickens to count, gardens to color, a barn behind the letter B. The full library
            comes with a subscription, alongside the homeschool records, garden and animal tracking.
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center gap-1.5 bg-green-700 hover:bg-green-600 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
          >
            See the full library — start a free trial
          </Link>
        </div>
      </main>
    </div>
  )
}
