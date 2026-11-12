// Catch-all subject for homeschool events whose activity doesn't map to a state-listed
// academic subject (canning, animal care done with a child, repairs, budgeting…). Used so a
// school record is NEVER saved subject-less — incomplete for per-subject compliance states.
// Always available as a selectable pill and the auto-assigned default; the user can re-tag it.
export const DEFAULT_HOMESCHOOL_SUBJECT = 'Life Skills'

export type LearningStyle = 'structured' | 'charlotte_mason' | 'unschooling' | 'project_based' | 'eclectic'
export type AttendanceStatus = 'present' | 'absent' | 'excused'
export type ActivityType = 'field_trip' | 'co_op' | 'community_service' | 'extracurricular' | 'other'
export type ResourceType = 'book' | 'curriculum' | 'website' | 'video' | 'material' | 'other'

export interface Child {
  id: string
  user_id: string
  name: string
  birthdate: string | null
  grade_level: string | null
  learning_style: LearningStyle | null
  color: string | null
  learning_support: string[]
  ai_notes: string | null
  created_at: string
  updated_at: string
}

export interface SchoolYear {
  id: string
  user_id: string
  child_id: string
  name: string
  start_date: string
  end_date: string
  days_per_week: number
  state: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Subject {
  id: string
  user_id: string
  child_id: string
  school_year_id: string | null
  name: string
  type: string | null
  description: string | null
  color: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface DailyLog {
  id: string
  user_id: string
  child_id: string
  school_year_id: string | null
  log_date: string
  notes: string | null
  hours: number | null
  subject_ids: string[]
  subject_hours: Record<string, number>
  is_homestead_day: boolean
  created_at: string
  updated_at: string
}

export interface StateSubject {
  name: string
  required: boolean
  min_hours: number | null
}

export type RequirementType =
  | 'none'                    // no instructional-time mandate
  | 'days'                    // annual days only
  | 'hours'                   // annual hours (flat or grade-banded)
  | 'days_plus_hours_per_day' // days AND a per-day minimum (no statutory total)
  | 'days_or_hours'           // either measure satisfies
  | 'days_and_hours'          // both required
  | 'advisory'                // benchmark, not legally binding

export interface StateRequirement {
  id: string
  state: string
  // Legacy columns — kept populated for backward compat (transcript, dashboard, DailyLogForm).
  tracking_mode: 'hours' | 'days' | 'both'
  annual_total_hours: number | null
  annual_total_days: number | null
  core_hours_required: number | null
  // Richer model (2026-06-14) — the source of truth for the compliance report.
  requirement_type: RequirementType | null
  annual_hours: number | null          // flat annual hours when not grade-banded
  hours_elementary: number | null      // grade-banded lower
  hours_secondary: number | null       // grade-banded upper
  secondary_starts_grade: number | null // grade at/above which secondary applies
  annual_days: number | null
  hours_per_day: number | null         // per-day minimum for days_plus_hours_per_day
  core_hours: number | null            // hours that must be in core subjects (MO 600)
  core_hours_at_home: number | null    // of core_hours, how many at home (MO 400)
  is_advisory: boolean                 // benchmark, not legally binding
  is_enforced: boolean                 // false = on the books but unmonitored (OK)
  needs_signoff: boolean               // genuinely ambiguous; human/legal review pending
  testing_required: boolean
  testing_grades: number[] | null
  testing_note: string | null
  requirement_summary: string | null   // plain-English authoritative statement
  citation: string | null
  subjects: StateSubject[]
  notes: string | null
  source_url: string | null
  last_verified: string | null
  created_at: string
}

export interface Attendance {
  id: string
  user_id: string
  child_id: string
  school_year_id: string | null
  attendance_date: string
  status: AttendanceStatus
  notes: string | null
  created_at: string
}

export interface Activity {
  id: string
  user_id: string
  child_id: string
  school_year_id: string | null
  activity_date: string
  type: ActivityType | null
  title: string
  description: string | null
  hours: number | null
  subject_ids: string[]
  created_at: string
  updated_at: string
}

export interface Resource {
  id: string
  user_id: string
  child_id: string
  school_year_id: string | null
  title: string
  type: ResourceType | null
  subject_id: string | null
  notes: string | null
  acquired_at: string | null
  created_at: string
}

export interface FamilyMember {
  id: string
  owner_id: string
  member_id: string | null
  member_email: string
  status: 'pending' | 'accepted'
  invite_token: string
  created_at: string
  accepted_at: string | null
}

export interface LivestockAnimal {
  id: string
  user_id: string
  animal_type: string
  name: string
  notes: string | null
  is_active: boolean
  created_at: string
}

export interface GardenBed {
  id: string
  user_id: string
  name: string
  notes: string | null
  is_active: boolean
  created_at: string
}

export interface LivestockLog {
  id: string
  user_id: string
  log_date: string
  animal_type: string
  animal_name: string | null
  animal_id: string | null
  quantity: number | null
  unit: string | null
  notes: string | null
  school_credit: boolean
  child_ids: string[]
  subject_ids: string[]
  credit_hours: number | null
  project_id: string | null
  disposition: 'personal' | 'sold' | 'mixed' | null
  sale_amount: number | null
  sale_qty: number | null
  created_at: string
}

export type GardenStatus = 'planned' | 'planted' | 'growing' | 'harvested' | 'failed'

export interface GardenEntry {
  id: string
  user_id: string
  crop_name: string
  variety: string | null
  zone: string | null
  bed_id: string | null
  date_planted: string | null
  expected_harvest: string | null
  actual_harvest: string | null
  status: GardenStatus
  // Harvest yield. Null = not recorded; a harvest with an unknown amount is legal.
  // DB enforces: status='harvested' implies actual_harvest is not null, and quantity >= 0.
  quantity: number | null
  unit: string | null
  // Sale of the harvest, mirroring livestock_logs so revenue reads stay symmetric.
  // DB enforces: a sale requires status='harvested' (you can't sell a crop still in the ground),
  // amounts are non-negative, and disposition is one of the three values.
  disposition: 'personal' | 'sold' | 'mixed' | null
  sale_amount: number | null
  sale_qty: number | null
  notes: string | null
  school_credit: boolean
  child_ids: string[]
  subject_ids: string[]
  credit_hours: number | null
  project_id: string | null
  created_at: string
  updated_at: string
}

export type PreservationMethod = 'canning' | 'freezing' | 'dehydrating' | 'fermenting' | 'other'

export interface PreservationLog {
  id: string
  user_id: string
  log_date: string
  item_name: string
  method: PreservationMethod
  quantity: number | null
  unit: string | null
  // Sale of the batch, mirroring livestock_logs and garden_entries so revenue reads stay
  // symmetric. Unlike a crop, a preserved batch is already finished — there's no lifecycle
  // stage that makes a sale impossible, so no "requires harvest" constraint here.
  disposition: 'personal' | 'sold' | 'mixed' | null
  sale_amount: number | null
  sale_qty: number | null
  // Optional attribution: the project this batch belongs to (its sale flows into that
  // project's report) and the garden harvest that fed it (provenance). Both nullable.
  project_id: string | null
  garden_entry_id: string | null
  notes: string | null
  school_credit: boolean
  child_ids: string[]
  subject_ids: string[]
  credit_hours: number | null
  created_at: string
}

export type ProjectCategory = 'homestead' | 'home_diy'
export type ProjectStatus = 'active' | 'up_next' | 'high_priority' | 'medium_priority' | 'low_priority' | 'done'

export interface Project {
  id: string
  user_id: string
  title: string
  description: string | null
  category: ProjectCategory
  status: ProjectStatus
  target: string | null
  budget: number | null
  notes: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface ProjectExpense {
  id: string
  project_id: string
  user_id: string
  amount: number
  description: string
  expense_date: string
  store: string | null
  notes: string | null
  created_at: string
}

// Direct, user-entered project income — for money the homestead tables can't derive
// (a Home & DIY sale, the finished coop itself, firewood, custom work, a lump sum).
// The income twin of ProjectExpense. Livestock/garden sales tagged to the project still
// flow through homesteadRevenue(); this is additive to that, not a replacement.
export interface ProjectIncome {
  id: string
  project_id: string
  user_id: string
  amount: number
  description: string
  income_date: string
  source: string | null
  notes: string | null
  created_at: string
}

// A recurring homestead chore (feed animals, clean coop, move tractor, weed beds). Distinct from
// a Project (one-off) — this is a schedule of what's due, mirroring equipment_maintenance.
export interface HomesteadChore {
  id: string
  user_id: string
  name: string
  cadence_type: 'interval' | 'weekly'
  interval_days: number | null
  weekday: number | null
  estimated_minutes: number | null
  assigned_child_id: string | null
  last_completed_date: string | null
  next_due_date: string
  is_active: boolean
  created_at: string
  updated_at: string
}

// One row per time a chore is marked done. When school_credit is true it carries the same
// child_ids/subject_ids/credit_hours shape as the homestead log tables, so homeschool reports
// count it as credit for the named child.
export interface ChoreCompletion {
  id: string
  user_id: string
  chore_id: string
  completed_date: string
  school_credit: boolean
  child_ids: string[]
  subject_ids: string[]
  credit_hours: number | null
  created_at: string
}

export interface ProjectTask {
  id: string
  project_id: string
  user_id: string
  title: string
  is_complete: boolean
  sort_order: number
  created_at: string
}

export type HomesteadInputSection = 'livestock' | 'garden' | 'preservation'

export interface HomesteadInput {
  id: string
  user_id: string
  section: HomesteadInputSection
  category: string
  input_date: string
  item: string
  quantity: number | null
  unit: string | null
  cost: number
  notes: string | null
  // Which animal type this livestock cost belongs to. Null = unattributed, which is a
  // valid state — a generic cost still logs. Drives per-animal cost/profit in Intelligence.
  animal_type: string | null
  // Optional project this cost rolls into (a preservation/garden/livestock cost can attribute
  // to a project's spend). Null = unattributed. Nulled if the project is deleted.
  project_id: string | null
  created_at: string
}

export type ResourceSection = 'homeschool' | 'homestead' | 'home_diy'
export type ResourceTier = 'free' | 'subscriber'
export type ResourceFileType = 'pdf' | 'spreadsheet' | 'doc' | 'link' | 'other'

export interface PlatformResource {
  id: string
  title: string
  description: string | null
  section: ResourceSection
  tier: ResourceTier
  file_url: string | null
  file_type: ResourceFileType
  thumbnail_emoji: string
  is_active: boolean
  sort_order: number
  created_at: string
}

export interface EquipmentMaintenance {
  id: string
  user_id: string
  equipment_name: string
  category: string
  equipment_category: 'home' | 'homestead'
  last_service_date: string | null
  next_service_date: string | null
  service_interval_days: number | null
  service_notes: string | null
  purchase_date: string | null
  location: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

// A recurring service definition on one piece of equipment. Intervals are measured in
// calendar days OR engine-hours (per service). e.g. a tractor: engine oil every 100 hours,
// hydraulic oil every 400 hours, cabin filter every 12 months — tracked independently.
export interface EquipmentService {
  id: string
  user_id: string
  equipment_id: string
  name: string
  interval_unit: 'days' | 'hours'
  interval_value: number | null
  last_service_date: string | null
  last_service_hours: number | null
  next_due_date: string | null
  next_due_hours: number | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

// One performed-service history record (for the maintenance report + resale service history).
export interface EquipmentServiceLog {
  id: string
  user_id: string
  equipment_id: string
  service_id: string | null
  service_name: string
  service_date: string
  hours_at_service: number | null
  notes: string | null
  created_at: string
}

export type PortfolioSubjectTag = string

export interface AssessmentLog {
  id: string
  user_id: string
  child_id: string
  assessment_date: string
  type: 'standardized_test' | 'portfolio_review' | 'evaluator_assessment' | 'self_assessment' | 'other'
  title: string
  administered_by: string | null
  results: string | null
  notes: string | null
  created_at: string
}

export interface PortfolioItem {
  id: string
  user_id: string
  child_id: string
  school_year_id: string | null
  title: string
  description: string | null
  subject_ids: string[]
  item_date: string
  file_url: string | null
  file_type: 'image' | 'document' | 'link' | null
  is_featured: boolean
  created_at: string
  updated_at: string
}

export interface CurriculumPlan {
  id: string
  user_id: string
  child_id: string
  school_year_id: string | null
  subject_id: string
  program_name: string | null
  goals: string | null
  created_at: string
  updated_at: string
}

export type CurriculumUnitStatus = 'planned' | 'in_progress' | 'complete'

export interface CurriculumUnit {
  id: string
  user_id: string
  plan_id: string
  title: string
  sequence: number
  status: CurriculumUnitStatus
  target_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// --- Weekly Planner (SPEC v2) ---------------------------------------------
export type PlannerTrack = 'daily' | 'loop' | 'day'

export interface PlannerWeek {
  id: string
  user_id: string
  child_id: string
  school_year_id: string | null
  week_start: string | null   // Monday ISO; null when is_template
  is_template: boolean
  template_name: string | null
  loop_position: number
  logged_dates: Record<string, string> | null  // date ISO → daily_log id (dedupe)
  created_at: string
  updated_at: string
}

export interface PlannerItem {
  id: string
  user_id: string
  week_id: string
  track: PlannerTrack
  day_of_week: number | null  // 0=Mon..6=Sun (track='day')
  subject_id: string | null
  course_unit_id: string | null
  title: string
  status: 'todo' | 'done'     // day/loop items
  daily_days: Record<string, boolean> | null   // track='daily' — weekdays SCHEDULED
  daily_done: Record<string, boolean> | null   // track='daily' — weekdays COMPLETED
  daily_desc: Record<string, string> | null    // track='daily' — per-weekday lesson note
  sequence: number
  notes: string | null   // track='day' lesson note · track='loop' "what's next" pointer
  created_at: string
  updated_at: string
}
