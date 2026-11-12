'use client'

import { useEffect, useState } from 'react'

/**
 * Time-of-day greeting computed in the user's local timezone.
 *
 * The dashboard is a server component rendered on Vercel (UTC), so computing the
 * greeting there gave everyone outside UTC the wrong one (e.g. "Good morning" at
 * 7pm Central). This renders a stable "Welcome" on the server / first paint, then
 * swaps to the correct local greeting on mount — hydration-safe.
 */
export default function Greeting() {
  const [greeting, setGreeting] = useState('Welcome')

  useEffect(() => {
    const h = new Date().getHours()
    setGreeting(h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening')
  }, [])

  return <h2 className="text-2xl font-bold mb-1 tracking-tight">{greeting}.</h2>
}
