import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import SignOutButton from './SignOutButton'
import ExportDataButton from './ExportDataButton'
import ChildrenManager from './ChildrenManager'
import FamilyManager from './FamilyManager'
import ManageBillingButton from './ManageBillingButton'
import UnitsManager from './UnitsManager'
import RemindersManager, { REMINDER_DEFAULTS, type ReminderPrefsRow } from './RemindersManager'
import { ThemeToggle } from '../ThemeToggle'

export default async function AccountPage() {
  const supabase = await createClient()
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const [
    { data: children },
    { data: sub },
    { data: familyMembers },
    { data: memberOf },
    { data: customUnits },
    { data: reminderPrefs },
  ] = await Promise.all([
    supabase.from('children').select('*').order('created_at'),
    supabase.from('subscriptions').select('status, tier, trial_end').eq('user_id', user.id).single(),
    // Family members this user has invited (owner view)
    supabase.from('family_members').select('*').eq('owner_id', user.id),
    // Family they belong to as a member (member view)
    supabase.from('family_members').select('*, owner:owner_id(email)').eq('member_id', user.id).eq('status', 'accepted').single(),
    // The user's own measurement units (shown in every homestead unit dropdown)
    supabase.from('custom_units').select('id, unit').order('unit'),
    // This person's own reminder prefs. maybeSingle(), not single(): most users have no
    // row until they opt in, and single() would surface that as an error.
    supabase
      .from('notification_prefs')
      .select('enabled, channel, destination, send_hour_local, school_enabled, chores_enabled, equipment_enabled, school_weekdays_only, school_stale_days, renag_days')
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  const isFamily = sub?.tier === 'family'
  const isOwner = !memberOf // if not a member of someone else's family, they're an owner
  const trialEnd = sub?.trial_end ? new Date(sub.trial_end) : null

  return (
    <div className="min-h-screen bg-surface text-content">
      <nav className="border-b border-line/60 px-6 py-4 flex items-center gap-3">
        <Link href="/dashboard" className="text-subtle hover:text-content text-sm transition-colors">← Dashboard</Link>
        <span className="text-subtle">/</span>
        <span className="text-sm font-semibold">Account</span>
      </nav>

      <main className="max-w-2xl lg:max-w-4xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h2 className="text-xl font-bold mb-1">Account</h2>
          <p className="text-muted text-sm">Manage your account and subscription.</p>
        </div>

        {/* Account info */}
        <div className="bg-card border border-line rounded-xl p-5 space-y-4">
          <p className="text-xs font-semibold text-subtle uppercase tracking-widest">Account Info</p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-subtle mb-0.5">Email</p>
              <p className="text-sm text-content">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-subtle mb-0.5">Member since</p>
              <p className="text-sm text-content">
                {new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          </div>
          {memberOf && (
            <div className="pt-2 border-t border-line">
              <p className="text-xs text-subtle mb-0.5">Family account owner</p>
              <p className="text-sm text-content">{(memberOf as { owner?: { email?: string } | null }).owner?.email ?? 'Unknown'}</p>
            </div>
          )}
        </div>

        {/* Appearance */}
        <div className="bg-card border border-line rounded-xl p-5 space-y-4">
          <div>
            <p className="text-xs font-semibold text-subtle uppercase tracking-widest mb-1">Appearance</p>
            <p className="text-xs text-subtle">Choose a light or dark theme. Your choice is saved on this device.</p>
          </div>
          <ThemeToggle />
        </div>

        {/* Children */}
        {children && children.length > 0 && (
          <div id="children" className="bg-card border border-line rounded-xl p-5 space-y-4 scroll-mt-6">
            <div>
              <p className="text-xs font-semibold text-subtle uppercase tracking-widest mb-1">Children</p>
              <p className="text-xs text-subtle">Update name, grade, birthdate, or learning style.</p>
            </div>
            <ChildrenManager initialChildren={children} />
          </div>
        )}

        {/* Custom units — global to the user, shown in every homestead unit dropdown */}
        <div id="units" className="bg-card border border-line rounded-xl p-5 space-y-4 scroll-mt-6">
          <div>
            <p className="text-xs font-semibold text-subtle uppercase tracking-widest mb-1">Units</p>
            <p className="text-xs text-subtle">Your own measurement units for homestead logging (eggs, gallons, and the common ones are built in). Anything you add here appears in every unit dropdown.</p>
          </div>
          <UnitsManager initialUnits={customUnits ?? []} />
        </div>

        {/* Reminders — the off-switch the digest email promises. Per person, not per household. */}
        <div id="reminders" className="bg-card border border-line rounded-xl p-5 space-y-4 scroll-mt-6">
          <div>
            <p className="text-xs font-semibold text-subtle uppercase tracking-widest mb-1">Reminders</p>
            <p className="text-xs text-subtle">One reminder a day when something is due — a phone notification, or an email — and nothing at all when it isn&apos;t. These settings are yours alone; anyone else on your family account sets their own.</p>
          </div>
          <RemindersManager
            initialPrefs={{ ...REMINDER_DEFAULTS, ...(reminderPrefs ?? {}) } as ReminderPrefsRow}
            accountEmail={user.email ?? ''}
            hasChildren={(children?.length ?? 0) > 0}
          />
        </div>

        {/* Subscription */}
        <div className="bg-card border border-line rounded-xl p-5 space-y-4">
          <p className="text-xs font-semibold text-subtle uppercase tracking-widest">Subscription</p>
          <div className="flex items-center justify-between">
            <div>
              {sub?.status === 'trialing' ? (
                <>
                  <p className="text-sm font-medium text-green-600 dark:text-green-400">Free trial</p>
                  <p className="text-xs text-subtle mt-0.5">
                    {trialEnd ? `Trial ends ${trialEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}` : 'Full access during your trial'}
                  </p>
                </>
              ) : sub?.status === 'active' ? (
                <>
                  <p className="text-sm font-medium text-green-600 dark:text-green-400">
                    Active — {isFamily ? 'Family Plan' : 'Individual Plan'}
                  </p>
                  <p className="text-xs text-subtle mt-0.5">Full access to all features</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-muted">No active subscription</p>
                  <p className="text-xs text-subtle mt-0.5">Start a free trial to get access</p>
                </>
              )}
            </div>
          </div>
          {isOwner && (
            (sub?.status === 'active' || sub?.status === 'trialing') ? (
              // Has a Stripe customer → Customer Portal (update payment, switch plan, cancel)
              <ManageBillingButton label={sub?.status === 'active' ? 'Manage subscription →' : 'Manage or cancel trial →'} />
            ) : (
              <Link
                href="/pricing"
                className="block w-full py-2.5 px-4 bg-gradient-to-r from-green-800/60 to-green-900/40 hover:from-green-700/60 hover:to-green-800/40 border border-green-800/50 hover:border-green-700/60 text-green-300 hover:text-green-200 font-medium rounded-lg transition-all text-sm text-center"
              >
                View pricing →
              </Link>
            )
          )}
        </div>

        {/* Family management — only for Family plan owners */}
        {isOwner && isFamily && (
          <FamilyManager initialMembers={familyMembers ?? []} />
        )}

        {/* Data export */}
        <div className="bg-card border border-line rounded-xl p-5 space-y-4">
          <div>
            <p className="text-xs font-semibold text-subtle uppercase tracking-widest mb-1">Your Data</p>
            <p className="text-xs text-subtle">Your data is always yours. Export everything at any time, no questions asked.</p>
          </div>
          <ExportDataButton />
        </div>

        {/* Legal */}
        <div className="bg-card border border-line rounded-xl p-5 space-y-3">
          <p className="text-xs font-semibold text-subtle uppercase tracking-widest">Legal</p>
          <div className="flex gap-4">
            <Link href="/privacy" className="text-sm text-muted hover:text-content transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="text-sm text-muted hover:text-content transition-colors">Terms of Service</Link>
          </div>
        </div>

        {/* Sign out */}
        <div className="bg-card border border-line rounded-xl p-5 space-y-3">
          <p className="text-xs font-semibold text-subtle uppercase tracking-widest">Session</p>
          <SignOutButton />
        </div>
      </main>
    </div>
  )
}
