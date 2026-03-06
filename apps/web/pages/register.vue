<script setup lang="ts">
import { registerSchema, type RegisterInput } from '@nvyt/shared'

definePageMeta({
  layout: 'default',
})

useHead({ title: 'Register - NVYT' })

const route = useRoute()
const { register, isAuthenticated } = useAuth()
const toast = useToast()

// Check for invite token in URL
const inviteToken = computed(() => route.query.invite as string | undefined)
const inviteData = ref<{ email: string; eventTitle: string; eventId: string } | null>(null)
const loadingInvite = ref(false)

// Fetch invite data if token present
async function fetchInviteData() {
  if (!inviteToken.value) return

  loadingInvite.value = true
  try {
    const response = await $fetch('/api/v1/auth/verify-invite', {
      query: { token: inviteToken.value },
    })
    if (response.success && response.data) {
      inviteData.value = { ...response.data, email: response.data.email || '' }
      form.email = response.data.email || ''
    }
  } catch {
    // Invalid token, ignore and let user register normally
    inviteData.value = null
  } finally {
    loadingInvite.value = false
  }
}

onMounted(() => {
  fetchInviteData()
})

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
  const result = registerSchema.safeParse({
    ...form,
    inviteToken: inviteToken.value,
  })
  if (!result.success) {
    error.value = result.error.errors[0]?.message || 'Validation failed'
    return
  }

  loading.value = true
  error.value = ''

  try {
    const response = await register({
      ...form,
      inviteToken: inviteToken.value,
    })

    toast.add({
      title: 'Account created!',
      description: inviteData.value
        ? `Welcome to nvyt™! You're now a collaborator on "${inviteData.value.eventTitle}".`
        : 'Welcome to nvyt™.',
      color: 'green',
    })

    // Redirect to the event if coming from an invite, otherwise dashboard
    if (response?.linkedInvitation?.eventId) {
      await navigateTo(`/dashboard/events/${response.linkedInvitation.eventId}`)
    } else {
      await navigateTo('/dashboard')
    }
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
          {{ inviteData ? 'Accept Invitation' : 'Create your account' }}
        </h1>
        <p class="text-gray-600 dark:text-gray-400 mt-2">
          {{ inviteData ? `Join as a collaborator on "${inviteData.eventTitle}"` : 'Start creating amazing events' }}
        </p>
      </div>

      <UCard>
        <form @submit.prevent="handleSubmit" class="space-y-4">
          <div v-if="loadingInvite" class="flex items-center justify-center py-8">
            <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-primary" />
          </div>

          <template v-else>
          <UAlert v-if="error" color="red" :title="error" />

          <UAlert
            v-if="inviteData"
            color="blue"
            icon="i-heroicons-user-plus"
            title="You've been invited!"
            :description="`Create an account to collaborate on '${inviteData.eventTitle}'.`"
          />

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
              :disabled="!!inviteData"
            />
            <template v-if="inviteData" #hint>
              <span class="text-xs text-gray-500">Email is pre-filled from the invitation</span>
            </template>
          </UFormGroup>

          <UFormGroup label="Password" name="password" hint="Min 8 chars, uppercase, lowercase & number">
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
            :disabled="loadingInvite"
          >
            {{ inviteData ? 'Create Account & Accept' : 'Create Account' }}
          </UButton>
          </template>
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
