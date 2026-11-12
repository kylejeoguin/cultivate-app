import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/auth'
import Link from 'next/link'
import CheckoutButton from './CheckoutButton'
import SignOutButton from '../dashboard/account/SignOutButton'
import PricingToggle from './PricingToggle'

export const metadata = {
  title: 'Pricing · Cultivate',
}

const FEATURES = [
  'Daily school log with AI subject tagging',
  'Attendance tracking and calendar view',
  'State compliance reporting (hours + subjects)',
  'Garden, livestock, and preservation count for school credit',
  'Equipment maintenance tracker',
  'PDF transcript export — print-ready, forever',
  'Subject gap detection and activity suggestions',
  'Unlimited children and school years',
  'Annual yearbook — school, garden, and animals, ready to print',
  'Data export anytime — your records, always yours',
]

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; state?: string }>
}) {
  const supabase = await createClient()
  const user = await getCachedUser()

  // Acquisition attribution — forward ?source/&state onto the signup CTAs so a
  // visitor who arrives here from the marketing front door still carries their
  // channel tag into /signup (mirrors the homepage + state-requirements funnel).
  const sp = await searchParams
  const attr = new URLSearchParams()
  const source = (sp.source || '').slice(0, 60)
  const state = (sp.state || '').slice(0, 10)
  if (source) attr.set('source', source)
  if (state) attr.set('state', state)
  const signupQuery = attr.toString()
  const signupHref = signupQuery ? `/signup?${signupQuery}` : '/signup'

  let subscriptionStatus: string | null = null
  if (user) {
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('status')
      .eq('user_id', user.id)
      .single()
    subscriptionStatus = sub?.status ?? null
  }

  const isActive = subscriptionStatus === 'active' || subscriptionStatus === 'trialing'

  return (
    <div className="min-h-screen bg-surface text-content">
      <nav className="border-b border-line px-6 py-4 flex items-center justify-between">
        <Link href={user ? '/dashboard' : '/'} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <LeafIcon />
          <span className="text-lg font-bold tracking-tight text-green-700 dark:text-green-400">Cultivate</span>
        </Link>
        <div className="flex items-center gap-4">
          {!user ? (
            <>
              <Link href="/login" className="text-sm text-muted hover:text-content transition-colors">Sign in</Link>
              <Link href={signupHref} className="text-sm bg-green-700 hover:bg-green-600 text-white px-4 py-1.5 rounded-lg transition-colors font-medium">Get started</Link>
            </>
          ) : (
            <>
              {isActive && (
                <Link href="/dashboard" className="text-sm text-muted hover:text-content transition-colors">Dashboard →</Link>
              )}
              <SignOutButton inline className="text-sm text-muted hover:text-content transition-colors" />
            </>
          )}
        </div>
      </nav>

      <main className="max-w-lg mx-auto px-6 py-16">
        {/* Hero */}
        <div className="text-center mb-12">
          <p className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-widest mb-3">Simple pricing</p>
          <h1 className="text-4xl font-bold tracking-tight mb-4">Everything your family needs.<br />Two plans. No surprises.</h1>
          <p className="text-muted text-base">Built for the family where life and school are the same thing.</p>
        </div>

        {/* Plan toggle + pricing card — client component handles interaction */}
        <PricingToggle isLoggedIn={!!user} isActive={isActive} signupQuery={signupQuery} />

        {/* FAQ */}
        <div className="space-y-6 mt-8">
          <FaqItem
            q="What's the difference between Individual and Family?"
            a="Individual gives one parent full access to everything — all modules, unlimited children, all features. Family adds a second parent login so both of you can log in and see everything together under one subscription."
          />
          <FaqItem
            q="When do I get charged?"
            a="Your 7-day free trial starts when you sign up. We collect a card up front so your account rolls straight into your plan when the trial ends — but nothing is charged during those 7 days. Cancel anytime before it ends and you'll never pay a cent."
          />
          <FaqItem
            q="What happens to my data if I cancel?"
            a="We keep your records so you can pick up right where you left off if you ever come back — we don't auto-delete them. You can download a complete export of everything anytime, and we'll permanently delete your data whenever you ask. Your data is always yours."
          />
          <FaqItem
            q="Is this a legal compliance tool?"
            a="Cultivate helps you track and document your homeschool — it's not a legal service. State requirements vary and change. Always verify your state's current laws at hslda.org/legal or your state education department."
          />
          <FaqItem
            q="Can I use this for multiple kids?"
            a="Yes. Unlimited children are included at no extra cost. Each child has their own logs, attendance, and transcript."
          />
        </div>

        {/* Footer links */}
        <div className="flex justify-center gap-6 mt-12 text-xs text-subtle">
          <Link href="/privacy" className="hover:text-muted transition-colors">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-muted transition-colors">Terms of Service</Link>
        </div>
      </main>
    </div>
  )
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <div>
      <p className="text-sm font-semibold text-content mb-1">{q}</p>
      <p className="text-sm text-muted leading-relaxed">{a}</p>
    </div>
  )
}

function LeafIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-green-700 dark:text-green-400">
      <path
        d="M10 2C10 2 4 5 4 11C4 14.314 6.686 17 10 17C13.314 17 16 14.314 16 11C16 5 10 2 10 2Z"
        fill="currentColor"
        fillOpacity="0.15"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M10 17V10M10 10C10 10 7.5 8 6 6M10 10C10 10 12.5 8 14 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
