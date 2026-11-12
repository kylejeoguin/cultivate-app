'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import DemoTagBox from '@/app/try/DemoTagBox'

const US_STATES = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' }, { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' }, { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' }, { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' }, { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' }, { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' }, { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' }, { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' }, { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' }, { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' }, { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' }, { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' }, { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' }, { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' },
]

// Pre-filled so step 1 is NEVER a blank box — a blank field is a task, a filled one is a demo
// they only have to press. Deliberately spans all three modules (school + livestock + repair)
// so the first thing they see is the whole-life record, which is the moat.
const ONBOARDING_EXAMPLE =
  'Read two chapters of Farmer Boy with the kids, collected eggs, and fixed the coop latch'

const LEARNING_STYLES = [
  { value: 'eclectic', label: 'Eclectic', desc: 'Mix of approaches — whatever works' },
  { value: 'charlotte_mason', label: 'Charlotte Mason', desc: 'Living books, nature study, narration' },
  { value: 'unschooling', label: 'Unschooling', desc: 'Child-led, interest-based learning' },
  { value: 'structured', label: 'Structured / Classical', desc: 'Textbooks, schedules, traditional grades' },
  { value: 'project_based', label: 'Project-Based', desc: 'Learn through real-world projects' },
]

function LeafLogo() {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-9 h-9">
      <path d="M16 4C16 4 6 10 6 20C6 25.523 10.477 30 16 30C21.523 30 26 25.523 26 20C26 10 16 4 16 4Z" fill="url(#leafGradO)" />
      <path d="M16 4C16 4 6 10 6 20" stroke="#4ade80" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
      <path d="M16 30L16 12" stroke="#052e16" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <defs>
        <linearGradient id="leafGradO" x1="16" y1="4" x2="16" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4ade80" />
          <stop offset="100%" stopColor="#15803d" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`rounded-full transition-all ${
            i + 1 === current ? 'w-5 h-1.5 bg-green-500'
            : i + 1 < current ? 'w-1.5 h-1.5 bg-green-700'
            : 'w-1.5 h-1.5 bg-elevated'
          }`}
        />
      ))}
    </div>
  )
}

