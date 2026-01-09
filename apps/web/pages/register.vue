<script setup lang="ts">
import { registerSchema, type RegisterInput } from '@nvyt/shared'

definePageMeta({
  layout: 'default',
})

const { register, isAuthenticated } = useAuth()
const toast = useToast()

// Redirect if already logged in
watch(isAuthenticated, (value) => {
  if (value) {
    navigateTo('/dashboard')
  }
}, { immediate: true })

const form = reactive<RegisterInput>({
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
})

const loading = ref(false)
const error = ref('')

async function handleSubmit() {
  // Validate
  const result = registerSchema.safeParse(form)
  if (!result.success) {
    error.value = result.error.errors[0]?.message || 'Validation failed'
    return
  }

  loading.value = true
  error.value = ''

  try {
    await register(form)

    toast.add({
      title: 'Account created!',
      description: 'Welcome to nvyt.',
      color: 'green',
    })

    await navigateTo('/dashboard')
  } catch (e: any) {
    error.value = e.data?.message || 'Registration failed'
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
          Create your account
        </h1>
        <p class="text-gray-600 dark:text-gray-400 mt-2">
          Start creating amazing events
        </p>
      </div>

      <UCard>
        <form @submit.prevent="handleSubmit" class="space-y-4">
          <UAlert v-if="error" color="red" :title="error" />

          <UFormGroup label="Name" name="name">
            <UInput
              v-model="form.name"
              type="text"
              placeholder="Your name"
              icon="i-heroicons-user"
              size="lg"
            />
          </UFormGroup>

          <UFormGroup label="Email" name="email">
            <UInput
              v-model="form.email"
              type="email"
              placeholder="you@example.com"
              icon="i-heroicons-envelope"
              size="lg"
            />
          </UFormGroup>

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
            Create Account
          </UButton>
        </form>

        <template #footer>
          <p class="text-center text-sm text-gray-600 dark:text-gray-400">
            Already have an account?
            <NuxtLink to="/login" class="text-primary hover:underline font-medium">
              Sign in
            </NuxtLink>
          </p>
        </template>
      </UCard>
    </div>
  </div>
</template>
