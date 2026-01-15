<script setup lang="ts">
definePageMeta({
  layout: 'default',
})

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { fetchUser } = useAuth()

const token = computed(() => route.query.token as string | undefined)
const verifying = ref(true)
const verified = ref(false)
const error = ref<string | null>(null)

// Verify email on page load
onMounted(async () => {
  if (!token.value) {
    error.value = 'No verification token provided'
    verifying.value = false
    return
  }

  try {
    await $fetch('/api/v1/auth/verify-email', {
      method: 'POST',
      body: { token: token.value },
    })

    // Refresh user state to update emailVerified
    await fetchUser()

    verified.value = true
    toast.add({
      title: 'Email Verified',
      description: 'Your email has been verified successfully!',
      color: 'green',
      icon: 'i-heroicons-check-circle',
    })
  } catch (e: any) {
    error.value = e.data?.message || 'Failed to verify email'
  } finally {
    verifying.value = false
  }
})

function goToDashboard() {
  router.push('/dashboard')
}

function goToLogin() {
  router.push('/login')
}
</script>

<template>
  <div class="min-h-[70vh] flex items-center justify-center py-12">
    <div class="max-w-md mx-auto px-4 text-center">
      <!-- Verifying -->
      <div v-if="verifying">
        <UIcon name="i-heroicons-arrow-path" class="w-16 h-16 text-primary mx-auto mb-4 animate-spin" />
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">Verifying Email</h1>
        <p class="text-gray-600 dark:text-gray-400">Please wait...</p>
      </div>

      <!-- Success -->
      <div v-else-if="verified">
        <div class="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
          <UIcon name="i-heroicons-check-circle" class="w-12 h-12 text-green-500" />
        </div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">Email Verified!</h1>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          Your email has been verified successfully. You now have full access to all features.
        </p>
        <UButton color="primary" size="lg" @click="goToDashboard">
          Go to Dashboard
        </UButton>
      </div>

      <!-- Error -->
      <div v-else>
        <div class="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
          <UIcon name="i-heroicons-x-circle" class="w-12 h-12 text-red-500" />
        </div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">Verification Failed</h1>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          {{ error }}
        </p>
        <div class="space-y-3">
          <UButton color="primary" size="lg" block @click="goToLogin">
            Go to Login
          </UButton>
          <p class="text-sm text-gray-500">
            You can request a new verification link from your account settings.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
