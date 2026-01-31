import * as Sentry from '@sentry/nuxt'

const dsn = useRuntimeConfig().public.sentryDsn as string

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    integrations: [Sentry.replayIntegration()],
    ignoreErrors: [
      // Facebook iOS in-app browser internal error - not caused by app code
      "undefined is not an object (evaluating 'window.webkit.messageHandlers')",
    ],
  })
}
