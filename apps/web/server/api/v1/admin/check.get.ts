// Admin emails (in production, use env variable or database role)
const ADMIN_EMAILS = ['jon@creativelogik.net']

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const isAdmin = ADMIN_EMAILS.includes(user.email)

  return successResponse({
    isAdmin,
  })
})
