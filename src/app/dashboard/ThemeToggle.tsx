'use client'

import { useTheme } from '@/app/ThemeProvider'

// First token-driven UI in the app (theming Phase 0): renders correctly in both
// themes via the semantic tokens, so it doubles as a live test of the system.
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="inline-flex rounded-lg border border-line-strong bg-elevated p-0.5">
      {(['light', 'dark'] as const).map(t => {
        const active = theme === t
        return (
          <button
            key={t}
            onClick={() => setTheme(t)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              active ? 'bg-card text-content shadow-sm' : 'text-muted hover:text-content'
            }`}
            aria-pressed={active}
          >
            {t === 'light' ? '☀️ Light' : '🌙 Dark'}
          </button>
        )
      })}
    </div>
  )
}
