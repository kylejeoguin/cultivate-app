import StateRequirementsClient from './StateRequirementsClient'

export const metadata = {
  title: 'Homeschool Requirements by State (2026) — Free Compliance Checklist | Cultivate',
  description:
    'What does your state require to homeschool? Pick your state for the plain-English rule — instruction hours, testing, and the legal citation — plus a free print-ready compliance checklist.',
}

export default async function StateRequirementsPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>
}) {
  const { source } = await searchParams
  return <StateRequirementsClient source={(source || 'direct').slice(0, 60)} />
}
