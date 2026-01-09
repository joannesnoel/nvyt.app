export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  return successResponse({
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
  })
})
