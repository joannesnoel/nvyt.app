export default defineNuxtRouteMiddleware((to) => {
  const { user, isLoading } = useAuth()

  // Wait for auth to initialize
  if (isLoading.value) {
    return
  }

  // Redirect to login if not authenticated
  if (!user.value) {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }
})
