import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import { householdOwnerId } from '@/lib/household'

// "Download all my data" — a human-usable Excel workbook, one tab per area.
// The old version dumped raw DB rows as JSON (internal UUIDs, internal columns) which is
// unreadable to a parent. This resolves the id columns to real names (child, subject,
// project, school year, source crop), drops internal plumbing, prettifies headers, and
// formats dates — so it opens cleanly in Excel / Google Sheets / Numbers.

export const runtime = 'nodejs'

type Row = Record<string, unknown>
type Maps = {
  child: Record<string, string>
  subject: Record<string, string>
  year: Record<string, string>
  project: Record<string, string>
  garden: Record<string, string>
}

// Internal columns that carry no meaning for the user.
const DROP = new Set([
  'id', 'user_id', 'created_at', 'updated_at', 'sort_order', 'color',
  'ai_notes', 'subject_hours', 'bed_id', 'animal_id',
])

const ymd = (v: unknown): string => {
  if (!v) return ''
  const s = String(v)
  return s.length >= 10 ? s.slice(0, 10) : s
}
const titleCase = (k: string): string =>
  k.split('_').map(w => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ')

const lookup = (map: Record<string, string>, id: unknown): string =>
  typeof id === 'string' ? (map[id] ?? '') : ''
const lookupMany = (map: Record<string, string>, ids: unknown): string =>
  Array.isArray(ids) ? ids.map(i => map[i as string] ?? '').filter(Boolean).join(', ') : ''

// Turn one raw DB row into a clean {Header: value} object. Insertion order = column order.
function cleanRow(r: Row, m: Maps): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  if ('child_id' in r) out['Child'] = lookup(m.child, r.child_id)
  if ('child_ids' in r) out['Children'] = lookupMany(m.child, r.child_ids)

  for (const [k, v] of Object.entries(r)) {
    if (DROP.has(k) || k === 'child_id' || k === 'child_ids') continue
    if (k === 'subject_id') { out['Subject'] = lookup(m.subject, v); continue }
    if (k === 'subject_ids') { out['Subjects'] = lookupMany(m.subject, v); continue }
    if (k === 'school_year_id') { out['School Year'] = lookup(m.year, v); continue }
    if (k === 'project_id') { out['Project'] = lookup(m.project, v); continue }
    if (k === 'garden_entry_id') { out['Source Crop'] = lookup(m.garden, v); continue }
    if (k === 'photo_urls') { out['Photos'] = Array.isArray(v) && v.length ? `${v.length} photo(s)` : ''; continue }

    let val: string | number
    if (v === null || v === undefined) val = ''
    else if (typeof v === 'boolean') val = v ? 'Yes' : 'No'
    else if (typeof v === 'number') val = v
    else if (Array.isArray(v)) val = v.join(', ')
    else if (typeof v === 'object') val = JSON.stringify(v)
    else if (/(_date|_at)$/.test(k) || k === 'birthdate') val = ymd(v)
    else val = String(v)
    out[titleCase(k)] = val
  }
  return out
}

function addSheet(wb: ExcelJS.Workbook, name: string, rows: Row[] | null, m: Maps) {
  const ws = wb.addWorksheet(name)
  const clean = (rows ?? []).map(r => cleanRow(r, m))
  if (clean.length === 0) {
    ws.addRow(['No records yet.'])
    return
  }
  const headers = Object.keys(clean[0])
  ws.columns = headers.map(h => ({ header: h, key: h, width: Math.min(Math.max(h.length + 2, 12), 45) }))
  clean.forEach(c => ws.addRow(c))
  ws.getRow(1).font = { bold: true }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Export the whole HOUSEHOLD's records, not just rows authored by the caller. Since
  // 20260727210000 a family member's rows are stored under the plan owner's id, so pinning
  // user.id here would hand an invited parent an EMPTY workbook. RLS still scopes every read.
  const household = await householdOwnerId(supabase, user.id)
  const q = (table: string, order: string, asc = true) =>
    fetchAllRows<Row>((f, t) => supabase.from(table).select('*').eq('user_id', household).order(order, { ascending: asc }).range(f, t))

  const [
    children, schoolYears, subjects, dailyLogs, attendance, grades, activities,
    resources, expenses, assessments, portfolio, livestockLogs, gardenEntries,
    preservationLogs, homesteadInputs, projects, projectTasks, projectExpenses, equipment,
  ] = await Promise.all([
    q('children', 'created_at'),
    q('school_years', 'start_date'),
    q('subjects', 'name'),
    q('daily_log', 'log_date', false),
    q('attendance', 'attendance_date', false),
    q('grades', 'graded_at', false),
    q('activities', 'activity_date', false),
    q('resources', 'created_at', false),
    q('homeschool_expenses', 'expense_date', false),
    q('assessment_logs', 'assessment_date', false),
    q('portfolio_items', 'item_date', false),
    q('livestock_logs', 'log_date', false),
    q('garden_entries', 'created_at', false),
    q('preservation_logs', 'log_date', false),
    q('homestead_inputs', 'input_date', false),
    q('projects', 'created_at', false),
    q('project_tasks', 'sort_order'),
    q('project_expenses', 'expense_date', false),
    q('equipment_maintenance', 'equipment_name'),
  ])

  // Resolver maps: raw id -> friendly name
  const buildMap = (rows: Row[] | null, key: string): Record<string, string> => {
    const m: Record<string, string> = {}
    for (const r of rows ?? []) if (r.id) m[r.id as string] = (r[key] as string) ?? ''
    return m
  }
  const maps: Maps = {
    child: buildMap(children, 'name'),
    subject: buildMap(subjects, 'name'),
    year: buildMap(schoolYears, 'name'),
    project: buildMap(projects, 'title'),
    garden: buildMap(gardenEntries, 'crop_name'),
  }

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Cultivate'
  wb.created = new Date()

  // Cover sheet
  const cover = wb.addWorksheet('About This Export')
  cover.columns = [{ width: 22 }, { width: 60 }]
  cover.addRow(['Your Cultivate Data']).font = { bold: true, size: 16 }
  cover.addRow([])
  cover.addRow(['Account', user.email ?? ''])
  cover.addRow(['Exported', ymd(new Date().toISOString())])
  cover.addRow(['Note', 'Every record you have logged, one tab per area. All yours to keep.'])
  cover.addRow([])
  cover.addRow(['Each tab below is one area of your account:']).font = { italic: true }

  const sheets: [string, Row[] | null][] = [
    ['Children', children],
    ['School Years', schoolYears],
    ['Subjects', subjects],
    ['Daily Log', dailyLogs],
    ['Attendance', attendance],
    ['Grades', grades],
    ['Activities', activities],
    ['Books & Curriculum', resources],
    ['Homeschool Expenses', expenses],
    ['Assessments', assessments],
    ['Portfolio', portfolio],
    ['Livestock', livestockLogs],
    ['Garden', gardenEntries],
    ['Preservation', preservationLogs],
    ['Homestead Inputs', homesteadInputs],
    ['Projects', projects],
    ['Project Tasks', projectTasks],
    ['Project Expenses', projectExpenses],
    ['Equipment', equipment],
  ]

  for (const [name, rows] of sheets) {
    cover.addRow([`• ${name}`, `${(rows ?? []).length} record(s)`])
    addSheet(wb, name, rows, maps)
  }

  const buffer = await wb.xlsx.writeBuffer()
  const filename = `cultivate-my-data-${ymd(new Date().toISOString())}.xlsx`

  return new NextResponse(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
