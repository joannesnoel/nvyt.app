import * as Sentry from '@sentry/nuxt'

const dsn = useRuntimeConfig().public.sentryDsn as string

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    integrations: [Sentry.replayIntegration()],
    beforeSend(event) {
      // Ignore errors from Facebook in-app browser autofill injection
      const frames = event.exception?.values?.[0]?.stacktrace?.frames
      if (frames?.some((f) => f.function?.includes('setContactAutofillValuesFromBridge'))) {
        return null
      }
      return event
    },
    ignoreErrors: [
      // Facebook in-app browser internal errors - not caused by app code
      "undefined is not an object (evaluating 'window.webkit.messageHandlers')",
    ],
  })
}
