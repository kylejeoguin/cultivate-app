import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import AttendanceClient from './AttendanceClient'
import type { Child, Attendance, SchoolYear } from '@/lib/types'

export default async function AttendancePage() {
  const supabase = await createClient()
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const { data: children } = await supabase
    .from('children')
    .select('*')
    .order('created_at')

  if (!children || children.length === 0) redirect('/dashboard/homeschool/setup')

  const { data: attendance } = await supabase
    .from('attendance')
    .select('*')
    .order('attendance_date', { ascending: false })

  const { data: activeYears } = await supabase
    .from('school_years')
    .select('*')
    .eq('is_active', true)

  return (
    <AttendanceClient
      childList={children as Child[]}
      attendance={(attendance ?? []) as Attendance[]}
      activeYears={(activeYears ?? []) as SchoolYear[]}
    />
  )
}
