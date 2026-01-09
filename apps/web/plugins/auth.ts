export default defineNuxtPlugin(async () => {
  const { fetchUser } = useAuth()
  
  // Fetch user on app initialization (only on client)
  if (import.meta.client) {
    await fetchUser()
  }
})
