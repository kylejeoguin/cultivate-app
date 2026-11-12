import { redirect } from 'next/navigation'
import { getCachedUser } from '@/lib/auth'
import { getAccessInfo } from '@/lib/access'
import BottomNav from './BottomNav'
import SideNav from './SideNav'
import FeedbackButton from './FeedbackButton'
import PushRefresher from './PushRefresher'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const access = await getAccessInfo()
  if (!access.hasAccess) {
    // Former subscribers keep an export-only path so they can always retrieve their records;
    // never-subscribed users go to /pricing to convert.
    redirect(access.reason === 'lapsed' ? '/account' : '/pricing')
  }

  return (
    <div className="min-h-screen bg-surface">
      <SideNav />
      {/* pb-20 clears the bottom nav + iOS safe area on mobile. md:ml-56 clears the side nav on desktop. lg:ml-64 matches the wider sidenav on large screens. */}
      {/* print:ml-0 / print:pb-0 — drop the sidebar gutter + bottom-nav padding so a
          printed/PDF document (yearbook, reports) uses the full page, not a shifted column. */}
      <div className="pb-20 md:pb-0 md:ml-56 lg:ml-64 print:ml-0 print:pb-0">
        {children}
      </div>
      <BottomNav />
      <FeedbackButton />
      <PushRefresher />
    </div>
  )
}
