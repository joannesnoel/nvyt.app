export default defineNuxtRouteMiddleware(async (to) => {
  // Only protect dashboard routes
  if (!to.path.startsWith('/dashboard')) {
    return
  }

  const { user, isLoading, fetchUser } = useAuth()

  // If still loading, wait for auth to initialize
  if (isLoading.value && !user.value) {
    await fetchUser()
  }

  // Redirect to login if not authenticated
  if (!user.value) {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }
})
