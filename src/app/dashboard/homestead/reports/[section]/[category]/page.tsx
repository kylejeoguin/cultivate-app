import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/dates'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import { getCachedUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import PrintButton from '@/app/dashboard/PrintButton'
import PrintFrame from '@/app/dashboard/PrintFrame'
import type { HomesteadInput, LivestockLog, GardenEntry, PreservationLog } from '@/lib/types'
import { normalizeAnimalType } from '@/lib/homestead'
import { totalsByUnit } from '@/lib/units'


function formatMonth(key: string) {
  const [y, m] = key.split('-')
  return new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

const METHOD_LABELS: Record<string, string> = {
  canning: 'Canning', freezing: 'Freezing', dehydrating: 'Dehydrating',
  fermenting: 'Fermenting', other: 'Other',
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-elevated/60 rounded-lg p-3">
      <p className="text-xs text-subtle mb-1">{label}</p>
      <p className="text-lg font-bold text-content">{value}</p>
    </div>
  )
}

export default async function CategoryReportPage({
  params,
}: {
  params: Promise<{ section: string; category: string }>
}) {
  const { section, category: rawCategory } = await params
  const category = decodeURIComponent(rawCategory)
  // Display label: for livestock the URL carries the normalized key (lowercase/singular),
  // so present a cleanly-cased label; other sections use the stored name as-is.
  const categoryLabel = section === 'livestock' ? normalizeAnimalType(category).label : category

  const supabase = await createClient()
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const { data: inputsData } = await supabase
    .from('homestead_inputs')
    .select('*')
    .eq('section', section)
    .eq('category', category)
    .order('input_date', { ascending: true })

  const inputs = (inputsData ?? []) as HomesteadInput[]

  let livestockLogs: LivestockLog[] = []
  let gardenEntries: GardenEntry[] = []
  let preservationLogs: PreservationLog[] = []

  if (section === 'livestock') {
    // animal_type is free text with case/plural variants — match on the normalized key
    // so the drill-down shows every "Chicken"/"chicken"/"Chickens" row in one place.
    const target = normalizeAnimalType(category).key
    // Paginated — this pulls every livestock row then filters by animal type in JS,
    // so the 1000-row cap would otherwise hide a heavy producer's older entries.
    const data = await fetchAllRows<LivestockLog>((f, t) => supabase
      .from('livestock_logs')
      .select('*')
      .order('log_date', { ascending: true })
      .range(f, t))
    livestockLogs = data.filter(l => normalizeAnimalType(l.animal_type).key === target)
  } else if (section === 'garden') {
    const { data } = await supabase
      .from('garden_entries')
      .select('*')
      .eq('crop_name', category)
      .order('created_at', { ascending: true })
    gardenEntries = (data ?? []) as GardenEntry[]
  } else if (section === 'preservation') {
    const { data } = await supabase
      .from('preservation_logs')
      .select('*')
      .eq('item_name', category)
      .order('log_date', { ascending: true })
    preservationLogs = (data ?? []) as PreservationLog[]
  }

  const totalInputCost = inputs.reduce((sum, i) => sum + i.cost, 0)

  const costByItem: Record<string, number> = {}
  for (const input of inputs) {
    costByItem[input.item] = (costByItem[input.item] ?? 0) + input.cost
  }

  const monthlyCosts: Record<string, number> = {}
  for (const input of inputs) {
    const key = input.input_date.slice(0, 7)
    monthlyCosts[key] = (monthlyCosts[key] ?? 0) + input.cost
  }

  const salesLogs = livestockLogs.filter(l => l.disposition === 'sold' || l.disposition === 'mixed')
  const totalSaleRevenue = salesLogs.reduce((sum, l) => sum + (l.sale_amount ?? 0), 0)

  // Bucket by NORMALIZED unit so "Eggs"/"eggs" don't split one measure into two metrics.
  const productionByUnit = totalsByUnit(livestockLogs)

  const monthlyRevenue: Record<string, number> = {}
  for (const log of salesLogs) {
    const key = log.log_date.slice(0, 7)
    monthlyRevenue[key] = (monthlyRevenue[key] ?? 0) + (log.sale_amount ?? 0)
  }

  const netPL = totalSaleRevenue - totalInputCost
  const profitMargin = totalSaleRevenue > 0 ? (netPL / totalSaleRevenue) * 100 : null

  const allMonths = [...new Set([...Object.keys(monthlyCosts), ...Object.keys(monthlyRevenue)])].sort()

  const allDates = [
    ...inputs.map(i => i.input_date),
    ...livestockLogs.map(l => l.log_date),
    ...gardenEntries.map(g => g.created_at?.slice(0, 10)),
    ...preservationLogs.map(p => p.log_date),
  ].filter(Boolean).sort()
  const firstDate = allDates[0]
  const lastDate = allDates[allDates.length - 1]

  const harvestedCount = gardenEntries.filter(g => g.status === 'harvested').length
  const failedCount = gardenEntries.filter(g => g.status === 'failed').length
  const successRate = (harvestedCount + failedCount) > 0
    ? Math.round((harvestedCount / (harvestedCount + failedCount)) * 100)
    : null

  const totalPreservedQty = preservationLogs.reduce((sum, l) => sum + (l.quantity ?? 0), 0)
  const avgMonthlyCost = allMonths.length > 0 ? totalInputCost / allMonths.length : 0

  const hasAnyData = inputs.length > 0 || livestockLogs.length > 0 || gardenEntries.length > 0 || preservationLogs.length > 0

  const sectionLabel = section === 'livestock' ? 'Livestock' : section === 'garden' ? 'Garden' : 'Food Preservation'
  const sectionColor = section === 'livestock' ? 'text-amber-600 dark:text-amber-400' : section === 'garden' ? 'text-green-600 dark:text-green-400' : 'text-sky-600 dark:text-sky-400'

  return (
    <div className="min-h-screen bg-surface text-content print:bg-white print:text-stone-900">
      <nav className="border-b border-line/60 px-6 py-4 flex items-center justify-between no-print">
        <div className="flex items-center gap-3 text-sm">
          <Link href="/dashboard/homestead/reports" className="text-subtle hover:text-content transition-colors">← Reports</Link>
          <span className="text-subtle">/</span>
          <span className={`font-medium ${sectionColor}`}>{sectionLabel}</span>
          <span className="text-subtle">/</span>
          <span className="font-semibold">{categoryLabel}</span>
        </div>
        <PrintButton />
      </nav>

      <PrintFrame>
      <main className="max-w-2xl mx-auto px-6 py-8 space-y-8">
        {/* Print header */}
        <div className="hidden print:block mb-6 pb-4 border-b border-stone-300">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-stone-900">Cultivate — Homestead Report</h1>
              <p className="text-sm text-subtle">mycultivate.app</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-stone-900">{categoryLabel}</p>
              <p className="text-xs text-subtle">{sectionLabel}</p>
              <p className="text-xs text-subtle">Generated {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            </div>
          </div>
        </div>

        {/* Page header */}
        <div>
          <p className={`text-xs font-semibold uppercase tracking-widest mb-1 ${sectionColor}`}>{sectionLabel}</p>
          <h2 className="text-2xl font-bold tracking-tight">{categoryLabel}</h2>
          {firstDate && lastDate && (
            <p className="text-muted text-sm mt-1">
              {formatDate(firstDate)} – {formatDate(lastDate)}
            </p>
          )}
        </div>

        {!hasAnyData && (
          <div className="text-center py-20">
            <p className="text-subtle">No data logged for {categoryLabel} yet.</p>
            <Link href={`/dashboard/homestead/${section}`} className="text-green-600 dark:text-green-400 text-sm mt-2 block hover:underline">
              Start logging →
            </Link>
          </div>
        )}

        {hasAnyData && (
          <>
            {/* P&L Summary — livestock only */}
            {section === 'livestock' && (
              <div className="bg-card border border-line rounded-xl p-5 space-y-4">
                <p className="text-xs font-semibold text-subtle uppercase tracking-widest">Profit & Loss Summary</p>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-subtle mb-1">Revenue</p>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">${totalSaleRevenue.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-subtle mb-1">Total Costs</p>
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">${totalInputCost.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-subtle mb-1">Net P&L</p>
                    <p className={`text-2xl font-bold ${netPL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {netPL >= 0 ? '+' : ''}${netPL.toFixed(2)}
                    </p>
                  </div>
                </div>
                {profitMargin !== null && (
                  <div className="pt-3 border-t border-line flex items-center justify-between">
                    <span className="text-sm text-muted">Profit Margin</span>
                    <span className={`text-sm font-bold ${profitMargin >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {profitMargin.toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Cost summary — garden + preservation */}
            {section !== 'livestock' && totalInputCost > 0 && (
              <div className="bg-card border border-line rounded-xl p-5">
                <p className="text-xs font-semibold text-subtle uppercase tracking-widest mb-2">Total Input Costs</p>
                <p className="text-3xl font-bold text-red-600 dark:text-red-400">${totalInputCost.toFixed(2)}</p>
                <p className="text-xs text-subtle mt-1">Sales not tracked for this section</p>
              </div>
            )}

            {/* Income Statement */}
            {(inputs.length > 0 || (section === 'livestock' && salesLogs.length > 0)) && (
              <div className="bg-card border border-line rounded-xl p-5 space-y-4">
                <p className="text-xs font-semibold text-subtle uppercase tracking-widest">Income Statement</p>

                {section === 'livestock' && totalSaleRevenue > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted uppercase tracking-wider">Revenue</p>
                    <div className="flex items-center justify-between py-1">
                      <span className="text-sm text-content">Livestock Sales</span>
                      <span className="text-sm font-semibold text-green-600 dark:text-green-400">${totalSaleRevenue.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-t border-line">
                      <span className="text-sm font-semibold text-content">Total Revenue</span>
                      <span className="text-sm font-bold text-green-600 dark:text-green-400">${totalSaleRevenue.toFixed(2)}</span>
                    </div>
                  </div>
                )}

                {inputs.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted uppercase tracking-wider">Cost of Inputs</p>
                    {Object.entries(costByItem)
                      .sort((a, b) => b[1] - a[1])
                      .map(([item, cost]) => (
                        <div key={item} className="flex items-center justify-between py-0.5">
                          <span className="text-sm text-content">{item}</span>
                          <span className="text-sm text-red-600 dark:text-red-400">${cost.toFixed(2)}</span>
                        </div>
                      ))}
                    <div className="flex items-center justify-between py-1 border-t border-line">
                      <span className="text-sm font-semibold text-content">Total Input Costs</span>
                      <span className="text-sm font-bold text-red-600 dark:text-red-400">${totalInputCost.toFixed(2)}</span>
                    </div>
                  </div>
                )}

                {section === 'livestock' && (inputs.length > 0 || totalSaleRevenue > 0) && (
                  <div className={`flex items-center justify-between py-2 px-3 rounded-lg border ${netPL >= 0 ? 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-900/40' : 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900/40'}`}>
                    <span className="text-sm font-bold text-content">Net Profit / Loss</span>
                    <span className={`text-base font-bold ${netPL >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                      {netPL >= 0 ? '+' : ''}${netPL.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Key Metrics */}
            <div className="bg-card border border-line rounded-xl p-5 space-y-3">
              <p className="text-xs font-semibold text-subtle uppercase tracking-widest">Key Metrics</p>
              <div className="grid grid-cols-2 gap-3">
                {section === 'livestock' && (
                  <>
                    <MetricCard label="Total Logs" value={livestockLogs.length.toString()} />
                    {productionByUnit.map(({ key, label, total }) => (
                      <MetricCard key={key} label={`Total ${label.charAt(0).toUpperCase() + label.slice(1)}`} value={total.toLocaleString()} />
                    ))}
                    {productionByUnit.length === 1 && totalInputCost > 0 && (() => {
                      // `key` is already singular — "Cost / egg", not a regex-stripped guess.
                      const [{ key, total }] = productionByUnit
                      return <MetricCard label={`Cost / ${key}`} value={`$${(totalInputCost / total).toFixed(3)}`} />
                    })()}
                    {salesLogs.length > 0 && <MetricCard label="Sale Events" value={salesLogs.length.toString()} />}
                    {avgMonthlyCost > 0 && <MetricCard label="Avg Monthly Cost" value={`$${avgMonthlyCost.toFixed(2)}`} />}
                  </>
                )}
                {section === 'garden' && (
                  <>
                    <MetricCard label="Total Crops" value={gardenEntries.length.toString()} />
                    {harvestedCount > 0 && <MetricCard label="Harvested" value={harvestedCount.toString()} />}
                    {failedCount > 0 && <MetricCard label="Failed" value={failedCount.toString()} />}
                    {successRate !== null && <MetricCard label="Success Rate" value={`${successRate}%`} />}
                    {gardenEntries.length > 0 && totalInputCost > 0 && (
                      <MetricCard label="Avg Cost / Crop" value={`$${(totalInputCost / gardenEntries.length).toFixed(2)}`} />
                    )}
                    {avgMonthlyCost > 0 && <MetricCard label="Avg Monthly Cost" value={`$${avgMonthlyCost.toFixed(2)}`} />}
                  </>
                )}
                {section === 'preservation' && (
                  <>
                    <MetricCard label="Total Batches" value={preservationLogs.length.toString()} />
                    {totalPreservedQty > 0 && <MetricCard label="Total Quantity" value={totalPreservedQty.toLocaleString()} />}
                    {preservationLogs.length > 0 && totalInputCost > 0 && (
                      <MetricCard label="Avg Cost / Batch" value={`$${(totalInputCost / preservationLogs.length).toFixed(2)}`} />
                    )}
                    {avgMonthlyCost > 0 && <MetricCard label="Avg Monthly Cost" value={`$${avgMonthlyCost.toFixed(2)}`} />}
                  </>
                )}
              </div>
            </div>

            {/* Monthly Trend */}
            {allMonths.length > 0 && (
              <div className="bg-card border border-line rounded-xl p-5 space-y-3">
                <p className="text-xs font-semibold text-subtle uppercase tracking-widest">Month-by-Month</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-subtle border-b border-line">
                        <th className="text-left pb-2 font-medium">Month</th>
                        <th className="text-right pb-2 font-medium">Costs</th>
                        {section === 'livestock' && <th className="text-right pb-2 font-medium">Revenue</th>}
                        {section === 'livestock' && <th className="text-right pb-2 font-medium">Net</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {allMonths.map(month => {
                        const cost = monthlyCosts[month] ?? 0
                        const rev = monthlyRevenue[month] ?? 0
                        const net = rev - cost
                        return (
                          <tr key={month}>
                            <td className="py-2 text-content">{formatMonth(month)}</td>
                            <td className="py-2 text-right text-red-600 dark:text-red-400">{cost > 0 ? `$${cost.toFixed(2)}` : '—'}</td>
                            {section === 'livestock' && <td className="py-2 text-right text-green-600 dark:text-green-400">{rev > 0 ? `$${rev.toFixed(2)}` : '—'}</td>}
                            {section === 'livestock' && (
                              <td className={`py-2 text-right font-semibold ${net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {(cost > 0 || rev > 0) ? `${net >= 0 ? '+' : ''}$${net.toFixed(2)}` : '—'}
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot className="border-t border-line-strong">
                      <tr>
                        <td className="pt-2 text-xs font-semibold text-muted uppercase tracking-wider">Total</td>
                        <td className="pt-2 text-right font-bold text-red-600 dark:text-red-400">${totalInputCost.toFixed(2)}</td>
                        {section === 'livestock' && <td className="pt-2 text-right font-bold text-green-600 dark:text-green-400">${totalSaleRevenue.toFixed(2)}</td>}
                        {section === 'livestock' && (
                          <td className={`pt-2 text-right font-bold ${netPL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {netPL >= 0 ? '+' : ''}${netPL.toFixed(2)}
                          </td>
                        )}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Expense Ledger */}
            {inputs.length > 0 && (
              <div className="bg-card border border-line rounded-xl p-5 space-y-3">
                <p className="text-xs font-semibold text-subtle uppercase tracking-widest">Expense Ledger</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-subtle border-b border-line">
                        <th className="text-left pb-2 font-medium">Date</th>
                        <th className="text-left pb-2 font-medium">Item</th>
                        <th className="text-right pb-2 font-medium">Qty</th>
                        <th className="text-right pb-2 font-medium">Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {inputs.map(input => (
                        <tr key={input.id}>
                          <td className="py-2 text-muted text-xs">{formatDate(input.input_date)}</td>
                          <td className="py-2 text-content">
                            {input.item}
                            {input.notes && <span className="block text-xs text-subtle">{input.notes}</span>}
                          </td>
                          <td className="py-2 text-right text-muted text-xs">
                            {input.quantity != null ? `${input.quantity}${input.unit ? ' ' + input.unit : ''}` : '—'}
                          </td>
                          <td className="py-2 text-right font-semibold text-red-600 dark:text-red-400">${input.cost.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t border-line-strong">
                      <tr>
                        <td colSpan={3} className="pt-2 text-xs font-semibold text-muted uppercase tracking-wider">Total</td>
                        <td className="pt-2 text-right font-bold text-red-600 dark:text-red-400">${totalInputCost.toFixed(2)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Sales Ledger — livestock only */}
            {section === 'livestock' && salesLogs.length > 0 && (
              <div className="bg-card border border-line rounded-xl p-5 space-y-3">
                <p className="text-xs font-semibold text-subtle uppercase tracking-widest">Sales Ledger</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-subtle border-b border-line">
                        <th className="text-left pb-2 font-medium">Date</th>
                        <th className="text-left pb-2 font-medium">Animal</th>
                        <th className="text-right pb-2 font-medium">Qty Sold</th>
                        <th className="text-right pb-2 font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {salesLogs.map(log => (
                        <tr key={log.id}>
                          <td className="py-2 text-muted text-xs">{formatDate(log.log_date)}</td>
                          <td className="py-2 text-content">{log.animal_name ?? log.animal_type}</td>
                          <td className="py-2 text-right text-muted text-xs">
                            {log.sale_qty != null ? `${log.sale_qty}${log.unit ? ' ' + log.unit : ''}` : '—'}
                          </td>
                          <td className="py-2 text-right font-semibold text-green-600 dark:text-green-400">
                            {log.sale_amount != null ? `$${log.sale_amount.toFixed(2)}` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t border-line-strong">
                      <tr>
                        <td colSpan={3} className="pt-2 text-xs font-semibold text-muted uppercase tracking-wider">Total</td>
                        <td className="pt-2 text-right font-bold text-green-600 dark:text-green-400">${totalSaleRevenue.toFixed(2)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Production Log — livestock */}
            {section === 'livestock' && livestockLogs.length > 0 && (
              <div className="bg-card border border-line rounded-xl p-5 space-y-3">
                <p className="text-xs font-semibold text-subtle uppercase tracking-widest">Production Log</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-subtle border-b border-line">
                        <th className="text-left pb-2 font-medium">Date</th>
                        <th className="text-left pb-2 font-medium">Animal</th>
                        <th className="text-right pb-2 font-medium">Production</th>
                        <th className="text-right pb-2 font-medium">Disposition</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {livestockLogs.map(log => (
                        <tr key={log.id}>
                          <td className="py-2 text-muted text-xs">{formatDate(log.log_date)}</td>
                          <td className="py-2 text-content">{log.animal_name ?? log.animal_type}</td>
                          <td className="py-2 text-right text-content">
                            {log.quantity != null ? `${log.quantity} ${log.unit ?? ''}` : '—'}
                          </td>
                          <td className="py-2 text-right">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              log.disposition === 'sold' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' :
                              log.disposition === 'mixed' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' :
                              'text-muted bg-elevated/50'
                            }`}>
                              {log.disposition ?? 'personal'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Crop Log — garden */}
            {section === 'garden' && gardenEntries.length > 0 && (
              <div className="bg-card border border-line rounded-xl p-5 space-y-3">
                <p className="text-xs font-semibold text-subtle uppercase tracking-widest">Crop Log</p>
                <div className="space-y-3">
                  {gardenEntries.map(entry => (
                    <div key={entry.id} className="flex items-start justify-between py-2 border-b border-line last:border-0">
                      <div>
                        <span className="text-sm text-content">{entry.crop_name}</span>
                        {entry.variety && <span className="text-xs text-subtle ml-1.5">({entry.variety})</span>}
                        <div className="flex gap-3 mt-0.5 text-xs text-subtle">
                          {entry.date_planted && <span>Planted {formatDate(entry.date_planted)}</span>}
                          {entry.actual_harvest && <span>Harvested {formatDate(entry.actual_harvest)}</span>}
                        </div>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ml-3 ${
                        entry.status === 'harvested' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' :
                        entry.status === 'growing' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' :
                        entry.status === 'failed' ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' :
                        'text-muted bg-elevated/50'
                      }`}>
                        {entry.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Preservation Log */}
            {section === 'preservation' && preservationLogs.length > 0 && (
              <div className="bg-card border border-line rounded-xl p-5 space-y-3">
                <p className="text-xs font-semibold text-subtle uppercase tracking-widest">Preservation Log</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-subtle border-b border-line">
                        <th className="text-left pb-2 font-medium">Date</th>
                        <th className="text-left pb-2 font-medium">Method</th>
                        <th className="text-right pb-2 font-medium">Quantity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {preservationLogs.map(log => (
                        <tr key={log.id}>
                          <td className="py-2 text-muted text-xs">{formatDate(log.log_date)}</td>
                          <td className="py-2 text-content">{METHOD_LABELS[log.method] ?? log.method}</td>
                          <td className="py-2 text-right text-content">
                            {log.quantity != null ? `${log.quantity} ${log.unit ?? ''}` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>
      </PrintFrame>
    </div>
  )
}
