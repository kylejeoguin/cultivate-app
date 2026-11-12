// State filing deadline data
// Format: { month: 1-12, day: 1-31, label: string, type: 'annual'|'one_time'|'none' }
// month/day represent the filing deadline for each school year
// type: 'annual' = must file every year, 'one_time' = first time only, 'none' = no requirement

export interface StateDeadline {
  state: string
  type: 'annual' | 'one_time' | 'none'
  month?: number
  day?: number
  deadline_label?: string
  notes?: string
}

// Key deadlines by state — annual filers with specific dates
// Source: HSLDA, state DOE websites, verified 2025
export const STATE_DEADLINES: Record<string, StateDeadline> = {
  AL: { state: 'AL', type: 'one_time', notes: 'One-time enrollment with church school or state' },
  AK: { state: 'AK', type: 'one_time', notes: 'One-time notification to local school board' },
  AR: { state: 'AR', type: 'annual', month: 8, day: 15, deadline_label: 'Notice of Intent due' },
  AZ: { state: 'AZ', type: 'annual', notes: 'File within 30 days of beginning' },
  CA: { state: 'CA', type: 'annual', month: 10, day: 1, deadline_label: 'Private School Affidavit due' },
  CO: { state: 'CO', type: 'annual', notes: 'File 14 days before starting each year' },
  CT: { state: 'CT', type: 'none' },
  DE: { state: 'DE', type: 'annual', month: 9, day: 1, deadline_label: 'Intent to Homeschool due' },
  FL: { state: 'FL', type: 'annual', notes: 'File with local school board' },
  GA: { state: 'GA', type: 'annual', month: 9, day: 1, deadline_label: 'Declaration of Intent due' },
  HI: { state: 'HI', type: 'annual', notes: 'File with local DOE' },
  ID: { state: 'ID', type: 'none' },
  IL: { state: 'IL', type: 'none' },
  IN: { state: 'IN', type: 'none' },
  IA: { state: 'IA', type: 'one_time', notes: 'Competent Private Instruction form with local school' },
  KS: { state: 'KS', type: 'one_time', notes: 'Register as non-accredited private school' },
  KY: { state: 'KY', type: 'annual', notes: 'Establish home school under state law' },
  LA: { state: 'LA', type: 'annual', month: 9, day: 1, deadline_label: 'Approval application due' },
  ME: { state: 'ME', type: 'annual', notes: 'Notice to local school board' },
  MD: { state: 'MD', type: 'annual', notes: 'Annual approval required' },
  MA: { state: 'MA', type: 'annual', notes: 'Annual approval required by local school board' },
  MI: { state: 'MI', type: 'none' },
  MN: { state: 'MN', type: 'annual', month: 10, day: 1, deadline_label: 'Annual report due' },
  MS: { state: 'MS', type: 'annual', month: 9, day: 15, deadline_label: 'Notice of Intent due' },
  MO: { state: 'MO', type: 'none' },
  MT: { state: 'MT', type: 'annual', notes: 'File with local school board' },
  NE: { state: 'NE', type: 'annual', notes: 'File with state and local district' },
  NV: { state: 'NV', type: 'annual', notes: 'Annual notice required' },
  NH: { state: 'NH', type: 'annual', month: 9, day: 30, deadline_label: 'Notice of Intent due' },
  NJ: { state: 'NJ', type: 'none' },
  NM: { state: 'NM', type: 'annual', notes: 'File with local school district' },
  NY: { state: 'NY', type: 'annual', month: 7, day: 1, deadline_label: 'IHIP due to district' },
  NC: { state: 'NC', type: 'annual', notes: 'File with state annually' },
  ND: { state: 'ND', type: 'annual', month: 9, day: 1, deadline_label: 'Notice of Intent due' },
  OH: { state: 'OH', type: 'annual', month: 9, day: 1, deadline_label: 'Notice of Intent due' },
  OK: { state: 'OK', type: 'none' },
  OR: { state: 'OR', type: 'annual', notes: 'Annual notice to local ESD' },
  PA: { state: 'PA', type: 'annual', month: 8, day: 1, deadline_label: 'Affidavit due to school district' },
  RI: { state: 'RI', type: 'annual', notes: 'Annual approval required' },
  SC: { state: 'SC', type: 'annual', notes: 'Annual filing required' },
  SD: { state: 'SD', type: 'one_time', notes: 'Initial notice to local school board' },
  TN: { state: 'TN', type: 'annual', month: 8, day: 1, deadline_label: 'Notice of Intent due' },
  TX: { state: 'TX', type: 'none' },
  UT: { state: 'UT', type: 'annual', notes: 'Annual affidavit required' },
  VT: { state: 'VT', type: 'annual', month: 9, day: 1, deadline_label: 'Enrollment form due' },
  VA: { state: 'VA', type: 'annual', month: 8, day: 15, deadline_label: 'Notice of Intent due' },
  WA: { state: 'WA', type: 'annual', notes: 'Annual Declaration of Intent required' },
  WV: { state: 'WV', type: 'annual', notes: 'Annual notice required' },
  WI: { state: 'WI', type: 'annual', month: 10, day: 15, deadline_label: 'Home-Based Private Educational Program report due' },
  WY: { state: 'WY', type: 'annual', notes: 'Annual filing with local board' },
  DC: { state: 'DC', type: 'annual', month: 8, day: 15, deadline_label: 'Notice of Intent due' },
}

// Returns deadline info and days until deadline for a given state
// currentYear: the school year's start year (e.g. 2026 for 2026-2027)
export function getDeadlineAlert(state: string, today: Date = new Date()): {
  hasDeadline: boolean
  deadlineDate: Date | null
  daysUntil: number | null
  label: string
  urgent: boolean
  notes: string | null
} | null {
  const dl = STATE_DEADLINES[state]
  if (!dl || dl.type === 'none') return null
  if (dl.type === 'one_time') return null // one-time filers don't need annual reminders

  if (!dl.month || !dl.day) {
    // Has deadline but no specific date — still return general notice
    return {
      hasDeadline: true,
      deadlineDate: null,
      daysUntil: null,
      label: dl.deadline_label ?? 'Annual filing required',
      urgent: false,
      notes: dl.notes ?? null,
    }
  }

  // Build deadline date for current year — if past, try next year
  let deadlineDate = new Date(today.getFullYear(), dl.month - 1, dl.day)
  if (deadlineDate < today) {
    deadlineDate = new Date(today.getFullYear() + 1, dl.month - 1, dl.day)
  }

  const daysUntil = Math.ceil((deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  // Only show within 90 days
  if (daysUntil > 90) return null

  return {
    hasDeadline: true,
    deadlineDate,
    daysUntil,
    label: dl.deadline_label ?? 'Annual filing due',
    urgent: daysUntil <= 14,
    notes: dl.notes ?? null,
  }
}