const MODULE_OPTIONS = [
  {
    key: 'homeschool' as const,
    emoji: '📚',
    label: 'We homeschool',
    desc: 'Track curriculum, log daily learning, manage compliance records and transcripts',
    activeCard: 'border-green-600 bg-green-50 dark:bg-green-950/30',
    activeIcon: 'bg-green-100 dark:bg-green-900/60',
    activeCheck: 'border-green-500 bg-green-500',
  },
  {
    key: 'homestead' as const,
    emoji: '🌾',
    label: 'We homestead',
    desc: 'Livestock production, garden tracking, food preservation — count it as school credit too',
    activeCard: 'border-amber-600 bg-amber-50 dark:bg-amber-950/20',
    activeIcon: 'bg-amber-100 dark:bg-amber-900/50',
    activeCheck: 'border-amber-500 bg-amber-500',
  },
  {
    key: 'homeDiy' as const,
    emoji: '🏠',
    label: 'We have home projects & equipment',
    desc: 'Track equipment maintenance, manage renovation projects and budgets',
    activeCard: 'border-sky-600 bg-sky-50 dark:bg-sky-950/20',
    activeIcon: 'bg-sky-100 dark:bg-sky-900/50',
    activeCheck: 'border-sky-500 bg-sky-500',
  },
]

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState(1)
  const [modules, setModules] = useState({ homeschool: false, homestead: false, homeDiy: false })
  const [childName, setChildName] = useState('')
  const [state, setState] = useState('MO')
  const [learningStyle, setLearningStyle] = useState('eclectic')
  const [showLearningStyle, setShowLearningStyle] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Step 1 is the demo — the aha lands BEFORE any configuration. New users gave the app
  // 25–76 seconds and never logged anything (measured 2026-07-24); if that is the whole
  // attention budget, a setup wizard spends all of it. Steps: 1 demo → 2 modules →
  // 3 child (homeschool only) → 4 ready.
  const homeschoolSelected = modules.homeschool
  const totalSteps = homeschoolSelected ? 4 : 3
  // Non-homeschool families skip step 3 entirely, so the final step (4) would light no dot in a
  // 3-dot track. Collapse it to the last position instead. (Pre-existing off-by-one, fixed here.)
  const displayStep = !homeschoolSelected && step === 4 ? 3 : step
  const nothingSelected = !modules.homeschool && !modules.homestead && !modules.homeDiy

  function toggleModule(key: keyof typeof modules) {
    setModules(prev => ({ ...prev, [key]: !prev[key] }))
  }

  async function handleStep2Next() {
    if (!childName.trim()) { setError("Child's name is required."); return }
    setSaving(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: child, error: childErr } = await supabase
      .from('children')
      .insert({ user_id: user.id, name: childName.trim(), learning_style: learningStyle })
      .select()
      .single()

    if (childErr) { setError(childErr.message); setSaving(false); return }

    const now = new Date()
    const yearStart = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
    await supabase.from('school_years').insert({
      user_id: user.id,
      child_id: child.id,
      name: `${yearStart}-${yearStart + 1}`,
      start_date: `${yearStart}-08-01`,
      end_date: `${yearStart + 1}-05-31`,
      state,
      is_active: true,
    })

    setSaving(false)
    setStep(4)
  }

  async function handleFinish(destination: string) {
    setSaving(true)
    await supabase.auth.updateUser({ data: { onboarding_completed: true } })
    router.push(destination)
  }

  function primaryDestination() {
    if (homeschoolSelected) return '/dashboard'
    if (modules.homestead) return '/dashboard/homestead'
    return '/dashboard/home-diy'
  }

  function primaryCTALabel() {
    if (homeschoolSelected) return 'Log your first school day →'
    if (modules.homestead) return 'Log your first homestead entry →'
    return 'Track your first project →'
  }

  return (
    <div className="min-h-screen bg-surface text-content flex items-start justify-center py-12 px-6">
      <div className="w-full max-w-lg">

        {/* Header */}
        <div className="flex items-center gap-3 mb-10">
          <LeafLogo />
          <div>
            <p className="text-lg font-bold text-content tracking-tight">Cultivate</p>
            <p className="text-subtle text-xs">Let&apos;s get you set up</p>
          </div>
          <div className="ml-auto">
            <StepDots current={displayStep} total={totalSteps} />
          </div>
        </div>

        {/* ── STEP 1: The aha — show the magic before asking for anything ── */}
        {step === 1 && (
          <div>
            <h1 className="text-2xl font-bold mb-2 tracking-tight">First, watch it work.</h1>
            <p className="text-muted text-sm mb-6">
              Type what you and the kids actually did today — the way you&apos;d say it out loud.
              This is a practice run; nothing is saved.
            </p>

            <DemoTagBox
              variant="app"
              source="onboarding"
              initialText={ONBOARDING_EXAMPLE}
              onContinue={() => setStep(2)}
              continueLabel="Got it — set up my account →"
            />

            <button
              onClick={() => setStep(2)}
              className="w-full mt-3 py-2.5 text-subtle hover:text-muted text-sm transition-colors"
            >
              Skip — take me to setup
            </button>
          </div>
        )}

        {/* ── STEP 2: Module selector ── */}
        {step === 2 && (
          <div>
            <h1 className="text-2xl font-bold mb-2 tracking-tight">What does your family do?</h1>
            <p className="text-muted text-sm mb-8">
              Select everything that applies. You can use any combination — that&apos;s the whole point.
            </p>

            <div className="space-y-3 mb-8">
              {MODULE_OPTIONS.map(item => {
                const active = modules[item.key]
                return (
                  <button
                    key={item.key}
                    onClick={() => toggleModule(item.key)}
                    className={`w-full flex items-start gap-4 p-4 rounded-xl border transition-all text-left ${
                      active ? item.activeCard : 'border-line hover:border-line-strong bg-card/40'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl shrink-0 mt-0.5 ${active ? item.activeIcon : 'bg-elevated'}`}>
                      {item.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-content">{item.label}</p>
                        <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${active ? item.activeCheck : 'border-line-strong'}`}>
                          {active && <span className="text-white text-xs font-bold">✓</span>}
                        </div>
                      </div>
                      <p className="text-muted text-sm mt-0.5">{item.desc}</p>
                    </div>
                  </button>
                )
              })}
            </div>

            <button
              onClick={() => setStep(homeschoolSelected ? 3 : 4)}
              disabled={nothingSelected}
              className="w-full py-3 px-4 bg-gradient-to-r from-green-700 to-green-600 hover:from-green-600 hover:to-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all shadow-lg shadow-green-900/30"
            >
              {nothingSelected ? 'Select at least one to continue' : 'Continue →'}
            </button>
          </div>
        )}

        {/* ── STEP 3: Child setup ── */}
        {step === 3 && (
          <div>
            <h1 className="text-2xl font-bold mb-2 tracking-tight">Set up your first learner</h1>
            <p className="text-muted text-sm mb-8">
              We&apos;ll use this to track records and match your state&apos;s compliance requirements.
              You can add more children and edit everything later.
            </p>

            <div className="space-y-5 mb-6">
              <div>
                <label className="block text-sm font-medium text-content mb-1.5" htmlFor="child-apos-s-name-1">
                  Child&apos;s name <span className="text-green-500">*</span>
                </label>
                <input id="child-apos-s-name-1"
                  type="text"
                  value={childName}
                  onChange={e => { setChildName(e.target.value); setError('') }}
                  placeholder="e.g. Emma"
                  autoFocus
                  className="w-full px-3.5 h-10 bg-card border border-line-strong rounded-lg text-content placeholder-subtle focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600/20 transition-colors text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-content mb-1.5" htmlFor="your-state-2">
                  Your state
                  <span className="text-subtle font-normal ml-1.5">— for compliance tracking</span>
                </label>
                <select id="your-state-2"
                  value={state}
                  onChange={e => setState(e.target.value)}
                  className="w-full h-10 px-3.5 bg-card border border-line-strong rounded-lg text-content focus:outline-none focus:border-green-600 text-sm"
                >
                  {US_STATES.map(s => (
                    <option key={s.code} value={s.code}>{s.name}</option>
                  ))}
                </select>
                <p className="text-xs text-subtle mt-1.5">
                  State data is for reference only — laws change. Verify at{' '}
                  <a href="https://hslda.org/legal" target="_blank" rel="noopener noreferrer" className="underline hover:text-muted">hslda.org/legal</a>.
                </p>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setShowLearningStyle(!showLearningStyle)}
                  className="text-sm text-subtle hover:text-muted transition-colors flex items-center gap-1.5"
                >
                  <span className="text-xs">{showLearningStyle ? '▾' : '▸'}</span>
                  Learning style (optional)
                </button>
                {showLearningStyle && (
                  <div className="mt-3 space-y-2">
                    {LEARNING_STYLES.map(s => (
                      <label
                        key={s.value}
                        htmlFor={`onb-ls-${s.value}`}
                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          learningStyle === s.value ? 'border-green-600 bg-green-50 dark:bg-green-950/25' : 'border-line hover:border-line-strong'
                        }`}
                      >
                        <input
                          id={`onb-ls-${s.value}`}
                          type="radio"
                          name="learningStyle"
                          value={s.value}
                          checked={learningStyle === s.value}
                          onChange={() => setLearningStyle(s.value)}
                          className="mt-0.5 accent-green-500"
                        />
                        <div>
                          <div className="text-sm font-medium text-content">{s.label}</div>
                          <div className="text-xs text-subtle">{s.desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/50 rounded-lg px-3.5 py-2.5 text-red-700 dark:text-red-400 text-sm mb-4">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <button
                onClick={handleStep2Next}
                disabled={saving}
                className="w-full py-3 px-4 bg-gradient-to-r from-green-700 to-green-600 hover:from-green-600 hover:to-green-500 disabled:opacity-60 text-white font-semibold rounded-xl transition-all shadow-lg shadow-green-900/30"
              >
                {saving ? 'Saving...' : 'Continue →'}
              </button>
              <button
                onClick={() => setStep(4)}
                className="w-full py-2.5 text-subtle hover:text-muted text-sm transition-colors"
              >
                Skip for now — I&apos;ll set this up later
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 4: Ready ── */}
        {step === 4 && (
          <div>
            <div className="text-center mb-10">
              <div className="text-5xl mb-4">🌱</div>
              <h1 className="text-2xl font-bold mb-2 tracking-tight">You&apos;re ready to grow.</h1>
              <p className="text-muted text-sm max-w-sm mx-auto">
                Cultivate is built for families like yours — people who live the homestead life
                and want their records to reflect it. The best first step is a simple one.
              </p>
            </div>

            <div className="bg-card/50 border border-line rounded-xl p-4 mb-8 space-y-2.5">
              {modules.homeschool && (
                <div className="flex items-center gap-2.5 text-sm">
                  <span className="text-green-500 font-bold">✓</span>
                  <span className="text-content">Homeschool — curriculum, attendance, transcripts</span>
                </div>
              )}
              {modules.homestead && (
                <div className="flex items-center gap-2.5 text-sm">
                  <span className="text-green-500 font-bold">✓</span>
                  <span className="text-content">Homestead — livestock, garden, food preservation</span>
                </div>
              )}
              {modules.homeDiy && (
                <div className="flex items-center gap-2.5 text-sm">
                  <span className="text-green-500 font-bold">✓</span>
                  <span className="text-content">Home & DIY — equipment, projects, budgets</span>
                </div>
              )}
              {!modules.homeschool && !modules.homestead && !modules.homeDiy && (
                <div className="flex items-center gap-2.5 text-sm">
                  <span className="text-green-500 font-bold">✓</span>
                  <span className="text-content">All modules ready — explore at your own pace</span>
                </div>
              )}
              {childName && (
                <div className="flex items-center gap-2.5 text-sm">
                  <span className="text-green-500 font-bold">✓</span>
                  <span className="text-content">{childName} added — records and reports ready to build</span>
                </div>
              )}
            </div>

            <button
              onClick={() => handleFinish(primaryDestination())}
              disabled={saving}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-green-700 to-green-600 hover:from-green-600 hover:to-green-500 disabled:opacity-60 text-white font-semibold rounded-xl transition-all shadow-lg shadow-green-900/30 mb-3"
            >
              {saving ? 'One moment...' : primaryCTALabel()}
            </button>

            <button
              onClick={() => handleFinish('/dashboard')}
              disabled={saving}
              className="w-full py-2.5 text-subtle hover:text-muted text-sm transition-colors"
            >
              Take me to my dashboard first
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
