import { createClient } from '@/lib/supabase/server'
import { formatDate as formatDateFull } from '@/lib/dates'
import { daysUntil } from '@/lib/dueDates'
import { getCachedUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { EquipmentMaintenance } from '@/lib/types'
import PrintButton from '@/app/dashboard/PrintButton'
import PrintFrame from '@/app/dashboard/PrintFrame'

const CATEGORY_LABELS: Record<string, string> = {
  tractor: 'Tractor', hvac: 'HVAC', well: 'Well / Water',
  vehicle: 'Vehicle', appliance: 'Appliance', tool: 'Tool',
  generator: 'Generator', other: 'Other',
}

function formatDate(dateStr: string | null) {
  return dateStr ? formatDateFull(dateStr) : null
}


type EquipmentStatus = 'overdue' | 'due_soon' | 'ok'

function getStatus(e: EquipmentMaintenance): EquipmentStatus {
  const days = daysUntil(e.next_service_date)
  if (days === null) return 'ok'
  if (days < 0) return 'overdue'
  if (days <= 30) return 'due_soon'
  return 'ok'
}

export default async function HomeDiyCategoryReportPage({
  params,
}: {
  params: Promise<{ category: string }>
}) {
  const { category } = await params
  const supabase = await createClient()
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const { data: equipmentData } = await supabase
    .from('equipment_maintenance')
    .select('*')
    .eq('category', category)
    .order('equipment_name', { ascending: true })

  const equipment = (equipmentData ?? []) as EquipmentMaintenance[]
  const activeEquipment = equipment.filter(e => e.is_active)
  const inactiveEquipment = equipment.filter(e => !e.is_active)

  const overdueList = activeEquipment.filter(e => getStatus(e) === 'overdue')
  const dueSoonList = activeEquipment.filter(e => getStatus(e) === 'due_soon')
  const okList = activeEquipment.filter(e => getStatus(e) === 'ok')

  // All equipment sorted: overdue → due soon → ok → inactive
  const sortedEquipment = [
    ...overdueList,
    ...dueSoonList,
    ...okList,
    ...inactiveEquipment,
  ]

  const categoryLabel = CATEGORY_LABELS[category] ?? category

  // Next upcoming service
  const nextService = activeEquipment
    .filter(e => e.next_service_date)
    .sort((a, b) => (a.next_service_date ?? '').localeCompare(b.next_service_date ?? ''))[0]

  // Most overdue
  const mostOverdue = overdueList.sort((a, b) => {
    const dA = daysUntil(a.next_service_date) ?? 0
    const dB = daysUntil(b.next_service_date) ?? 0
    return dA - dB
  })[0]

  return (
    <div className="min-h-screen bg-surface text-content print:bg-white print:text-stone-900">
      <nav className="border-b border-line/60 px-6 py-4 flex items-center justify-between no-print">
        <div className="flex items-center gap-3 text-sm">
          <Link href="/dashboard/home-diy/reports" className="text-subtle hover:text-content transition-colors">← Reports</Link>
          <span className="text-subtle">/</span>
          <span className="font-semibold text-sky-600 dark:text-sky-400">{categoryLabel}</span>
        </div>
        <PrintButton />
      </nav>

      <PrintFrame>
      <main className="max-w-2xl mx-auto px-6 py-8 space-y-8">
        {/* Print header */}
        <div className="hidden print:block mb-6 pb-4 border-b border-stone-300">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-stone-900">Cultivate — Home & DIY Report</h1>
              <p className="text-sm text-subtle">mycultivate.app</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-stone-900">{categoryLabel}</p>
              <p className="text-xs text-subtle">Generated {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            </div>
          </div>
        </div>

        {/* Page header */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-1 text-sky-600 dark:text-sky-400">Home & DIY</p>
          <h2 className="text-2xl font-bold tracking-tight">{categoryLabel}</h2>
          <p className="text-muted text-sm mt-1">
            {activeEquipment.length} active item{activeEquipment.length !== 1 ? 's' : ''}
            {inactiveEquipment.length > 0 && ` · ${inactiveEquipment.length} inactive`}
          </p>
        </div>

        {equipment.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-subtle text-sm">No {categoryLabel.toLowerCase()} tracked yet.</p>
            <Link href="/dashboard/home-diy/equipment" className="text-sky-600 dark:text-sky-400 text-sm mt-2 block hover:underline">
              Add equipment →
            </Link>
          </div>
        ) : (
          <>
            {/* Status summary */}
            <div className="bg-card border border-line rounded-xl p-5 space-y-4">
              <p className="text-xs font-semibold text-subtle uppercase tracking-widest">Status Overview</p>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-subtle mb-1">Overdue</p>
                  <p className={`text-2xl font-bold ${overdueList.length > 0 ? 'text-red-600 dark:text-red-400' : 'text-subtle'}`}>
                    {overdueList.length}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-subtle mb-1">Due Soon</p>
                  <p className={`text-2xl font-bold ${dueSoonList.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-subtle'}`}>
                    {dueSoonList.length}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-subtle mb-1">All Good</p>
                  <p className={`text-2xl font-bold ${okList.length > 0 ? 'text-green-600 dark:text-green-400' : 'text-subtle'}`}>
                    {okList.length}
                  </p>
                </div>
              </div>
              {nextService && overdueList.length === 0 && (
                <div className="pt-3 border-t border-line flex items-center justify-between">
                  <span className="text-sm text-muted">Next service due</span>
                  <span className="text-sm font-semibold text-content">{formatDate(nextService.next_service_date)}</span>
                </div>
              )}
              {mostOverdue && (
                <div className="pt-3 border-t border-line flex items-center justify-between">
                  <span className="text-sm text-muted">Most overdue</span>
                  <span className="text-sm font-semibold text-red-600 dark:text-red-400">{mostOverdue.equipment_name}</span>
                </div>
              )}
            </div>

            {/* Key metrics */}
            <div className="bg-card border border-line rounded-xl p-5 space-y-3">
              <p className="text-xs font-semibold text-subtle uppercase tracking-widest">Key Metrics</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-elevated/60 rounded-lg p-3">
                  <p className="text-xs text-subtle mb-1">Total Items</p>
                  <p className="text-lg font-bold text-content">{equipment.length}</p>
                </div>
                <div className="bg-elevated/60 rounded-lg p-3">
                  <p className="text-xs text-subtle mb-1">Active</p>
                  <p className="text-lg font-bold text-content">{activeEquipment.length}</p>
                </div>
                {activeEquipment.filter(e => e.service_interval_days).length > 0 && (
                  <div className="bg-elevated/60 rounded-lg p-3">
                    <p className="text-xs text-subtle mb-1">On Schedule</p>
                    <p className="text-lg font-bold text-content">
                      {activeEquipment.filter(e => e.service_interval_days).length}
                    </p>
                  </div>
                )}
                {activeEquipment.filter(e => !e.service_interval_days).length > 0 && (
                  <div className="bg-elevated/60 rounded-lg p-3">
                    <p className="text-xs text-subtle mb-1">No Interval Set</p>
                    <p className="text-lg font-bold text-amber-600 dark:text-amber-400">
                      {activeEquipment.filter(e => !e.service_interval_days).length}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* All equipment */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-subtle uppercase tracking-widest">All {categoryLabel}</p>
              {sortedEquipment.map(e => {
                const status = e.is_active ? getStatus(e) : 'inactive'
                const days = daysUntil(e.next_service_date)

                const borderClass =
                  status === 'overdue' ? 'border-red-200 dark:border-red-800/60' :
                  status === 'due_soon' ? 'border-amber-200 dark:border-amber-800/50' :
                  !e.is_active ? 'border-line/40 opacity-50' :
                  'border-line'

                const badgeEl = !e.is_active ? (
                  <span className="text-xs text-subtle bg-elevated/60 px-2 py-0.5 rounded-full">Inactive</span>
                ) : status === 'overdue' ? (
                  <span className="text-xs font-semibold bg-red-600 text-white px-2 py-0.5 rounded-full">
                    {Math.abs(days ?? 0)}d overdue
                  </span>
                ) : status === 'due_soon' ? (
                  <span className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 rounded-full">
                    {days === 0 ? 'Due today' : `Due in ${days}d`}
                  </span>
                ) : e.next_service_date ? (
                  <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 px-2 py-0.5 rounded-full">OK</span>
                ) : (
                  <span className="text-xs text-subtle bg-elevated/60 px-2 py-0.5 rounded-full">No date set</span>
                )

                return (
                  <div key={e.id} className={`bg-card border ${borderClass} rounded-xl p-4`}>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <span className="font-medium text-sm">{e.equipment_name}</span>
                        {e.location && <span className="text-xs text-subtle ml-2">· {e.location}</span>}
                      </div>
                      {badgeEl}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-subtle">
                      <span>Last service: {formatDate(e.last_service_date) ?? 'Never serviced'}</span>
                      <span>Next: {formatDate(e.next_service_date) ?? 'Not set'}</span>
                      {e.service_interval_days && <span>Interval: every {e.service_interval_days}d</span>}
                    </div>
                    {e.service_notes && (
                      <p className="text-xs text-muted mt-2">{e.service_notes}</p>
                    )}
                  </div>
                )
              })}
            </div>

            <Link
              href="/dashboard/home-diy/equipment"
              className="block bg-card border border-line hover:border-sky-800 rounded-xl p-4 text-center transition-colors group"
            >
              <p className="text-muted text-sm group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">Manage Equipment & Maintenance →</p>
            </Link>
          </>
        )}
      </main>
      </PrintFrame>
    </div>
  )
}
