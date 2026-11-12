// Compliance resolution helpers — the single place that turns a state's stored
// requirement (richer schema, 2026-06-14) into the numbers a child is actually
// measured against. Keeping this pure + shared means the report, transcript, and
// dashboard can't drift from each other. Display (JSX) stays in the pages.
import type { StateRequirement } from './types'

// Missouri's five core subjects (the only state with a core-hours sub-rule).
// Names must match the subject names used across Cultivate's tagging system.
export const CORE_SUBJECTS = ['Reading', 'Language Arts', 'Mathematics', 'Science', 'Social Studies'] as const
const CORE_SET = new Set<string>(CORE_SUBJECTS)

export function isCoreSubject(name: string): boolean {
  return CORE_SET.has(name.trim())
}

// Parse a free-text grade ("K", "3rd", "Grade 5", "10th", "Pre-K", "Kindergarten")
// to a number where K = 0 and grades 1–12 map to themselves. Returns null when it
// can't be determined (so callers fall back to the elementary band, the safer floor).
export function parseGradeLevel(g: string | null | undefined): number | null {
  if (!g) return null
  const s = g.toLowerCase().trim()
  if (s.includes('pre')) return null // pre-K isn't a compulsory grade band
  if (s.startsWith('k') || s.includes('kinder')) return 0
  const m = s.match(/\d{1,2}/)
  if (!m) return null
  const n = parseInt(m[0], 10)
  return n >= 0 && n <= 12 ? n : null
}

// The annual-hours figure this child is measured against, honoring grade bands
// (MT 720/1080 @4, NE 1032/1080 @9, NY/PA 900/990 @7). When grade is unknown we
// use the elementary band — the lower, non-alarming floor.
export function applicableAnnualHours(req: StateRequirement, gradeNum: number | null): number | null {
  if (req.hours_elementary != null || req.hours_secondary != null) {
    const split = req.secondary_starts_grade ?? 7
    if (gradeNum != null && gradeNum >= split) return req.hours_secondary ?? req.hours_elementary
    return req.hours_elementary ?? req.hours_secondary
  }
  return req.annual_hours
}

// Human label for which band applied, e.g. "grades 7–12" — only when banded.
export function bandLabel(req: StateRequirement, gradeNum: number | null): string | null {
  if (req.hours_elementary == null && req.hours_secondary == null) return null
  const split = req.secondary_starts_grade ?? 7
  const isSecondary = gradeNum != null && gradeNum >= split
  if (gradeNum == null) return null
  return isSecondary ? `grades ${split}–12` : `grades K–${split - 1}`
}

export type HourLog = { hours: number | null; subject_ids: string[]; subject_hours: Record<string, number> | null }
export type HourCredit = { subject_ids: string[]; credit_hours: number | null }

// Distribute EVERY logged hour to its subject(s) so the per-subject breakdown sums to the
// total hours logged — the honest, complete picture. Per session: if the parent set explicit
// per-subject time, use exactly that; otherwise split the session's total hours EVENLY across
// its tagged subjects. Homestead-credit hours split evenly across their tagged subjects too.
//
// (This replaced the old "explicit-only" sum, which silently dropped every session where the
// parent didn't hand-split time — so a 15.5h year showed only 6.5h in the subject table.)
// `anyExplicit` = did at least one session carry a hand-entered split (so the UI can note that
// the rest are even-split estimates).
export function distributedSubjectHours(
  logs: HourLog[],
  credits: HourCredit[],
  subjectName: (id: string) => string | undefined,
): { byName: Record<string, number>; anyExplicit: boolean; anyEstimated: boolean } {
  const out: Record<string, number> = {}
  let anyExplicit = false
  let anyEstimated = false
  const add = (name: string | undefined, h: number) => {
    if (!name || !(h > 0)) return
    out[name] = (out[name] ?? 0) + h
  }
  for (const l of logs) {
    const explicit = l.subject_hours
      ? Object.entries(l.subject_hours).filter(([, h]) => typeof h === 'number' && h > 0)
      : []
    if (explicit.length > 0) {
      anyExplicit = true
      for (const [id, h] of explicit) add(subjectName(id), h as number)
    } else {
      const ids = l.subject_ids ?? []
      if (ids.length && (l.hours ?? 0) > 0) {
        anyEstimated = true
        const per = (l.hours as number) / ids.length
        for (const id of ids) add(subjectName(id), per)
      }
    }
  }
  for (const c of credits) {
    const ids = c.subject_ids ?? []
    if (ids.length && (c.credit_hours ?? 0) > 0) {
      anyEstimated = true
      const per = (c.credit_hours as number) / ids.length
      for (const id of ids) add(subjectName(id), per)
    }
  }
  // NOTE: values are left UNrounded here — round for display with roundBreakdown() so the
  // rounded per-subject rows still sum to the total (see below).
  return { byName: out, anyExplicit, anyEstimated }
}

// Round a subject → hours map to `dp` decimals so the ROUNDED values sum to the rounded total
// (largest-remainder method). This makes the per-subject breakdown tie out to the headline
// hours instead of drifting by a rounding cent when a session's time splits unevenly.
export function roundBreakdown(byName: Record<string, number>, dp = 1): Record<string, number> {
  const f = Math.pow(10, dp)
  const entries = Object.entries(byName)
  const parts = entries.map(([k, v]) => ({ k, floor: Math.floor(v * f), rem: (v * f) - Math.floor(v * f) }))
  const target = Math.round(entries.reduce((s, [, v]) => s + v, 0) * f)
  let need = target - parts.reduce((s, p) => s + p.floor, 0)
  parts.sort((a, b) => b.rem - a.rem)
  for (let i = 0; i < parts.length && need > 0; i++) { parts[i].floor += 1; need-- }
  const out: Record<string, number> = {}
  for (const p of parts) out[p.k] = p.floor / f
  return out
}

// Core-subject hours (MO's 600-hour rule) from a distributed breakdown — stays consistent
// with the subject table since both derive from the same distribution. Pass the ROUNDED map
// so the core number matches the displayed rows exactly.
export function coreHoursFromDistribution(byName: Record<string, number>): number {
  let core = 0
  for (const [name, h] of Object.entries(byName)) if (isCoreSubject(name)) core += h
  return Math.round(core * 10) / 10
}
