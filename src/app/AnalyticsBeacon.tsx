'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

// Fire-and-forget first-party analytics beacon. Two distinct event types:
//
//   'visit'    — the LANDING: the first page of a session (a full page load / arrival from an
//                external link). Semantics unchanged from the original beacon, so every existing
//                query and past analysis of `visit` rows stays valid.
//   'pageview' — an in-app CLIENT-SIDE route change (Next soft nav).
//
// WHY 'pageview' exists (added 2026-08-02): the root layout does NOT remount on client
// navigations, so the original effect only ever fired once per full load. That made soft
// navigations invisible — most importantly `/ -> /signup`, which had 3 recorded hits ever
// despite users demonstrably reaching it. The funnel was blind at the conversion step.
// See memory `project_cultivate_first_organic_signup`.
//
// Both types are deduped per (path + query) per browser session, so a refresh or a
// back-and-forth doesn't inflate counts — one row per unique page per session.
//
// ⚠️ Deliberately does NOT use `useSearchParams()`. In a prerendered route that hook forces
// client-side rendering up to the nearest Suspense boundary, which would de-optimize the 51
// statically-generated /state-requirements pages — the exact pages we need server-rendered and
// indexable. `usePathname()` carries no such penalty, and the query string is read straight off
// `window.location` inside the effect.
//
// Captures attribution only (source/UTM + referrer host). No identity. See /api/track + the
// public.events migration for the full privacy note.

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const

function sessionId(): string {
  try {
    const KEY = 'cv_sid'
    let id = sessionStorage.getItem(KEY)
    if (!id) {
      id = (crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`)
      sessionStorage.setItem(KEY, id)
    }
    return id
  } catch {
    return ''
  }
}

export default function AnalyticsBeacon() {
  const routePath = usePathname()

  // First effect run in this mount = the landing. Every later run is a soft navigation.
  const isFirstRunRef = useRef(true)
  // Guards React StrictMode's double-invocation of effects (and any same-key re-run) from
  // inserting a duplicate row before sessionStorage has been consulted.
  const lastKeyRef = useRef<string | null>(null)

  useEffect(() => {
    try {
      const { pathname, search } = window.location
      const params = new URLSearchParams(search)

      const isLanding = isFirstRunRef.current
      isFirstRunRef.current = false

      const key = `${pathname}${search}`
      if (lastKeyRef.current === key) return
      lastKeyRef.current = key

      // Dedupe: one event per unique page (path + query) per browser session.
      const dedupeKey = `cv_seen:${key}`
      try {
        if (sessionStorage.getItem(dedupeKey)) return
        sessionStorage.setItem(dedupeKey, '1')
      } catch {
        // sessionStorage blocked (private mode edge cases) — proceed without dedupe
      }

      let referrer_host: string | null = null
      try {
        if (document.referrer) referrer_host = new URL(document.referrer).hostname
      } catch { /* opaque referrer */ }

      const utm: Record<string, string | null> = {}
      for (const k of UTM_KEYS) utm[k] = params.get(k)

      const payload = {
        event_type: isLanding ? 'visit' : 'pageview',
        session_id: sessionId(),
        path: pathname,
        source: params.get('source'),
        ...utm,
        query: search ? search.slice(1) : null, // raw query string (insurance for unparsed params)
        referrer_host,
      }

      // Tier-2 hook: remember the FIRST attributed touch this browser ever had, so a later
      // signup can be credited to the link that originally brought them in. Captured now
      // (free); the signup-side stitching is a deliberate later step.
      try {
        const hasAttribution = payload.source || UTM_KEYS.some((k) => utm[k])
        if (hasAttribution && !localStorage.getItem('cv_first_touch')) {
          localStorage.setItem(
            'cv_first_touch',
            JSON.stringify({
              source: payload.source,
              ...utm,
              path: pathname,
              at: new Date().toISOString(),
            })
          )
        }
      } catch { /* localStorage blocked — skip the hook */ }

      const json = JSON.stringify(payload)
      const sent = navigator.sendBeacon?.(
        '/api/track',
        new Blob([json], { type: 'application/json' })
      )
      if (!sent) {
        // Fallback for browsers without sendBeacon (or if it refused the payload)
        fetch('/api/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: json,
          keepalive: true,
        }).catch(() => {})
      }
    } catch {
      // A tracking failure must never affect the page.
    }
    // Re-runs on every client-side route change, which is the whole point of the fix.
  }, [routePath])

  return null
}
