import type { MetadataRoute } from 'next'

const BASE = (process.env.NEXT_PUBLIC_APP_URL || 'https://mycultivate.app').replace(/\/$/, '')

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Auth-gated / non-indexable surfaces
      disallow: ['/dashboard/', '/account', '/api/', '/auth/', '/reset-password', '/invite/'],
    },
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  }
}
