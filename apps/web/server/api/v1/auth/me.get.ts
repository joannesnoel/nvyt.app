export default defineEventHandler(async (event) => {
  // Use getUserFromEvent instead of requireAuth to avoid 401 for guests
  const user = await getUserFromEvent(event)

  if (!user) {
    return successResponse(null)
  }

  return successResponse({
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
  })
})
