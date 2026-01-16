<script setup lang="ts">
import { accountSetupSchema } from '@nvyt/shared'

definePageMeta({
  layout: 'default',
})

const route = useRoute()
const { fetchUser, isAuthenticated } = useAuth()
const toast = useToast()

// Redirect if already logged in
watch(isAuthenticated, (value) => {
  if (value) {
    navigateTo('/dashboard')
  }
}, { immediate: true })

const token = computed(() => route.query.token as string)

// Verify token on mount
const { data: tokenData, pending: verifying } = await useFetch(
  () => `/api/v1/auth/verify-setup-token?token=${token.value}`,
  {
    watch: [token],
    default: () => ({ data: { valid: false, expired: false, user: null } }),
  }
)

const tokenValid = computed(() => tokenData.value?.data?.valid)
const tokenExpired = computed(() => tokenData.value?.data?.expired)
const userEmail = computed(() => (tokenData.value?.data as { user?: { email?: string } | null })?.user?.email)
const userName = computed(() => (tokenData.value?.data as { user?: { name?: string } | null })?.user?.name)

const form = reactive({
  password: '',
  confirmPassword: '',
})

const loading = ref(false)
const error = ref('')

async function handleSubmit() {
  const result = accountSetupSchema.safeParse({ ...form, token: token.value })
  if (!result.success) {
    error.value = result.error.errors[0]?.message || 'Validation failed'
    return
  }

  loading.value = true
  error.value = ''

  try {
    await $fetch('/api/v1/auth/setup-account', {
      method: 'POST',
      body: { ...form, token: token.value },
    })

    toast.add({
      title: 'Account Setup Complete!',
      description: 'Welcome to nvyt. You are now logged in.',
      color: 'green',
    })

    await fetchUser()
    await navigateTo('/dashboard')
  } catch (e: any) {
    error.value = e.data?.message || 'Setup failed'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-[calc(100vh-200px)] flex items-center justify-center py-12 px-4">
    <div class="w-full max-w-md">
      <!-- Loading -->
      <div v-if="verifying" class="text-center">
        <UIcon name="i-heroicons-arrow-path" class="w-12 h-12 text-primary mx-auto mb-4 animate-spin" />
        <p class="text-gray-600 dark:text-gray-400">Verifying your link...</p>
      </div>

      <!-- Invalid/Expired Token -->
      <div v-else-if="!tokenValid" class="text-center">
        <UIcon
          :name="tokenExpired ? 'i-heroicons-clock' : 'i-heroicons-exclamation-triangle'"
          class="w-16 h-16 text-yellow-500 mx-auto mb-4"
        />
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {{ tokenExpired ? 'Link Expired' : 'Invalid Link' }}
        </h1>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          {{ tokenExpired
            ? 'This setup link has expired. You can request a new one or use forgot password.'
            : 'This setup link is invalid or has already been used.' }}
        </p>
        <div class="space-y-3">
          <UButton to="/login" color="primary" block>
            Go to Login
          </UButton>
          <p class="text-sm text-gray-500">
            Use "Need to set up account?" on the login page to get a new link.
          </p>
        </div>
      </div>

      <!-- Setup Form -->
      <div v-else>
        <div class="text-center mb-8">
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
            Set Up Your Account
          </h1>
          <p class="text-gray-600 dark:text-gray-400 mt-2">
            Create a password for <span class="font-medium">{{ userEmail }}</span>
          </p>
        </div>

        <UCard>
          <form @submit.prevent="handleSubmit" class="space-y-4">
            <UAlert v-if="error" color="red" :title="error" />

            <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-4">
              <p class="text-sm text-gray-600 dark:text-gray-400">
                Welcome, <span class="font-medium text-gray-900 dark:text-white">{{ userName }}</span>!
                Set a password to secure your account and access your tickets anytime.
              </p>
            </div>

            <UFormGroup label="Password" name="password" hint="At least 8 characters with uppercase, lowercase, and number">
              <UInput
                v-model="form.password"
                type="password"
                placeholder="Create a password"
                icon="i-heroicons-lock-closed"
                size="lg"
              />
            </UFormGroup>

            <UFormGroup label="Confirm Password" name="confirmPassword">
              <UInput
                v-model="form.confirmPassword"
                type="password"
                placeholder="Confirm your password"
                icon="i-heroicons-lock-closed"
                size="lg"
              />
            </UFormGroup>

            <UButton
              type="submit"
              color="primary"
              size="lg"
              block
              :loading="loading"
            >
              Complete Setup
            </UButton>
          </form>
        </UCard>
      </div>
    </div>
  </div>
</template>
