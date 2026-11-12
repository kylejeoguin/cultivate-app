// Homestead revenue, in one place.
//
// Four surfaces report money — Homestead Reports, Intelligence, Project reports, the Yearbook —
// and each had its own copy of `filter(sold|mixed).reduce(sale_amount)` over livestock_logs only.
// When garden_entries gained sale columns, four copies meant four chances to forget one and quietly
// under-report what the family earned. One helper, one definition of "revenue".
//
// `disposition` is the gate, not `sale_amount`: a row can carry an amount while being marked
// 'personal' (the user changed their mind), and that is not revenue.

export interface SaleRow {
  disposition: string | null
  sale_amount: number | null
}

/** True when this row represents produce/product that was actually sold. */
export function isSold(row: SaleRow): boolean {
  return row.disposition === 'sold' || row.disposition === 'mixed'
}

/** Sum of sale_amount across the rows that were sold. Safe on empty/undefined lists. */
export function saleRevenue(rows: readonly SaleRow[] | null | undefined): number {
  if (!rows?.length) return 0
  return rows.filter(isSold).reduce((sum, r) => sum + (r.sale_amount ?? 0), 0)
}

/**
 * Total homestead revenue: livestock production + garden produce + preserved goods.
 * All three tables carry the same disposition/sale_amount columns, so a new sales surface
 * is one line here and every report picks it up at once.
 */
export function homesteadRevenue(sources: {
  livestock?: readonly SaleRow[] | null
  garden?: readonly SaleRow[] | null
  preservation?: readonly SaleRow[] | null
}): number {
  return saleRevenue(sources.livestock) + saleRevenue(sources.garden) + saleRevenue(sources.preservation)
}
