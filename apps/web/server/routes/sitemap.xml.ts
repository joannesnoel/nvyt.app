import { eq, and, desc } from 'drizzle-orm'
import { events } from '@nvyt/db'

const STATIC_PATHS: Array<{ path: string; changefreq: string; priority: string }> = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/events', changefreq: 'daily', priority: '0.9' },
  { path: '/pricing', changefreq: 'monthly', priority: '0.7' },
  { path: '/login', changefreq: 'yearly', priority: '0.3' },
  { path: '/register', changefreq: 'yearly', priority: '0.4' },
  { path: '/privacy', changefreq: 'yearly', priority: '0.3' },
  { path: '/terms', changefreq: 'yearly', priority: '0.3' },
  { path: '/refunds', changefreq: 'yearly', priority: '0.3' },
]

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const appUrl = (config.public.appUrl as string).replace(/\/$/, '')

  const db = useDatabase()
  const publicEvents = await db
    .select({
      slug: events.slug,
      updatedAt: events.updatedAt,
    })
    .from(events)
    .where(and(eq(events.visibility, 'public'), eq(events.status, 'published')))
    .orderBy(desc(events.updatedAt))
    .limit(50000)

  const urls: string[] = []

  for (const entry of STATIC_PATHS) {
    urls.push(
      `<url><loc>${escapeXml(appUrl + entry.path)}</loc>` +
        `<changefreq>${entry.changefreq}</changefreq>` +
        `<priority>${entry.priority}</priority></url>`,
    )
  }

  for (const e of publicEvents) {
    const lastmod = e.updatedAt instanceof Date ? e.updatedAt.toISOString() : new Date(e.updatedAt).toISOString()
    urls.push(
      `<url><loc>${escapeXml(`${appUrl}/events/${e.slug}`)}</loc>` +
        `<lastmod>${lastmod}</lastmod>` +
        `<changefreq>daily</changefreq>` +
        `<priority>0.8</priority></url>`,
    )
  }

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.join('\n') +
    `\n</urlset>\n`

  setResponseHeader(event, 'Content-Type', 'application/xml; charset=utf-8')
  setResponseHeader(event, 'Cache-Control', 'public, max-age=600')
  return body
})
