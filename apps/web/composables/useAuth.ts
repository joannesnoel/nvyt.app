export interface User {
  id: string
  name: string
  email: string
  avatarUrl?: string | null
  emailVerified?: boolean
  isAdmin?: boolean
}

export const useAuth = () => {
  const user = useState<User | null>('auth-user', () => null)
  const isLoading = useState('auth-loading', () => true)
  const isAuthenticated = computed(() => !!user.value)

  // Fetch current user
  async function fetchUser() {
    isLoading.value = true
    try {
      // Use useRequestFetch to forward cookies during SSR
      const requestFetch = import.meta.server ? useRequestFetch() : $fetch
      const response = await requestFetch('/api/v1/auth/me')
      if (response.success && response.data) {
        user.value = response.data as User
      } else {
        user.value = null
      }
    } catch {
      user.value = null
    } finally {
      isLoading.value = false
    }
  }

  // Login
  async function login(email: string, password: string) {
    const response = await $fetch('/api/v1/auth/login', {
      method: 'POST',
      body: { email, password },
    })

    if (response.success && response.data) {
      user.value = response.data.user as User
      return response.data
    }

    throw new Error('Login failed')
  }

  // Register
  async function register(data: { name: string; email: string; password: string; confirmPassword: string; inviteToken?: string }) {
    const response = await $fetch('/api/v1/auth/register', {
      method: 'POST',
      body: data,
    })

    if (response.success && response.data) {
      user.value = response.data.user as User
      return response.data
    }

    throw new Error('Registration failed')
  }

  // Logout
  async function logout() {
    try {
      await $fetch('/api/v1/auth/logout', { method: 'POST' })
    } finally {
      user.value = null
      await navigateTo('/login')
    }
  }

  return {
    user,
    isLoading,
    isAuthenticated,
    fetchUser,
    login,
    register,
    logout,
  }
}
