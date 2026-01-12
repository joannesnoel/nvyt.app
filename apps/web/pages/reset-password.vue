<script setup lang="ts">
import { resetPasswordSchema } from '@nvyt/shared'

definePageMeta({
  layout: 'default',
})

const route = useRoute()
const toast = useToast()
const { isAuthenticated } = useAuth()

// Redirect if already logged in
watch(isAuthenticated, (value) => {
  if (value) {
    navigateTo('/dashboard')
  }
}, { immediate: true })

const token = computed(() => route.query.token as string | undefined)
const email = ref('')
const loading = ref(false)
const loadingToken = ref(true)
const error = ref('')
const tokenError = ref('')
const success = ref(false)

const form = reactive({
  password: '',
  confirmPassword: '',
})

// Verify token on mount
async function verifyToken() {
  if (!token.value) {
    tokenError.value = 'No reset token provided'
    loadingToken.value = false
    return
  }

  try {
    const response = await $fetch('/api/v1/auth/verify-reset-token', {
      query: { token: token.value },
    })
    if (response.success) {
      email.value = response.data.email || ''
    }
  } catch (e: any) {
    tokenError.value = e.data?.message || 'Invalid or expired reset link'
  } finally {
    loadingToken.value = false
  }
}

onMounted(() => {
  verifyToken()
})

async function handleSubmit() {
  // Validate
  const result = resetPasswordSchema.safeParse({
    token: token.value,
    password: form.password,
    confirmPassword: form.confirmPassword,
  })
  if (!result.success) {
    error.value = result.error.errors[0]?.message || 'Validation failed'
    return
  }

  loading.value = true
  error.value = ''

  try {
    await $fetch('/api/v1/auth/reset-password', {
      method: 'POST',
      body: {
        token: token.value,
        password: form.password,
        confirmPassword: form.confirmPassword,
      },
    })

    success.value = true
    toast.add({
      title: 'Password reset successful',
      description: 'You can now log in with your new password.',
      color: 'green',
    })
  } catch (e: any) {
    error.value = e.data?.message || 'Failed to reset password'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-[calc(100vh-200px)] flex items-center justify-center py-12 px-4">
    <div class="w-full max-w-md">
      <div class="text-center mb-8">
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
          Reset your password
        </h1>
        <p v-if="email && !tokenError" class="text-gray-600 dark:text-gray-400 mt-2">
          Enter a new password for {{ email }}
        </p>
      </div>

      <UCard>
        <!-- Loading State -->
        <div v-if="loadingToken" class="flex items-center justify-center py-8">
          <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-primary" />
        </div>

        <!-- Token Error State -->
        <div v-else-if="tokenError" class="text-center py-4">
          <div class="mx-auto w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
            <UIcon name="i-heroicons-exclamation-triangle" class="w-6 h-6 text-red-600" />
          </div>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Invalid Reset Link
          </h3>
          <p class="text-gray-600 dark:text-gray-400 mb-6">
            {{ tokenError }}
          </p>
          <UButton
            to="/forgot-password"
            color="primary"
          >
            Request New Reset Link
          </UButton>
        </div>

        <!-- Success State -->
        <div v-else-if="success" class="text-center py-4">
          <div class="mx-auto w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
            <UIcon name="i-heroicons-check-circle" class="w-6 h-6 text-green-600" />
          </div>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Password Reset Complete
          </h3>
          <p class="text-gray-600 dark:text-gray-400 mb-6">
            Your password has been successfully reset.
          </p>
          <UButton
            to="/login"
            color="primary"
          >
            Go to Login
          </UButton>
        </div>

        <!-- Form State -->
        <form v-else @submit.prevent="handleSubmit" class="space-y-4">
          <UAlert v-if="error" color="red" :title="error" />

          <UFormGroup label="New Password" name="password" hint="At least 8 characters with uppercase, lowercase, and number">
            <UInput
              v-model="form.password"
              type="password"
              placeholder="Enter new password"
              icon="i-heroicons-lock-closed"
              size="lg"
            />
          </UFormGroup>

          <UFormGroup label="Confirm New Password" name="confirmPassword">
            <UInput
              v-model="form.confirmPassword"
              type="password"
              placeholder="Confirm new password"
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
            Reset Password
          </UButton>
        </form>

        <template v-if="!loadingToken && !tokenError && !success" #footer>
          <p class="text-center text-sm text-gray-600 dark:text-gray-400">
            Remember your password?
            <NuxtLink to="/login" class="text-primary hover:underline font-medium">
              Back to login
            </NuxtLink>
          </p>
        </template>
      </UCard>
    </div>
  </div>
</template>
