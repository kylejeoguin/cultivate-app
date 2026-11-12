import { createClient } from '@/lib/supabase/server'
import { formatDate as formatDateFull } from '@/lib/dates'
import { daysUntil } from '@/lib/dueDates'
import { getCachedUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { EquipmentMaintenance, EquipmentService } from '@/lib/types'
import EquipmentForm from './EquipmentForm'
import EquipmentActions from './EquipmentActions'
import ServicesManager from './ServicesManager'

const CATEGORY_LABELS: Record<string, string> = {
  tractor: 'Tractor',
  hvac: 'HVAC',
  well: 'Well / Water',
  vehicle: 'Vehicle',
  appliance: 'Appliance',
  tool: 'Tool',
  generator: 'Generator',
  other: 'Other',
}

function formatDate(dateStr: string | null) {
  return dateStr ? formatDateFull(dateStr) : null
}


export default async function EquipmentPage() {
  const supabase = await createClient()
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const [{ data: equipment }, { data: servicesData }] = await Promise.all([
    supabase.from('equipment_maintenance').select('*')
      .order('created_at', { ascending: false })
      .order('equipment_name', { ascending: true }),
    supabase.from('equipment_services').select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: true }),
  ])

  const equipmentList = (equipment ?? []) as EquipmentMaintenance[]
  const services = (servicesData ?? []) as EquipmentService[]
  const servicesByEquipment: Record<string, EquipmentService[]> = {}
  for (const s of services) (servicesByEquipment[s.equipment_id] ??= []).push(s)

  return (
    <div className="min-h-screen bg-surface text-content">
      <nav className="border-b border-line/60 px-6 py-4 flex items-center gap-3">
        <Link href="/dashboard/household" className="text-subtle hover:text-content text-sm transition-colors">← Household</Link>
        <span className="text-subtle">/</span>
        <h1 className="text-sm font-semibold text-sky-600 dark:text-sky-400">Equipment & Maintenance</h1>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold mb-1">Equipment Tracker</h2>
            <p className="text-muted text-sm">Log each machine once, then track every service — by time or engine hours.</p>
          </div>
          {equipmentList.length > 0 && (
            <Link href="/dashboard/home-diy/maintenance-report" className="shrink-0 text-xs font-medium text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 transition-colors">
              🧾 Service history →
            </Link>
          )}
        </div>

        <EquipmentForm />

        {equipmentList.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-subtle uppercase tracking-wider mb-3">Your Equipment</h3>
            <div className="space-y-3">
              {equipmentList.map(e => {
                const days = daysUntil(e.next_service_date)
                const status = !e.is_active ? 'inactive' : days === null ? 'none' : days < 0 ? 'overdue' : days <= 30 ? 'soon' : 'ok'

                return (
                  <div key={e.id} className={`bg-card border rounded-xl p-4 ${
                    status === 'overdue' ? 'border-red-200 dark:border-red-800/60' : status === 'soon' ? 'border-amber-200 dark:border-amber-800/50' : 'border-line'
                  }`}>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <span className="font-medium text-sm">{e.equipment_name}</span>
                        <span className="text-xs text-subtle ml-2">{CATEGORY_LABELS[e.category] ?? e.category}</span>
                        {e.location && <span className="text-xs text-subtle ml-1">· {e.location}</span>}
                        {!e.is_active && <span className="text-xs text-subtle ml-2">(inactive)</span>}
                      </div>
                      {status === 'overdue' && <span className="text-xs font-semibold shrink-0 bg-red-600 text-white px-2 py-0.5 rounded-full">{Math.abs(days ?? 0)}d overdue</span>}
                      {status === 'soon' && <span className="text-xs text-amber-600 dark:text-amber-400 shrink-0">Due in {days}d</span>}
                      {status === 'ok' && <span className="text-xs text-subtle shrink-0">{formatDate(e.next_service_date)}</span>}
                    </div>

                    <div className="flex flex-wrap gap-3 text-xs text-subtle">
                      {e.last_service_date && <span>Last service: {formatDate(e.last_service_date)}</span>}
                      {e.purchase_date && <span>Purchased: {formatDate(e.purchase_date)}</span>}
                    </div>

                    {e.service_notes && (
                      <p className="text-xs text-muted mt-1.5">{e.service_notes}</p>
                    )}

                    {e.is_active && <ServicesManager equipmentId={e.id} services={servicesByEquipment[e.id] ?? []} />}

                    <EquipmentActions equipment={e} />
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {equipmentList.length === 0 && (
          <div className="text-center py-12 text-subtle text-sm">
            No equipment added yet. Add your first item above.
          </div>
        )}
      </main>
    </div>
  )
}
