'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { PlatformResource, ResourceSection } from '@/lib/types'

// What the browser is allowed to know about a resource. Deliberately omits `file_url`:
// the storage path is a server-side detail, and the download is authorized per-request by
// /api/resources/[id]/download. `can_download` drives the button; it never drives the gate.
export type ResourceCardData = Pick<
  PlatformResource,
  'id' | 'title' | 'description' | 'section' | 'tier' | 'file_type' | 'thumbnail_emoji'
> & {
  has_file: boolean
  can_download: boolean
}

const TABS: { key: ResourceSection; label: string; icon: string; color: string }[] = [
  { key: 'homeschool', label: 'Homeschool', icon: '📚', color: 'text-green-600 dark:text-green-400' },
  { key: 'homestead', label: 'Homestead', icon: '🌾', color: 'text-amber-600 dark:text-amber-400' },
  { key: 'home_diy', label: 'Home & DIY', icon: '🏠', color: 'text-sky-600 dark:text-sky-400' },
]

const FILE_TYPE_LABELS: Record<string, string> = {
  pdf: 'PDF',
  spreadsheet: 'Spreadsheet',
  doc: 'Doc',
  link: 'Link',
  other: 'File',
}

const FILE_TYPE_COLORS: Record<string, string> = {
  pdf: 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-950/40',
  spreadsheet: 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/40',
  doc: 'text-sky-700 bg-sky-50 dark:text-sky-400 dark:bg-sky-950/40',
  link: 'text-purple-700 bg-purple-50 dark:text-purple-400 dark:bg-purple-950/40',
  other: 'text-muted bg-elevated',
}

export default function ResourcesClient({
  resources,
  defaultTab,
}: {
  resources: ResourceCardData[]
  defaultTab: ResourceSection
}) {
  const [tab, setTab] = useState<ResourceSection>(defaultTab)

  const tabResources = resources.filter(r => r.section === tab)
  const free = tabResources.filter(r => r.tier === 'free')
  const subscriber = tabResources.filter(r => r.tier === 'subscriber')

  const activeTab = TABS.find(t => t.key === tab)!

  return (
    <div className="min-h-screen bg-surface text-content">
      <nav className="border-b border-line/60 px-6 py-4 flex items-center gap-3">
        <Link href="/dashboard" className="text-subtle hover:text-content text-sm transition-colors">
          ← Home
        </Link>
        <span className="text-subtle">/</span>
        <span className="text-sm font-semibold text-content">Resources</span>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h2 className="text-xl font-bold mb-1 tracking-tight">Resources</h2>
          <p className="text-muted text-sm">
            Printables, planners, and worksheets for your homestead and homeschool.
          </p>
        </div>

        {/* Section tabs */}
        <div className="flex gap-1 mb-8 bg-card/60 border border-line/60 rounded-xl p-1">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'bg-elevated text-content'
                  : 'text-subtle hover:text-content'
              }`}
            >
              <span className="text-base leading-none">{t.icon}</span>
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>

        {/* Free resources */}
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-xs font-semibold text-subtle uppercase tracking-widest">Free</h3>
            <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 px-2 py-0.5 rounded-full font-medium">
              Open to all
            </span>
          </div>

          {free.length === 0 ? (
            <div className="bg-card/40 border border-line/60 border-dashed rounded-xl px-6 py-10 text-center">
              <div className="text-3xl mb-3">{activeTab.icon}</div>
              <p className="text-content text-sm font-medium mb-1">Free {activeTab.label.toLowerCase()} resources are on the way</p>
              <p className="text-subtle text-xs leading-relaxed max-w-xs mx-auto">We&apos;re adding printables, planners, and guides regularly. Check back soon — or suggest something you&apos;d find useful.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {free.map(r => <ResourceCard key={r.id} resource={r} />)}
            </div>
          )}
        </section>

        {/* Subscriber resources */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-xs font-semibold text-subtle uppercase tracking-widest">Subscriber</h3>
            <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">
              Included with plan
            </span>
          </div>

          {subscriber.length === 0 ? (
            <div className="bg-card/40 border border-line/60 border-dashed rounded-xl px-6 py-10 text-center">
              <div className="text-3xl mb-3">📦</div>
              <p className="text-content text-sm font-medium mb-1">Subscriber resources are being built now</p>
              <p className="text-subtle text-xs leading-relaxed max-w-xs mx-auto">Exclusive templates, record-keeping tools, and curriculum supplements for {activeTab.label.toLowerCase()} families. Coming soon with your subscription.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {subscriber.map(r => <ResourceCard key={r.id} resource={r} />)}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

function ResourceCard({ resource }: { resource: ResourceCardData }) {
  const fileLabel = FILE_TYPE_LABELS[resource.file_type] ?? 'File'
  const fileColor = FILE_TYPE_COLORS[resource.file_type] ?? FILE_TYPE_COLORS.other

  return (
    <div className="bg-card/60 border border-line hover:border-line-strong rounded-xl p-4 transition-colors flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-elevated flex items-center justify-center text-xl shrink-0">
          {resource.thumbnail_emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-content leading-snug">{resource.title}</div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${fileColor}`}>
              {fileLabel}
            </span>
            {resource.tier === 'subscriber' && (
              <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                Subscriber
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      {resource.description && (
        <p className="text-muted text-xs leading-relaxed">{resource.description}</p>
      )}

      {/* Action. The href is the gated ROUTE, never the storage path — it re-checks entitlement
          server-side and hands back a 60-second signed URL. */}
      {resource.can_download ? (
        <a
          href={`/api/resources/${resource.id}/download`}
          className="mt-auto flex items-center justify-center gap-1.5 bg-green-700 hover:bg-green-600 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
        >
          ↓ Download
        </a>
      ) : resource.has_file ? (
        // A gated pack this viewer can't have. Lapsed and never-subscribed users are already
        // redirected out of /dashboard, so today this renders for nobody — it exists so the
        // button can never be more permissive than the route behind it.
        <Link
          href="/pricing"
          className="mt-auto flex items-center justify-center gap-1.5 bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-900/60 text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
        >
          🔒 Included with a subscription
        </Link>
      ) : (
        <div className="mt-auto flex items-center justify-center gap-1.5 bg-elevated/60 text-subtle text-xs font-medium px-3 py-2 rounded-lg cursor-default">
          Coming soon
        </div>
      )}
    </div>
  )
}
