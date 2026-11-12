import { redirect } from 'next/navigation'

// The universal log now lives on the dashboard landing (/dashboard) itself —
// the capture box IS the front door (IA redesign Phase 1). This route is kept
// as a permanent redirect so existing links, bookmarks, and the PWA never break.
// The UniversalLogForm component still lives in this folder and is imported by
// the dashboard page; only this route entry redirects.
export default function LogRedirect() {
  redirect('/dashboard')
}
