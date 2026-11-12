import { redirect } from 'next/navigation'

// Homestead and Home & DIY merged into Household (2026-09). The leaf routes under
// /dashboard/homestead/* still live here — only the section hub moved, so bookmarks
// and any link to the old hub land in the right place instead of 404-ing.
export default function HomesteadHubRedirect() {
  redirect('/dashboard/household')
}
