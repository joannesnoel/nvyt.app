<script setup lang="ts">
import { forgotPasswordSchema } from '@nvyt/shared'

definePageMeta({
  layout: 'default',
})

const toast = useToast()
const { isAuthenticated } = useAuth()

// Redirect if already logged in
watch(isAuthenticated, (value) => {
  if (value) {
    navigateTo('/dashboard')
  }
}, { immediate: true })

const email = ref('')
const loading = ref(false)
const error = ref('')
const success = ref(false)

async function handleSubmit() {
  // Validate
  const result = forgotPasswordSchema.safeParse({ email: email.value })
  if (!result.success) {
    error.value = result.error.errors[0]?.message || 'Validation failed'
    return
  }

  loading.value = true
  error.value = ''

  try {
    await $fetch('/api/v1/auth/forgot-password', {
      method: 'POST',
      body: { email: email.value },
    })

    success.value = true
    toast.add({
      title: 'Email sent',
      description: 'Check your inbox for the password reset link.',
      color: 'green',
    })
  } catch (e: any) {
    error.value = e.data?.message || 'Failed to send reset email'
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
          Forgot your password?
        </h1>
        <p class="text-gray-600 dark:text-gray-400 mt-2">
          No worries, we'll send you reset instructions.
        </p>
      </div>

      <UCard>
        <!-- Success State -->
        <div v-if="success" class="text-center py-4">
          <div class="mx-auto w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
            <UIcon name="i-heroicons-envelope-open" class="w-6 h-6 text-green-600" />
          </div>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Check your email
          </h3>
          <p class="text-gray-600 dark:text-gray-400 mb-6">
            We sent a password reset link to<br>
            <strong>{{ email }}</strong>
          </p>
          <p class="text-sm text-gray-500 mb-4">
            Didn't receive the email? Check your spam folder or
          </p>
          <UButton
            color="gray"
            variant="outline"
            @click="success = false"
          >
            Try again
          </UButton>
        </div>

        <!-- Form State -->
        <form v-else @submit.prevent="handleSubmit" class="space-y-4">
          <UAlert v-if="error" color="red" :title="error" />

          <UFormGroup label="Email" name="email">
            <UInput
              v-model="email"
              type="email"
              placeholder="you@example.com"
              icon="i-heroicons-envelope"
              size="lg"
              autofocus
            />
          </UFormGroup>

          <UButton
            type="submit"
            color="primary"
            size="lg"
            block
            :loading="loading"
          >
            Send Reset Link
          </UButton>
        </form>

        <template #footer>
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
