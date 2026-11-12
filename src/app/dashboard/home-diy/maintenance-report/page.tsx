import { createClient } from '@/lib/supabase/server'
import { formatDate as formatDateFull } from '@/lib/dates'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import { getCachedUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { EquipmentMaintenance, EquipmentServiceLog } from '@/lib/types'
import PrintButton from '@/app/dashboard/PrintButton'
import PrintFrame from '@/app/dashboard/PrintFrame'

const CATEGORY_LABELS: Record<string, string> = {
  tractor: 'Tractor', hvac: 'HVAC', well: 'Well / Water',
  vehicle: 'Vehicle', appliance: 'Appliance', tool: 'Tool',
  generator: 'Generator', other: 'Other',
}

function formatDate(dateStr: string | null) {
  return dateStr ? formatDateFull(dateStr) : '—'
}

export default async function MaintenanceReportPage({
  searchParams,
}: {
  searchParams: Promise<{ equipment?: string }>
}) {
  const supabase = await createClient()
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const scopedId = params.equipment ?? null

  const [{ data: equipment }, logs] = await Promise.all([
    supabase.from('equipment_maintenance').select('*').order('equipment_name', { ascending: true }),
    fetchAllRows<EquipmentServiceLog>((f, t) =>
      supabase.from('equipment_service_log').select('*').order('service_date', { ascending: false }).range(f, t)),
  ])

  const allEquipment = (equipment ?? []) as EquipmentMaintenance[]
  const scoped = scopedId ? allEquipment.filter(e => e.id === scopedId) : allEquipment
  const logsByEquipment: Record<string, EquipmentServiceLog[]> = {}
  for (const l of logs) (logsByEquipment[l.equipment_id] ??= []).push(l)

  const scopedName = scopedId ? allEquipment.find(e => e.id === scopedId)?.equipment_name : null
  const totalRecords = scoped.reduce((n, e) => n + (logsByEquipment[e.id]?.length ?? 0), 0)

  return (
    <div className="min-h-screen bg-surface text-content print:bg-white print:text-stone-900">
      <nav className="border-b border-line/60 px-6 py-4 flex items-center justify-between no-print">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/home-diy/equipment" className="text-subtle hover:text-content text-sm transition-colors">← Equipment</Link>
          <span className="text-subtle">/</span>
          <span className="text-sm font-semibold text-sky-600 dark:text-sky-400">Service history</span>
        </div>
        <PrintButton />
      </nav>

      <PrintFrame>
        <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
          {/* Print header */}
          <div className="hidden print:block mb-6 pb-4 border-b border-stone-300">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-bold text-stone-900">{scopedName ? `${scopedName} — Service History` : 'Equipment Service History'}</h1>
                <p className="text-sm text-subtle">mycultivate.app</p>
              </div>
              <p className="text-xs text-subtle">Generated {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            </div>
          </div>

          {/* Header + scope selector */}
          <div className="space-y-3">
            <div>
              <h2 className="text-xl font-bold mb-1">Service history</h2>
              <p className="text-muted text-sm">
                {scopedName
                  ? `Full maintenance record for ${scopedName} — print it for a buyer or your files.`
                  : 'A complete maintenance record for every piece of equipment.'}
              </p>
            </div>
            {allEquipment.length > 1 && (
              <div className="flex gap-2 flex-wrap no-print">
                <Link
                  href="/dashboard/home-diy/maintenance-report"
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${!scopedId ? 'bg-elevated text-content' : 'text-subtle hover:text-muted'}`}
                >
                  All equipment
                </Link>
                {allEquipment.map(e => (
                  <Link
                    key={e.id}
                    href={`/dashboard/home-diy/maintenance-report?equipment=${e.id}`}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${scopedId === e.id ? 'bg-elevated text-content' : 'text-subtle hover:text-muted'}`}
                  >
                    {e.equipment_name}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {totalRecords === 0 ? (
            <div className="text-center py-16 no-print">
              <div className="w-14 h-14 rounded-2xl bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center text-3xl mx-auto mb-4">🧾</div>
              <h3 className="text-lg font-semibold mb-2">No service history yet</h3>
              <p className="text-muted text-sm mb-6">Log a service on any equipment and it&apos;ll build a printable history here.</p>
              <Link href="/dashboard/home-diy/equipment" className="inline-block bg-sky-700 hover:bg-sky-600 text-white font-semibold px-6 py-3 rounded-xl transition-colors">
                Go to Equipment
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              {scoped.map(e => {
                const rows = logsByEquipment[e.id] ?? []
                return (
                  <div key={e.id} className="print-flow bg-card border border-line rounded-xl p-5 print:border-stone-300">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-base font-bold text-content">{e.equipment_name}</h3>
                        <p className="text-xs text-subtle mt-0.5">
                          {CATEGORY_LABELS[e.category] ?? e.category}
                          {e.location && ` · ${e.location}`}
                          {e.purchase_date && ` · purchased ${formatDate(e.purchase_date)}`}
                        </p>
                      </div>
                      <span className="text-xs text-subtle shrink-0">{rows.length} record{rows.length !== 1 ? 's' : ''}</span>
                    </div>

                    {rows.length === 0 ? (
                      <p className="text-sm text-subtle">No services logged yet.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs text-subtle uppercase tracking-wider border-b border-line/60">
                              <th className="py-1.5 pr-3 font-semibold">Date</th>
                              <th className="py-1.5 pr-3 font-semibold">Service</th>
                              <th className="py-1.5 pr-3 font-semibold">Hours</th>
                              <th className="py-1.5 font-semibold">Notes</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-line/50">
                            {rows.map(r => (
                              <tr key={r.id} className="align-top">
                                <td className="py-1.5 pr-3 whitespace-nowrap text-content">{formatDate(r.service_date)}</td>
                                <td className="py-1.5 pr-3 text-content">{r.service_name}</td>
                                <td className="py-1.5 pr-3 whitespace-nowrap text-subtle">{r.hours_at_service != null ? `${r.hours_at_service}` : '—'}</td>
                                <td className="py-1.5 text-muted">{r.notes || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {!scopedId && rows.length > 0 && (
                      <Link
                        href={`/dashboard/home-diy/maintenance-report?equipment=${e.id}`}
                        className="mt-3 inline-block text-xs text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 transition-colors no-print"
                      >
                        Print just this →
                      </Link>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </main>
      </PrintFrame>
    </div>
  )
}
