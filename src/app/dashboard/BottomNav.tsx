'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Mobile primary destinations. "Today" (☀️) is the landing = the universal log.
// The 5th slot is a "More ⋯" sheet (Priority+ pattern, IA Decision 4) holding the
// destinations that don't fit the bar — fixing the four that were stranded on mobile.
// 2026-09: three primary destinations instead of four — Homestead + Home & DIY merged into
// Household, and Projects folded in as one of its sub-areas rather than a section of its own.
// Labels and order deliberately match SideNav so muscle memory transfers between devices.
const NAV_ITEMS = [
  { href: '/dashboard', icon: '☀️', label: 'Today', exact: true },
  { href: '/dashboard/homeschool', icon: '📚', label: 'Kids' },
  { href: '/dashboard/household', icon: '🏡', label: 'Household' },
]

const MORE_ITEMS = [
  { href: '/dashboard/yearbook', icon: '📖', label: 'Yearbook' },
  { href: '/dashboard/resources', icon: '📂', label: 'Resources' },
  { href: '/dashboard/account', icon: '⚙️', label: 'Account' },
]

export default function BottomNav() {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)

  const moreActive = MORE_ITEMS.some(m => pathname.startsWith(m.href))

  return (
    <>
      {/* More sheet */}
      {moreOpen && (
        <>
          <button type="button" aria-label="Close menu" className="md:hidden fixed inset-0 bg-black/50 z-[55]" onClick={() => setMoreOpen(false)} />
          <div className="md:hidden fixed inset-x-0 bottom-0 z-[60] bg-card border-t border-line rounded-t-2xl pb-safe">
            <div className="px-4 pt-3 pb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-subtle uppercase tracking-widest">More</span>
              <button onClick={() => setMoreOpen(false)} className="text-subtle hover:text-content text-sm transition-colors">Done</button>
            </div>
            <div className="grid grid-cols-2 gap-2 px-4 pb-4">
              {MORE_ITEMS.map(({ href, icon, label }) => {
                const isActive = pathname.startsWith(href)
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMoreOpen(false)}
                    className={`flex items-center gap-3 border rounded-xl px-4 py-3 transition-colors ${
                      isActive
                        ? 'bg-elevated border-line-strong text-content'
                        : 'bg-elevated/60 border-line text-muted hover:text-content'
                    }`}
                  >
                    <span className="text-lg leading-none">{icon}</span>
                    <span className="text-sm font-medium">{label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        </>
      )}

      <nav className="print:hidden md:hidden fixed bottom-0 inset-x-0 bg-surface/95 backdrop-blur-sm border-t border-line flex z-50 pb-safe">
        {NAV_ITEMS.map(({ href, icon, label, exact }) => {
          const isActive = exact ? pathname === href : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setMoreOpen(false)}
              className={`relative flex-1 flex flex-col items-center justify-center py-3 gap-0.5 transition-colors ${
                isActive ? 'text-content' : 'text-muted hover:text-content'
              }`}
            >
              <span className={`text-lg leading-none ${isActive ? 'opacity-100' : 'opacity-60'}`}>{icon}</span>
              <span className={`text-[10px] font-medium tracking-wide ${isActive ? 'text-content' : ''}`}>{label}</span>
              {isActive && <span className="absolute bottom-0 w-8 h-0.5 bg-green-500 rounded-full" />}
            </Link>
          )
        })}

        {/* More ⋯ — opens the overflow sheet */}
        <button
          onClick={() => setMoreOpen(o => !o)}
          className={`relative flex-1 flex flex-col items-center justify-center py-3 gap-0.5 transition-colors ${
            moreActive || moreOpen ? 'text-content' : 'text-muted hover:text-content'
          }`}
        >
          <span className={`text-lg leading-none ${moreActive || moreOpen ? 'opacity-100' : 'opacity-60'}`}>⋯</span>
          <span className={`text-[10px] font-medium tracking-wide ${moreActive || moreOpen ? 'text-content' : ''}`}>More</span>
          {moreActive && <span className="absolute bottom-0 w-8 h-0.5 bg-green-500 rounded-full" />}
        </button>
      </nav>
    </>
  )
}
