export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  return successResponse({
    isAdmin: isAdmin(user.email),
  })
})
