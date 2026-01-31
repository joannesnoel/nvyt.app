import * as Sentry from '@sentry/nuxt'

export default defineEventHandler(() => {
  Sentry.captureException(new Error('Sentry server test - safe to ignore'))
  throw new Error('Sentry server test - unhandled')
})
