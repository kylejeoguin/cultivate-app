'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// "Today" (☀️) is the landing = the universal capture box + a lean snapshot.
// The old separate "Log Today" item is retired (the landing IS the log).
//
// 2026-09: Homestead + Home & DIY + Projects collapsed into ONE "Household" section, and
// "School" became "Kids". Sections were named for TOPICS while every entry is deliberately
// multi-topic, so topic-as-folder guaranteed the same thing appearing in several places —
// Projects genuinely rendered in three. "Kids" rather than "School" because chore completions
// carry school credit, so the section is no longer only school.
const NAV_ITEMS = [
  { href: '/dashboard', icon: '☀️', label: 'Today', exact: true },
  { href: '/dashboard/homeschool', icon: '📚', label: 'Kids' },
  { href: '/dashboard/household', icon: '🏡', label: 'Household' },
  { href: '/dashboard/yearbook', icon: '📖', label: 'Yearbook' },
  { href: '/dashboard/resources', icon: '📂', label: 'Resources' },
]

export default function SideNav() {
  const pathname = usePathname()

  return (
    <aside className="print:hidden hidden md:flex flex-col fixed left-0 top-0 h-screen w-56 lg:w-64 bg-surface border-r border-line z-40">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-line">
        <div className="flex items-center gap-2.5">
          <LeafIcon />
          <span className="text-sm font-bold text-green-600 dark:text-green-400 tracking-tight">Cultivate</span>
        </div>
        <p className="text-subtle text-xs mt-1 pl-[26px]">Learning as a lifestyle.</p>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ href, icon, label, exact }) => {
          const isActive = exact ? pathname === href : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-elevated text-content font-medium'
                  : 'text-muted hover:text-content hover:bg-card'
              }`}
            >
              <span className="text-base leading-none">{icon}</span>
              <span>{label}</span>
              {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-line space-y-0.5">
        <Link
          href="/dashboard/account"
          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
            pathname === '/dashboard/account'
              ? 'bg-elevated text-content font-medium'
              : 'text-subtle hover:text-content hover:bg-card'
          }`}
        >
          <span className="text-base leading-none">⚙️</span>
          <span>Account</span>
        </Link>
        <p className="text-subtle text-xs px-3 pt-1">mycultivate.app</p>
      </div>
    </aside>
  )
}

function LeafIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" className="text-green-600 dark:text-green-400 shrink-0">
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
