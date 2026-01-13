export default defineNuxtRouteMiddleware(async (to) => {
  const { user, isLoading } = useAuth()

  // Wait for auth to initialize
  if (isLoading.value) {
    return
  }

  // Redirect to login if not authenticated
  if (!user.value) {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }

  // Check admin status
  try {
    const { data } = await useFetch('/api/v1/admin/check')
    if (!data.value?.data?.isAdmin) {
      // Not an admin, redirect to dashboard
      return navigateTo('/dashboard')
    }
  } catch {
    // API error, redirect to dashboard
    return navigateTo('/dashboard')
  }
})
