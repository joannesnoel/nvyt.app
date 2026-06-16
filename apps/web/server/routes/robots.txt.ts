export default defineEventHandler((event) => {
  const config = useRuntimeConfig()
  const appUrl = (config.public.appUrl as string).replace(/\/$/, '')

  const lines = [
    'User-agent: *',
    'Disallow: /admin',
    'Disallow: /dashboard',
    'Disallow: /checkout',
    'Disallow: /orders',
    'Disallow: /tickets',
    'Disallow: /settings',
    'Disallow: /my-events',
    'Disallow: /setup-account',
    'Disallow: /verify-email',
    'Disallow: /forgot-password',
    'Disallow: /reset-password',
    'Disallow: /api/',
    '',
    `Sitemap: ${appUrl}/sitemap.xml`,
    '',
  ]

  setResponseHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  setResponseHeader(event, 'Cache-Control', 'public, max-age=3600')
  return lines.join('\n')
})
