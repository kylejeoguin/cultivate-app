import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCachedUser } from '@/lib/auth'
import { getAccessInfo } from '@/lib/access'
import ExportDataButton from '../dashboard/account/ExportDataButton'
import SignOutButton from '../dashboard/account/SignOutButton'

export const metadata = {
  title: 'Your account · Cultivate',
}

// Standalone, export-only account view for former subscribers. It lives OUTSIDE the dashboard
// gate so a lapsed/canceled user (locked out of the app) can still download their data or
// resubscribe. Active members are sent into the app; their in-app Account page has the same export.
export default async function AccountPage() {
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const access = await getAccessInfo()
  if (access.hasAccess) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-surface text-content flex flex-col">
      <nav className="border-b border-line px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <span className="text-lg font-bold tracking-tight text-green-700">Cultivate</span>
        </Link>
        <SignOutButton inline className="text-sm text-subtle hover:text-content transition-colors" />
      </nav>

      <main className="flex-1 flex items-start justify-center px-6 py-12">
        <div className="w-full max-w-lg space-y-8">
          <div className="space-y-3">
            <h1 className="text-2xl font-bold">Your subscription has ended</h1>
            <p className="text-sm text-subtle leading-relaxed">
              Your records are safe. We keep your homeschool, garden, and home records so you can pick up
              right where you left off whenever you come back — we never delete your data unless you ask us to.
              You can download everything anytime below, or resubscribe to unlock the full app again.
            </p>
          </div>

          <div className="rounded-xl border border-line bg-elevated p-5 space-y-4">
            <h2 className="text-sm font-semibold text-content">Download your data</h2>
            <ExportDataButton />
          </div>

          <div className="rounded-xl border border-line bg-elevated p-5 space-y-3">
            <h2 className="text-sm font-semibold text-content">Pick up where you left off</h2>
            <p className="text-xs text-subtle leading-relaxed">
              Resubscribe and everything you logged is right where you left it — nothing was lost.
            </p>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center py-2.5 px-4 bg-green-700 hover:bg-green-600 text-white font-medium rounded-lg transition-colors text-sm"
            >
              Resubscribe →
            </Link>
          </div>

          <p className="text-xs text-subtle text-center">
            Signed in as {user.email}
          </p>
        </div>
      </main>
    </div>
  )
}
