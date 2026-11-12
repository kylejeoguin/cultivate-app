// SEO slug helpers for the public /state-requirements/[state] landing pages.
// Kept separate from the auto-generated stateCompliance.ts so regenerating that
// file never clobbers these.
import { STATE_COMPLIANCE, type StateCompliance } from './stateCompliance'

/** "District of Columbia" -> "district-of-columbia", "New Hampshire" -> "new-hampshire" */
export function stateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function allStateSlugs(): string[] {
  return STATE_COMPLIANCE.map((s) => stateSlug(s.name))
}

export function stateBySlug(slug: string): StateCompliance | undefined {
  return STATE_COMPLIANCE.find((s) => stateSlug(s.name) === slug)
}
