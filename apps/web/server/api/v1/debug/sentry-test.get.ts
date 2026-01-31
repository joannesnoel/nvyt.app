export default defineEventHandler(() => {
  throw createError({
    statusCode: 500,
    message: 'Sentry test error - safe to ignore',
  })
})
