import { redirect } from 'next/navigation'

// See /dashboard/household. The equipment pages under /dashboard/home-diy/* are unchanged;
// only this hub moved.
export default function HomeDiyHubRedirect() {
  redirect('/dashboard/household')
}
