import { redirect } from 'next/navigation'

// The universal log is now the dashboard landing (/dashboard) — one capture box
// handles homeschool, homestead, and home/DIY. This legacy route redirects there
// directly (no longer hops through /dashboard/log).
export default function HomeschoolLogRedirect() {
  redirect('/dashboard')
}
