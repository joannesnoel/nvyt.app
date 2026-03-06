<script setup lang="ts">
import { loginSchema, type LoginInput } from '@nvyt/shared'

definePageMeta({
  layout: 'default',
})

useHead({ title: 'Login - NVYT' })

const route = useRoute()
const { login, isAuthenticated } = useAuth()
const toast = useToast()

// Redirect if already logged in
watch(isAuthenticated, (value) => {
  if (value) {
    const redirect = route.query.redirect as string
    navigateTo(redirect || '/dashboard')
  }
}, { immediate: true })

const form = reactive<LoginInput>({
  email: '',
  password: '',
})

const loading = ref(false)
const error = ref('')

async function handleSubmit() {
  // Validate
  const result = loginSchema.safeParse(form)
  if (!result.success) {
    error.value = result.error.errors[0]?.message || 'Validation failed'
    return
  }

  loading.value = true
  error.value = ''

  try {
    const data = await login(form.email, form.password)

    toast.add({
      title: 'Welcome back!',
      description: `Logged in as ${data.user.name}`,
      color: 'green',
    })

    const redirect = route.query.redirect as string
    await navigateTo(redirect || '/dashboard')
  } catch (e: any) {
    error.value = e.data?.message || 'Login failed'
  } finally {
    loading.value = false
  }
}

// Setup link modal
const showSetupLinkModal = ref(false)
const setupLinkEmail = ref('')
const setupLinkLoading = ref(false)
const setupLinkSent = ref(false)

function openSetupLinkModal() {
  setupLinkEmail.value = form.email || ''
  setupLinkSent.value = false
  showSetupLinkModal.value = true
}

async function requestSetupLink() {
  if (!setupLinkEmail.value || !setupLinkEmail.value.includes('@')) {
    toast.add({
      title: 'Valid Email Required',
      description: 'Please enter a valid email address.',
      color: 'yellow',
    })
    return
  }

  setupLinkLoading.value = true
  try {
    await $fetch('/api/v1/auth/resend-setup-link', {
      method: 'POST',
      body: { email: setupLinkEmail.value },
    })
    setupLinkSent.value = true
  } catch (e: any) {
    toast.add({
      title: 'Request Failed',
      description: e.data?.message || 'Failed to send setup link. Please try again.',
      color: 'red',
    })
  } finally {
    setupLinkLoading.value = false
  }
}
</script>

<template>
  <div class="min-h-[calc(100vh-200px)] flex items-center justify-center py-12 px-4">
    <div class="w-full max-w-md">
      <div class="text-center mb-8">
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
          Welcome back
        </h1>
        <p class="text-gray-600 dark:text-gray-400 mt-2">
          Sign in to your account
        </p>
      </div>

      <UCard>
        <form method="post" @submit.prevent="handleSubmit" class="space-y-4">
          <UAlert v-if="error" color="red" :title="error" />

          <UFormGroup label="Email" name="email">
            <UInput
              v-model="form.email"
              type="email"
              placeholder="you@example.com"
              icon="i-heroicons-envelope"
              size="lg"
            />
          </UFormGroup>

          <UFormGroup label="Password" name="password">
            <UInput
              v-model="form.password"
              type="password"
              placeholder="Enter your password"
              icon="i-heroicons-lock-closed"
              size="lg"
            />
          </UFormGroup>

          <div class="flex items-center justify-between">
            <UCheckbox label="Remember me" />
            <NuxtLink to="/forgot-password" class="text-sm text-primary hover:underline">
              Forgot password?
            </NuxtLink>
          </div>

          <UButton
            type="submit"
            color="primary"
            size="lg"
            block
            :loading="loading"
          >
            Sign In
          </UButton>
        </form>

        <template #footer>
          <div class="space-y-3">
            <p class="text-center text-sm text-gray-600 dark:text-gray-400">
              Don't have an account?
              <NuxtLink to="/register" class="text-primary hover:underline font-medium">
                Sign up
              </NuxtLink>
            </p>
            <p class="text-center text-sm text-gray-500">
              Purchased tickets as a guest?
              <button
                type="button"
                class="text-primary hover:underline font-medium"
                @click="openSetupLinkModal"
              >
                Set up your account
              </button>
            </p>
          </div>
        </template>
      </UCard>
    </div>

    <!-- Setup Link Modal -->
    <UModal v-model="showSetupLinkModal">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Set Up Your Account
            </h3>
            <UButton
              color="gray"
              variant="ghost"
              icon="i-heroicons-x-mark"
              @click="showSetupLinkModal = false"
            />
          </div>
        </template>

        <!-- Success State -->
        <div v-if="setupLinkSent" class="text-center py-4">
          <div class="mx-auto w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
            <UIcon name="i-heroicons-check" class="w-6 h-6 text-green-600 dark:text-green-400" />
          </div>
          <h4 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
            Check Your Email
          </h4>
          <p class="text-gray-600 dark:text-gray-400 text-sm">
            If an account exists with this email and needs setup, we've sent a link to complete your account setup.
          </p>
        </div>

        <!-- Request Form -->
        <div v-else class="space-y-4">
          <p class="text-sm text-gray-600 dark:text-gray-400">
            If you purchased tickets as a guest and haven't set up a password yet, enter your email to receive a setup link.
          </p>
          <UFormGroup label="Email Address" name="setupEmail">
            <UInput
              v-model="setupLinkEmail"
              type="email"
              placeholder="Enter the email you used for purchase"
              icon="i-heroicons-envelope"
              size="lg"
            />
          </UFormGroup>
        </div>

        <template #footer v-if="!setupLinkSent">
          <div class="flex justify-end gap-3">
            <UButton
              color="gray"
              variant="outline"
              @click="showSetupLinkModal = false"
            >
              Cancel
            </UButton>
            <UButton
              color="primary"
              :loading="setupLinkLoading"
              @click="requestSetupLink"
            >
              Send Setup Link
            </UButton>
          </div>
        </template>

        <template #footer v-else>
          <div class="flex justify-end">
            <UButton
              color="primary"
              @click="showSetupLinkModal = false"
            >
              Done
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
