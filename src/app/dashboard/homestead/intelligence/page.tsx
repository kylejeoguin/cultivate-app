import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import { getCachedUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { LivestockLog, GardenEntry, PreservationLog, HomesteadInput } from '@/lib/types'
import { normalizeAnimalType } from '@/lib/homestead'
import { totalsByUnit } from '@/lib/units'
import { saleRevenue, homesteadRevenue } from '@/lib/revenue'
import PrintButton from '@/app/dashboard/PrintButton'
import PrintFrame from '@/app/dashboard/PrintFrame'

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const METHOD_LABELS: Record<string, string> = {
  canning: 'Canning', freezing: 'Freezing', dehydrating: 'Dehydrating',
  fermenting: 'Fermenting', other: 'Other',
}

function getMonthKey(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function getMonthLabel(key: string) {
  const [, month] = key.split('-')
  return MONTH_LABELS[parseInt(month) - 1]
}

// Signal: green = profitable/efficient, yellow = neutral/unknown, red = costs exceed value
type Signal = 'green' | 'yellow' | 'red'
function getSignal(revenue: number, cost: number, hasFinancialData: boolean): Signal {
  if (!hasFinancialData) return 'yellow'
  if (revenue === 0 && cost === 0) return 'yellow'
  if (revenue === 0 && cost > 0) return 'yellow' // consuming without selling isn't bad
  const net = revenue - cost
  if (net > 0) return 'green'
  if (net > -cost * 0.2) return 'yellow' // within 20% of breaking even
  return 'red'
}

const SIGNAL_STYLES: Record<Signal, string> = {
  green: 'text-green-800 dark:text-green-400 bg-green-100 dark:bg-green-950/40 border-green-200 dark:border-green-900/60',
  yellow: 'text-amber-800 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60',
  red: 'text-red-800 dark:text-red-400 bg-red-100 dark:bg-red-950/40 border-red-200 dark:border-red-900/60',
}
const SIGNAL_LABELS: Record<Signal, string> = {
  green: 'Profitable',
  yellow: 'Break even',
  red: 'High cost',
}

export default async function HomesteadIntelligencePage() {
  const supabase = await createClient()
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const now = new Date()
  const currentYear = now.getFullYear()
  const prevYear = currentYear - 1
  const currentYearStart = `${currentYear}-01-01`
  const prevYearStart = `${prevYear}-01-01`
  const prevYearEnd = `${prevYear}-12-31`

  // Last 12 months for the activity chart
  const twelveMonthsAgo = new Date(now)
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11)
  twelveMonthsAgo.setDate(1)
  const twelveMonthsAgoStr = twelveMonthsAgo.toISOString().split('T')[0]

  const [
    livestock,
    preservation,
    garden,
    inputs,
  ] = await Promise.all([
    // Paginated — yearly cost/yield totals must not drop rows past the 1000-row cap.
    fetchAllRows<LivestockLog>((f, t) => supabase.from('livestock_logs').select('*').order('log_date', { ascending: false }).range(f, t)),
    fetchAllRows<PreservationLog>((f, t) => supabase.from('preservation_logs').select('*').order('log_date', { ascending: false }).range(f, t)),
    fetchAllRows<GardenEntry>((f, t) => supabase.from('garden_entries').select('*').order('created_at', { ascending: false }).range(f, t)),
    fetchAllRows<HomesteadInput>((f, t) => supabase.from('homestead_inputs').select('*').order('input_date', { ascending: false }).range(f, t)),
  ])

  const hasAnyData = livestock.length > 0 || preservation.length > 0 || garden.length > 0

  // ── Year filters ──────────────────────────────────────────────────────────
  const currentYearLivestock = livestock.filter(l => l.log_date >= currentYearStart)
  const prevYearLivestock = livestock.filter(l => l.log_date >= prevYearStart && l.log_date <= prevYearEnd)
  const currentYearPreservation = preservation.filter(p => p.log_date >= currentYearStart)
  const prevYearPreservation = preservation.filter(p => p.log_date >= prevYearStart && p.log_date <= prevYearEnd)
  const currentYearInputs = inputs.filter(i => i.input_date >= currentYearStart)
  const prevYearInputs = inputs.filter(i => i.input_date >= prevYearStart && i.input_date <= prevYearEnd)
  // A garden sale is dated by when the crop was PICKED (actual_harvest), not when it was
  // planted or when the row happened to be created — a crop planted last fall and sold this
  // spring is this year's revenue. Rows with no harvest date can't be sold (DB enforces it).
  const currentYearGarden = garden.filter(g => g.actual_harvest != null && g.actual_harvest >= currentYearStart)
  const hasYoYData = prevYearLivestock.length > 0 || prevYearPreservation.length > 0

  // ── Monthly activity (last 12 months) ─────────────────────────────────────
  const recentLivestock = livestock.filter(l => l.log_date >= twelveMonthsAgoStr)
  const recentPreservation = preservation.filter(p => p.log_date >= twelveMonthsAgoStr)

  // Build 12-month key array
  const monthKeys: string[] = []
  for (let i = 11; i >= 0; i--) {
    // Construct from (year, month-i, 1) so stepping back past a longer month
    // can't day-overflow — e.g. from the 30th into Feb (28d) rolled to Mar,
    // which produced a duplicate "Mar" and a missing "Feb" on the axis.
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const activityByMonth: Record<string, { livestock: number; preservation: number }> = {}
  for (const key of monthKeys) activityByMonth[key] = { livestock: 0, preservation: 0 }
  for (const l of recentLivestock) {
    const key = getMonthKey(l.log_date)
    if (activityByMonth[key]) activityByMonth[key].livestock++
  }
  for (const p of recentPreservation) {
    const key = getMonthKey(p.log_date)
    if (activityByMonth[key]) activityByMonth[key].preservation++
  }
  const maxActivity = Math.max(...Object.values(activityByMonth).map(m => m.livestock + m.preservation), 1)

  // ── Top-line this year ────────────────────────────────────────────────────
  // Every source that can earn: livestock, produce, and preserved goods. Net P&L compares this
  // against ALL homestead inputs (livestock + garden + preservation), so leaving any revenue
  // stream out understated the net by exactly what the family earned at the farmstand.
  const yearSalesRevenue = homesteadRevenue({
    livestock: currentYearLivestock,
    garden: currentYearGarden,
    preservation: currentYearPreservation,
  })
  const yearInputCost = currentYearInputs.reduce((sum, i) => sum + i.cost, 0)
  const yearNetPL = yearSalesRevenue - yearInputCost
  const yearLivestockLogs = currentYearLivestock.length
  const yearPreservationBatches = currentYearPreservation.length

  // ── Livestock by animal type ──────────────────────────────────────────────
  // Group by a normalized animal key so "Chicken"/"chicken"/"Chickens" share one card.
  const animalKeys = [...new Set(livestock.map(l => normalizeAnimalType(l.animal_type).key).filter(Boolean))]

  // Livestock costs the user logged but never attributed to an animal. If any exist, a $0
  // per-animal cost means "we don't know," not "it was free" — so we must not paint that
  // animal green off revenue alone. Tag it instead and point at the fix.
  const unattributedLivestockCost = currentYearInputs
    .filter(i => i.section === 'livestock' && !normalizeAnimalType(i.animal_type).key)
    .reduce((sum, i) => sum + i.cost, 0)

  const animalStats = animalKeys.map(key => {
    const matchesKey = (l: { animal_type: string | null }) => normalizeAnimalType(l.animal_type).key === key
    const label = normalizeAnimalType(livestock.find(matchesKey)?.animal_type).label
    const logs = currentYearLivestock.filter(matchesKey)
    const allTimeLogs = livestock.filter(matchesKey)

    // Production by NORMALIZED unit (sorted largest-first), so "Eggs"/"eggs" are one bucket
    // and the year-over-year lookup below can match on a stable key rather than a spelling.
    const prodByUnit = totalsByUnit(logs)

    const salesRevenue = saleRevenue(logs)

    // Input costs — attributed by the explicit homestead_inputs.animal_type link, normalized
    // on both sides so "Chicken"/"chickens" attribute together. This replaced a substring
    // match of the animal name against the input's CATEGORY, which never fired in practice
    // (real inputs are categorized "feed"/"supplies", not "chicken feed") and left every
    // per-animal cost and profit signal silently at zero. An unattributed cost now stays
    // out of the per-animal math instead of being guessed at.
    const typeInputs = currentYearInputs.filter(i =>
      i.section === 'livestock' && normalizeAnimalType(i.animal_type).key === key
    )
    const inputCost = typeInputs.reduce((sum, i) => sum + i.cost, 0)

    // Cost per unit (primary unit only) — totalsByUnit already sorts largest-first.
    const primaryUnit = prodByUnit[0]
    const costPerUnit = primaryUnit && inputCost > 0
      ? inputCost / primaryUnit.total
      : null

    // Prev year comparison, indexed by the same normalized key as this year's buckets.
    const prevLogs = prevYearLivestock.filter(matchesKey)
    const prevProdByUnit: Record<string, number> = {}
    for (const p of totalsByUnit(prevLogs)) prevProdByUnit[p.key] = p.total

    // Zero attributed cost while unattributed livestock costs exist = unknown, not free.
    const costsUnattributed = inputCost === 0 && unattributedLivestockCost > 0
    const signal = costsUnattributed ? 'yellow' : getSignal(salesRevenue, inputCost, salesRevenue > 0 || inputCost > 0)

    return {
      type: label,
      logs: logs.length,
      allTimeLogs: allTimeLogs.length,
      prodByUnit,
      prevProdByUnit,
      salesRevenue,
      inputCost,
      costPerUnit,
      primaryUnit,
      signal,
      costsUnattributed,
      signalLabel: costsUnattributed ? 'Costs unattributed' : SIGNAL_LABELS[signal],
    }
  }).sort((a, b) => b.logs - a.logs)

  // ── Garden intelligence ───────────────────────────────────────────────────
  const harvestedCrops = garden.filter(g => g.status === 'harvested')
  const failedCrops = garden.filter(g => g.status === 'failed')
  const growingCrops = garden.filter(g => g.status === 'planted' || g.status === 'growing')
  const totalDecisive = harvestedCrops.length + failedCrops.length
  const successRate = totalDecisive > 0 ? Math.round((harvestedCrops.length / totalDecisive) * 100) : null

  // Best performing crops (harvested most often)
  const cropCounts: Record<string, { harvested: number; failed: number }> = {}
  for (const g of garden) {
    if (!cropCounts[g.crop_name]) cropCounts[g.crop_name] = { harvested: 0, failed: 0 }
    if (g.status === 'harvested') cropCounts[g.crop_name].harvested++
    if (g.status === 'failed') cropCounts[g.crop_name].failed++
  }
  const cropPerformance = Object.entries(cropCounts)
    .map(([name, counts]) => ({ name, ...counts, total: counts.harvested + counts.failed }))
    .filter(c => c.total > 0)
    .sort((a, b) => (b.harvested / Math.max(b.total, 1)) - (a.harvested / Math.max(a.total, 1)))

  const gardenInputCost = currentYearInputs.filter(i => i.section === 'garden').reduce((sum, i) => sum + i.cost, 0)

  // ── Preservation intelligence ─────────────────────────────────────────────
  const preservationByMethod: Record<string, number> = {}
  for (const p of currentYearPreservation) {
    preservationByMethod[p.method] = (preservationByMethod[p.method] ?? 0) + 1
  }

  const preservationByItem: Record<string, number> = {}
  for (const p of currentYearPreservation) {
    preservationByItem[p.item_name] = (preservationByItem[p.item_name] ?? 0) + 1
  }
  const topPreservedItems = Object.entries(preservationByItem)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)

  // Prev year preservation count
  const prevYearBatches = prevYearPreservation.length
  const preservationInputCost = currentYearInputs.filter(i => i.section === 'preservation').reduce((sum, i) => sum + i.cost, 0)

  return (
    <div className="min-h-screen bg-surface text-content">
      <nav className="border-b border-line/60 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/household" className="text-subtle hover:text-content text-sm transition-colors">← Household</Link>
          <span className="text-subtle">/</span>
          <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">Business Intelligence</span>
        </div>
        <PrintButton />
      </nav>

      <PrintFrame>
      <main className="max-w-2xl lg:max-w-4xl mx-auto px-6 py-8 space-y-8">

        <div>
          <h2 className="text-xl font-bold mb-1">Homestead Intelligence</h2>
          <p className="text-muted text-sm">
            {currentYear}{' '}overview — patterns, costs, and what&apos;s worth doing again.
          </p>
        </div>

        {!hasAnyData ? (
          <div className="text-center py-20">
            <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-3xl mx-auto mb-4">📊</div>
            <p className="text-content font-semibold mb-1">No data yet</p>
            <p className="text-subtle text-sm max-w-xs mx-auto">
              Start logging your homestead activity to see patterns and insights here.
            </p>
            <Link href="/dashboard" className="inline-block mt-6 text-sm text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors">
              Log today →
            </Link>
          </div>
        ) : (
          <>

            {/* ── This Year at a Glance ── */}
            <section className="space-y-3">
              <p className="text-xs font-semibold text-subtle uppercase tracking-widest">{currentYear} at a glance</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-card border border-line rounded-xl p-4">
                  <p className="text-xs text-subtle mb-1">Livestock logs</p>
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{yearLivestockLogs}</p>
                  {hasYoYData && prevYearLivestock.length > 0 && (
                    <p className="text-xs text-subtle mt-1">
                      {prevYearLivestock.length} in {prevYear}
                      {yearLivestockLogs > prevYearLivestock.length
                        ? <span className="text-green-500 ml-1">↑ {yearLivestockLogs - prevYearLivestock.length}</span>
                        : yearLivestockLogs < prevYearLivestock.length
                          ? <span className="text-red-500 ml-1">↓ {prevYearLivestock.length - yearLivestockLogs}</span>
                          : <span className="text-subtle ml-1">same</span>
                      }
                    </p>
                  )}
                </div>
                <div className="bg-card border border-line rounded-xl p-4">
                  <p className="text-xs text-subtle mb-1">Preservation batches</p>
                  <p className="text-2xl font-bold text-sky-600 dark:text-sky-400">{yearPreservationBatches}</p>
                  {hasYoYData && prevYearBatches > 0 && (
                    <p className="text-xs text-subtle mt-1">
                      {prevYearBatches} in {prevYear}
                      {yearPreservationBatches > prevYearBatches
                        ? <span className="text-green-500 ml-1">↑ {yearPreservationBatches - prevYearBatches}</span>
                        : yearPreservationBatches < prevYearBatches
                          ? <span className="text-red-500 ml-1">↓ {prevYearBatches - yearPreservationBatches}</span>
                          : <span className="text-subtle ml-1">same</span>
                      }
                    </p>
                  )}
                </div>
                {yearSalesRevenue > 0 && (
                  <div className="bg-card border border-line rounded-xl p-4">
                    <p className="text-xs text-subtle mb-1">Sales revenue</p>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">${yearSalesRevenue.toFixed(2)}</p>
                  </div>
                )}
                {yearInputCost > 0 && (
                  <div className="bg-card border border-line rounded-xl p-4">
                    <p className="text-xs text-subtle mb-1">Input costs</p>
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">${yearInputCost.toFixed(2)}</p>
                  </div>
                )}
                {(yearSalesRevenue > 0 || yearInputCost > 0) && (
                  <div className={`bg-card border rounded-xl p-4 col-span-2 ${yearNetPL >= 0 ? 'border-green-200 dark:border-green-900/60' : 'border-red-200 dark:border-red-900/60'}`}>
                    <p className="text-xs text-subtle mb-1">Net {currentYear}</p>
                    <p className={`text-2xl font-bold ${yearNetPL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {yearNetPL >= 0 ? '+' : ''}${yearNetPL.toFixed(2)}
                    </p>
                    <p className="text-xs text-subtle mt-1">sales revenue minus all input costs</p>
                  </div>
                )}
              </div>
            </section>

            {/* ── Monthly Activity Chart ── */}
            {maxActivity > 0 && (
              <section className="space-y-3">
                <p className="text-xs font-semibold text-subtle uppercase tracking-widest">Activity — last 12 months</p>
                <div className="bg-card border border-line rounded-xl p-5">
                  <div className="flex items-end gap-1.5 h-24">
                    {monthKeys.map(key => {
                      const data = activityByMonth[key]
                      const total = data.livestock + data.preservation
                      const heightPct = Math.round((total / maxActivity) * 100)
                      const isCurrentMonth = key === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
                      return (
                        <div key={key} className="flex-1 flex flex-col items-center gap-1">
                          <div className="w-full flex flex-col justify-end" style={{ height: '80px' }}>
                            {total > 0 ? (
                              <div
                                className={`w-full rounded-sm ${isCurrentMonth ? 'bg-amber-500' : 'bg-amber-800/70'} transition-all`}
                                style={{ height: `${Math.max(heightPct, 8)}%` }}
                                title={`${total} log${total !== 1 ? 's' : ''}`}
                              />
                            ) : (
                              <div className="w-full rounded-sm bg-elevated/40" style={{ height: '4px' }} />
                            )}
                          </div>
                          <span className={`text-xs ${isCurrentMonth ? 'text-amber-600 dark:text-amber-400' : 'text-subtle'}`}>
                            {getMonthLabel(key)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex items-center gap-4 mt-3 pt-3 border-t border-line">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-sm bg-amber-800/70" />
                      <span className="text-xs text-subtle">Livestock</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-sm bg-amber-800/70" />
                      <span className="text-xs text-subtle">+ Preservation</span>
                    </div>
                    <span className="text-xs text-subtle ml-auto">bars = combined log count</span>
                  </div>
                </div>
              </section>
            )}

            {/* ── Livestock Intelligence ── */}
            {animalStats.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-subtle uppercase tracking-widest">Livestock — by animal</p>
                  <Link href="/dashboard/homestead/livestock" className="text-xs text-subtle hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
                    Manage →
                  </Link>
                </div>

                <div className="space-y-3">
                  {animalStats.map(animal => (
                    <div key={animal.type} className="bg-card border border-line rounded-xl p-4 space-y-3">

                      {/* Header row */}
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-sm text-content capitalize">{animal.type}</span>
                          <span className="text-xs text-subtle ml-2">{animal.logs} log{animal.logs !== 1 ? 's' : ''} this year</span>
                        </div>
                        {(animal.salesRevenue > 0 || animal.inputCost > 0 || animal.costsUnattributed) && (
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${SIGNAL_STYLES[animal.signal]}`}>
                            {animal.signalLabel}
                          </span>
                        )}
                      </div>

                      {animal.costsUnattributed && (
                        <p className="text-xs text-muted">
                          {`No costs are attributed to ${animal.type.toLowerCase()} yet, so profit can’t be calculated. `}
                          Tag a cost to an animal under{' '}
                          <Link href="/dashboard/homestead/livestock#inputs" className="text-amber-700 dark:text-amber-400 hover:underline">
                            Livestock → Inputs &amp; Costs
                          </Link>.
                        </p>
                      )}

                      {/* Production this year */}
                      {animal.prodByUnit.length > 0 && (
                        <div className="flex flex-wrap gap-4">
                          {animal.prodByUnit.map(({ key: unitKey, label: unit, total: qty }) => {
                            const prevQty = animal.prevProdByUnit[unitKey]
                            return (
                              <div key={unitKey}>
                                <p className="text-xs text-subtle mb-0.5">Total {unit}</p>
                                <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{qty.toLocaleString()}</p>
                                {hasYoYData && prevQty != null && (
                                  <p className="text-xs text-subtle">
                                    {prevQty.toLocaleString()} in {prevYear}
                                    {qty > prevQty
                                      ? <span className="text-green-500 ml-1">↑ {(((qty - prevQty) / prevQty) * 100).toFixed(0)}%</span>
                                      : qty < prevQty
                                        ? <span className="text-red-500 ml-1">↓ {(((prevQty - qty) / prevQty) * 100).toFixed(0)}%</span>
                                        : null
                                    }
                                  </p>
                                )}
                              </div>
                            )
                          })}
                          {animal.salesRevenue > 0 && (
                            <div>
                              <p className="text-xs text-subtle mb-0.5">Sales</p>
                              <p className="text-lg font-bold text-green-600 dark:text-green-400">${animal.salesRevenue.toFixed(2)}</p>
                            </div>
                          )}
                          {animal.inputCost > 0 && (
                            <div>
                              <p className="text-xs text-subtle mb-0.5">Input cost</p>
                              <p className="text-lg font-bold text-red-600 dark:text-red-400">${animal.inputCost.toFixed(2)}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Cost per unit */}
                      {animal.costPerUnit != null && animal.primaryUnit && (
                        <div className="bg-elevated/40 rounded-lg px-3 py-2">
                          <p className="text-xs text-muted">
                            {/* `key` is the singularized form, so this reads "Cost per egg". */}
                            Cost per {animal.primaryUnit.key}:{' '}
                            <span className="font-semibold text-content">
                              ${animal.costPerUnit.toFixed(3)}
                            </span>
                            <span className="text-subtle ml-2">
                              ({animal.primaryUnit.total.toLocaleString()} {animal.primaryUnit.label} · ${animal.inputCost.toFixed(2)} in costs)
                            </span>
                          </p>
                        </div>
                      )}

                      {/* Net */}
                      {animal.salesRevenue > 0 && animal.inputCost > 0 && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-subtle">Net (this year)</span>
                          <span className={`font-bold ${(animal.salesRevenue - animal.inputCost) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {(animal.salesRevenue - animal.inputCost) >= 0 ? '+' : ''}${(animal.salesRevenue - animal.inputCost).toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── Garden Intelligence ── */}
            {garden.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-subtle uppercase tracking-widest">Garden</p>
                  <Link href="/dashboard/homestead/garden" className="text-xs text-subtle hover:text-green-600 dark:hover:text-green-400 transition-colors">
                    Manage →
                  </Link>
                </div>

                <div className="bg-card border border-line rounded-xl p-5 space-y-4">
                  {/* Overview */}
                  <div className="flex flex-wrap gap-6">
                    <div>
                      <p className="text-xs text-subtle mb-0.5">Currently growing</p>
                      <p className="text-2xl font-bold text-green-600 dark:text-green-400">{growingCrops.length}</p>
                    </div>
                    <div>
                      <p className="text-xs text-subtle mb-0.5">Harvested</p>
                      <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{harvestedCrops.length}</p>
                    </div>
                    <div>
                      <p className="text-xs text-subtle mb-0.5">Failed</p>
                      <p className="text-2xl font-bold text-red-600 dark:text-red-400">{failedCrops.length}</p>
                    </div>
                    {successRate !== null && (
                      <div>
                        <p className="text-xs text-subtle mb-0.5">Success rate</p>
                        <p className={`text-2xl font-bold ${successRate >= 75 ? 'text-green-600 dark:text-green-400' : successRate >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                          {successRate}%
                        </p>
                      </div>
                    )}
                    {gardenInputCost > 0 && (
                      <div>
                        <p className="text-xs text-subtle mb-0.5">Input cost {currentYear}</p>
                        <p className="text-2xl font-bold text-red-600 dark:text-red-400">${gardenInputCost.toFixed(2)}</p>
                      </div>
                    )}
                  </div>

                  {/* Crop performance */}
                  {cropPerformance.length > 0 && (
                    <div className="space-y-2 pt-3 border-t border-line">
                      <p className="text-xs text-subtle">Crop performance (all time)</p>
                      {cropPerformance.slice(0, 8).map(crop => {
                        const rate = crop.total > 0 ? Math.round((crop.harvested / crop.total) * 100) : 0
                        return (
                          <div key={crop.name} className="flex items-center gap-3">
                            <span className="text-sm text-content w-28 truncate capitalize">{crop.name}</span>
                            <div className="flex-1 bg-elevated rounded-full h-1.5">
                              <div
                                className={`h-1.5 rounded-full ${rate >= 75 ? 'bg-green-600' : rate >= 50 ? 'bg-amber-600' : 'bg-red-600'}`}
                                style={{ width: `${rate}%` }}
                              />
                            </div>
                            <span className={`text-xs w-8 text-right ${rate >= 75 ? 'text-green-600 dark:text-green-400' : rate >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                              {rate}%
                            </span>
                            <span className="text-xs text-subtle">{crop.harvested}/{crop.total}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* ── Preservation Intelligence ── */}
            {preservation.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-subtle uppercase tracking-widest">Food Preservation</p>
                  <Link href="/dashboard/homestead/preservation" className="text-xs text-subtle hover:text-sky-600 dark:hover:text-sky-400 transition-colors">
                    Manage →
                  </Link>
                </div>

                <div className="bg-card border border-line rounded-xl p-5 space-y-4">
                  {/* This year vs last year */}
                  <div className="flex flex-wrap gap-6">
                    <div>
                      <p className="text-xs text-subtle mb-0.5">Batches {currentYear}</p>
                      <p className="text-2xl font-bold text-sky-600 dark:text-sky-400">{yearPreservationBatches}</p>
                    </div>
                    {hasYoYData && prevYearBatches > 0 && (
                      <div>
                        <p className="text-xs text-subtle mb-0.5">Batches {prevYear}</p>
                        <p className="text-2xl font-bold text-muted">{prevYearBatches}</p>
                      </div>
                    )}
                    {preservationInputCost > 0 && (
                      <div>
                        <p className="text-xs text-subtle mb-0.5">Input cost {currentYear}</p>
                        <p className="text-2xl font-bold text-red-600 dark:text-red-400">${preservationInputCost.toFixed(2)}</p>
                      </div>
                    )}
                  </div>

                  {/* By method */}
                  {Object.keys(preservationByMethod).length > 0 && (
                    <div className="grid grid-cols-2 gap-2 pt-3 border-t border-line">
                      {Object.entries(preservationByMethod)
                        .sort((a, b) => b[1] - a[1])
                        .map(([method, count]) => (
                          <div key={method} className="flex items-center justify-between bg-elevated/40 rounded-lg px-3 py-2">
                            <span className="text-xs text-muted">{METHOD_LABELS[method] ?? method}</span>
                            <span className="text-sm font-bold text-sky-600 dark:text-sky-400">{count}</span>
                          </div>
                        ))}
                    </div>
                  )}

                  {/* Top items */}
                  {topPreservedItems.length > 0 && (
                    <div className="space-y-1.5 pt-3 border-t border-line">
                      <p className="text-xs text-subtle">Most preserved {currentYear}</p>
                      {topPreservedItems.map(([item, count]) => (
                        <div key={item} className="flex items-center justify-between">
                          <span className="text-sm text-content capitalize">{item}</span>
                          <span className="text-xs text-subtle">{count} batch{count !== 1 ? 'es' : ''}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* ── Year-over-Year Summary ── */}
            {hasYoYData && (
              <section className="space-y-3">
                <p className="text-xs font-semibold text-subtle uppercase tracking-widest">Year over year</p>
                <div className="bg-card border border-line rounded-xl p-5 space-y-3">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div />
                    <div className="text-xs font-medium text-muted">{prevYear}</div>
                    <div className="text-xs font-medium text-amber-600 dark:text-amber-400">{currentYear}</div>
                  </div>
                  <div className="divide-y divide-line">
                    <div className="grid grid-cols-3 gap-4 py-2 text-center">
                      <span className="text-xs text-subtle text-left">Livestock logs</span>
                      <span className="text-sm font-semibold text-muted">{prevYearLivestock.length}</span>
                      <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">{currentYearLivestock.length}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 py-2 text-center">
                      <span className="text-xs text-subtle text-left">Preservation batches</span>
                      <span className="text-sm font-semibold text-muted">{prevYearBatches}</span>
                      <span className="text-sm font-semibold text-sky-600 dark:text-sky-400">{yearPreservationBatches}</span>
                    </div>
                    {(prevYearInputs.length > 0 || currentYearInputs.length > 0) && (
                      <div className="grid grid-cols-3 gap-4 py-2 text-center">
                        <span className="text-xs text-subtle text-left">Input costs</span>
                        <span className="text-sm font-semibold text-muted">
                          ${prevYearInputs.reduce((s, i) => s + i.cost, 0).toFixed(2)}
                        </span>
                        <span className="text-sm font-semibold text-red-600 dark:text-red-400">${yearInputCost.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* Footer links */}
            <div className="flex gap-4 pt-2 border-t border-line">
              <Link href="/dashboard/homestead/reports" className="text-xs text-subtle hover:text-content transition-colors">
                Full reports →
              </Link>
              <Link href="/dashboard" className="text-xs text-subtle hover:text-content transition-colors">
                Log today →
              </Link>
            </div>

          </>
        )}
      </main>
      </PrintFrame>
    </div>
  )
}
