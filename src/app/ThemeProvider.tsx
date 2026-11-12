'use client'

import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

interface ThemeContextValue {
  theme: Theme
  setTheme: (t: Theme) => void
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  setTheme: () => {},
  toggle: () => {},
})

const STORAGE_KEY = 'cultivate-theme'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Initial state mirrors the no-flash script default (light). The effect below
  // reconciles with whatever class that script actually applied to <html>.
  const [theme, setThemeState] = useState<Theme>('light')

  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark')
    setThemeState(isDark ? 'dark' : 'light')
  }, [])

  function apply(next: Theme) {
    document.documentElement.classList.toggle('dark', next === 'dark')
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* private mode / blocked */ }
    setThemeState(next)
  }

  return (
    <ThemeContext.Provider
      value={{ theme, setTheme: apply, toggle: () => apply(theme === 'dark' ? 'light' : 'dark') }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}

// Synchronous, runs in <head> before first paint to prevent a flash of the
// wrong theme. Defaults to LIGHT unless the user has explicitly chosen dark in
// Account settings — light is the default the product ships with; dark is opt-in.
// Deliberately does NOT read prefers-color-scheme: a device set to dark at night
// should not silently override the product default the user never chose.
export const THEME_NO_FLASH_SCRIPT = `
(function(){
  try {
    var t = localStorage.getItem('${STORAGE_KEY}');
    document.documentElement.classList.toggle('dark', t === 'dark');
  } catch (e) {
    document.documentElement.classList.remove('dark');
  }
})();
`
