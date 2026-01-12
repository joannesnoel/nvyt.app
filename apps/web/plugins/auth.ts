export default defineNuxtPlugin(async () => {
  const { fetchUser } = useAuth()

  // Fetch user on app initialization (both server and client)
  await fetchUser()
})
