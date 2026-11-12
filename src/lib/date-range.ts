export type DateRangeKey = 'ytd' | '30d' | '90d' | '1y' | 'all'

export const DATE_RANGES: DateRangeKey[] = ['ytd', '30d', '90d', '1y', 'all']

export const RANGE_LABELS: Record<DateRangeKey, string> = {
  ytd: 'YTD',
  '30d': '30 Days',
  '90d': '90 Days',
  '1y': '1 Year',
  all: 'All Time',
}

export function parseRange(raw: string | undefined): DateRangeKey {
  if (raw === '30d' || raw === '90d' || raw === '1y' || raw === 'all') return raw
  return 'ytd'
}

export function getStartDate(range: DateRangeKey): string | null {
  const today = new Date()
  switch (range) {
    case '30d': {
      const d = new Date(today)
      d.setDate(d.getDate() - 30)
      return d.toISOString().slice(0, 10)
    }
    case '90d': {
      const d = new Date(today)
      d.setDate(d.getDate() - 90)
      return d.toISOString().slice(0, 10)
    }
    case '1y': {
      const d = new Date(today)
      d.setFullYear(d.getFullYear() - 1)
      return d.toISOString().slice(0, 10)
    }
    case 'all':
      return null
    case 'ytd':
    default:
      return `${today.getFullYear()}-01-01`
  }
}
