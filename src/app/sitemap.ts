import type { MetadataRoute } from 'next'
import { allStateSlugs } from '@/lib/stateSlug'

const BASE = (process.env.NEXT_PUBLIC_APP_URL || 'https://mycultivate.app').replace(/\/$/, '')
const LAST_MOD = new Date('2026-06-23')

export default function sitemap(): MetadataRoute.Sitemap {
  const statePages: MetadataRoute.Sitemap = allStateSlugs().map((slug) => ({
    url: `${BASE}/state-requirements/${slug}`,
    lastModified: LAST_MOD,
    changeFrequency: 'monthly',
    priority: 0.8,
  }))

  return [
    { url: `${BASE}/`, lastModified: LAST_MOD, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE}/state-requirements`, lastModified: LAST_MOD, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE}/pricing`, lastModified: LAST_MOD, changeFrequency: 'monthly', priority: 0.8 },
    ...statePages,
    { url: `${BASE}/privacy`, lastModified: LAST_MOD, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${BASE}/terms`, lastModified: LAST_MOD, changeFrequency: 'yearly', priority: 0.2 },
  ]
}
