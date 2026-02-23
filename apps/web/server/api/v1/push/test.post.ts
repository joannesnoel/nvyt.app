export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const sent = await sendPushToUser(user.id, {
    title: 'nvyt',
    body: 'Push notifications are working!',
    url: '/settings',
    tag: 'test-notification',
  })

  return successResponse({ sent })
})
