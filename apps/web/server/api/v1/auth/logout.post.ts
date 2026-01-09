export default defineEventHandler(async (event) => {
  await destroySession(event)
  return successResponse({ message: 'Logged out successfully' })
})
