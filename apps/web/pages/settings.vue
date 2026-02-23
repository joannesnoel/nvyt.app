<script setup lang="ts">
definePageMeta({
  layout: 'default',
  middleware: 'auth',
})

const { user, fetchUser } = useAuth()
const toast = useToast()
const webPush = useWebPush()

// Form state
const name = ref('')
const birthdate = ref('')
const avatarUrl = ref('')

// Password change
const currentPassword = ref('')
const newPassword = ref('')
const confirmNewPassword = ref('')
const showPasswordSection = ref(false)

// Loading states
const isSaving = ref(false)
const isChangingPassword = ref(false)
const isTestingPush = ref(false)

// Push notification state
const pushEnabled = computed(() => webPush.isSubscribed.value)

onMounted(() => {
  webPush.checkSubscription()
})

async function togglePush() {
  if (webPush.isSubscribed.value) {
    await webPush.unsubscribe()
    toast.add({ title: 'Push Notifications', description: 'Push notifications disabled', color: 'gray' })
  } else {
    const ok = await webPush.subscribe()
    if (ok) {
      toast.add({ title: 'Push Notifications', description: 'Push notifications enabled', color: 'green' })
    } else if (webPush.permission.value === 'denied') {
      toast.add({ title: 'Permission Denied', description: 'Please allow notifications in your browser settings', color: 'red' })
    }
  }
}

async function testPush() {
  isTestingPush.value = true
  try {
    await $fetch('/api/v1/push/test', { method: 'POST' })
    toast.add({ title: 'Test Sent', description: 'You should receive a test notification shortly', color: 'green' })
  } catch {
    toast.add({ title: 'Error', description: 'Failed to send test notification', color: 'red' })
  } finally {
    isTestingPush.value = false
  }
}

// Initialize form with user data
watchEffect(() => {
  if (user.value) {
    name.value = user.value.name || ''
  }
})

// Fetch full user data including birthdate
const { data: userData, refresh: refreshUserData } = await useFetch('/api/v1/auth/me')

watchEffect(() => {
  if (userData.value?.data) {
    const data = userData.value.data as { name: string; birthdate?: string; avatarUrl?: string }
    name.value = data.name || ''
    birthdate.value = data.birthdate || ''
    avatarUrl.value = data.avatarUrl || ''
  }
})

// Check if user has password (not OAuth-only)
const hasPassword = computed(() => {
  // If user logged in with email/password, they have a password
  // OAuth-only users won't have a password hash
  return true // We'll handle the error on the backend if they try to change password
})

async function saveProfile() {
  if (!name.value.trim()) {
    toast.add({
      title: 'Validation Error',
      description: 'Name is required',
      color: 'red',
    })
    return
  }

  isSaving.value = true
  try {
    await $fetch('/api/v1/auth/me', {
      method: 'PATCH',
      body: {
        name: name.value.trim(),
        birthdate: birthdate.value || null,
        avatarUrl: avatarUrl.value || null,
      },
    })

    toast.add({
      title: 'Profile Updated',
      description: 'Your profile has been updated successfully',
      color: 'green',
    })

    // Refresh user data
    await fetchUser()
    await refreshUserData()
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to update profile',
      color: 'red',
    })
  } finally {
    isSaving.value = false
  }
}

async function changePassword() {
  if (!currentPassword.value || !newPassword.value || !confirmNewPassword.value) {
    toast.add({
      title: 'Validation Error',
      description: 'All password fields are required',
      color: 'red',
    })
    return
  }

  if (newPassword.value.length < 8) {
    toast.add({
      title: 'Validation Error',
      description: 'New password must be at least 8 characters',
      color: 'red',
    })
    return
  }

  if (newPassword.value !== confirmNewPassword.value) {
    toast.add({
      title: 'Validation Error',
      description: 'New passwords do not match',
      color: 'red',
    })
    return
  }

  isChangingPassword.value = true
  try {
    await $fetch('/api/v1/auth/me', {
      method: 'PATCH',
      body: {
        currentPassword: currentPassword.value,
        newPassword: newPassword.value,
        confirmNewPassword: confirmNewPassword.value,
      },
    })

    toast.add({
      title: 'Password Changed',
      description: 'Your password has been updated successfully',
      color: 'green',
    })

    // Clear password fields
    currentPassword.value = ''
    newPassword.value = ''
    confirmNewPassword.value = ''
    showPasswordSection.value = false
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to change password',
      color: 'red',
    })
  } finally {
    isChangingPassword.value = false
  }
}
</script>

<template>
  <div class="py-12">
    <div class="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <div class="mb-8">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
          Account Settings
        </h1>
        <p class="text-gray-600 dark:text-gray-400 mt-1">
          Manage your account information and security settings
        </p>
      </div>

      <!-- Profile Section -->
      <UCard class="mb-6">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-user-circle" class="w-5 h-5 text-primary" />
            <h2 class="font-semibold text-gray-900 dark:text-white">Profile Information</h2>
          </div>
        </template>

        <div class="space-y-4">
          <UFormGroup label="Email" hint="Email cannot be changed">
            <UInput
              :model-value="user?.email"
              disabled
              icon="i-heroicons-envelope"
            />
          </UFormGroup>

          <UFormGroup label="Name" required>
            <UInput
              v-model="name"
              placeholder="Your full name"
              icon="i-heroicons-user"
            />
          </UFormGroup>

          <UFormGroup label="Birthdate" hint="Used for identity verification at events">
            <UInput
              v-model="birthdate"
              type="date"
              icon="i-heroicons-calendar"
            />
          </UFormGroup>

          <UFormGroup label="Avatar URL" hint="Optional: URL to your profile picture">
            <UInput
              v-model="avatarUrl"
              type="url"
              placeholder="https://example.com/avatar.jpg"
              icon="i-heroicons-photo"
            />
          </UFormGroup>

          <!-- Avatar Preview -->
          <div v-if="avatarUrl" class="flex items-center gap-4">
            <span class="text-sm text-gray-500">Preview:</span>
            <img
              :src="avatarUrl"
              alt="Avatar preview"
              class="w-16 h-16 rounded-full object-cover border-2 border-gray-200 dark:border-gray-700"
              @error="($event.target as HTMLImageElement).style.display = 'none'"
            >
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end">
            <UButton
              color="primary"
              :loading="isSaving"
              @click="saveProfile"
            >
              Save Changes
            </UButton>
          </div>
        </template>
      </UCard>

      <!-- Security Section -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-shield-check" class="w-5 h-5 text-primary" />
            <h2 class="font-semibold text-gray-900 dark:text-white">Security</h2>
          </div>
        </template>

        <div class="space-y-4">
          <!-- Email Verification Status -->
          <div class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div class="flex items-center gap-3">
              <UIcon
                :name="user?.emailVerified ? 'i-heroicons-check-badge' : 'i-heroicons-exclamation-triangle'"
                :class="user?.emailVerified ? 'text-green-500' : 'text-yellow-500'"
                class="w-5 h-5"
              />
              <div>
                <p class="font-medium text-gray-900 dark:text-white">Email Verification</p>
                <p class="text-sm text-gray-500">
                  {{ user?.emailVerified ? 'Your email is verified' : 'Your email is not verified' }}
                </p>
              </div>
            </div>
            <UBadge
              :color="user?.emailVerified ? 'green' : 'yellow'"
              variant="soft"
            >
              {{ user?.emailVerified ? 'Verified' : 'Pending' }}
            </UBadge>
          </div>

          <!-- Password Change -->
          <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
            <div class="flex items-center justify-between mb-4">
              <div>
                <p class="font-medium text-gray-900 dark:text-white">Password</p>
                <p class="text-sm text-gray-500">Change your account password</p>
              </div>
              <UButton
                v-if="!showPasswordSection"
                color="gray"
                variant="outline"
                @click="showPasswordSection = true"
              >
                Change Password
              </UButton>
            </div>

            <div v-if="showPasswordSection" class="space-y-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <UFormGroup label="Current Password" required>
                <UInput
                  v-model="currentPassword"
                  type="password"
                  placeholder="Enter your current password"
                />
              </UFormGroup>

              <UFormGroup label="New Password" required hint="Minimum 8 characters">
                <UInput
                  v-model="newPassword"
                  type="password"
                  placeholder="Enter new password"
                />
              </UFormGroup>

              <UFormGroup label="Confirm New Password" required>
                <UInput
                  v-model="confirmNewPassword"
                  type="password"
                  placeholder="Confirm new password"
                />
              </UFormGroup>

              <div class="flex justify-end gap-3">
                <UButton
                  color="gray"
                  variant="outline"
                  @click="showPasswordSection = false; currentPassword = ''; newPassword = ''; confirmNewPassword = ''"
                >
                  Cancel
                </UButton>
                <UButton
                  color="primary"
                  :loading="isChangingPassword"
                  @click="changePassword"
                >
                  Update Password
                </UButton>
              </div>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Push Notifications Section -->
      <UCard class="mt-6">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-bell" class="w-5 h-5 text-primary" />
            <h2 class="font-semibold text-gray-900 dark:text-white">Push Notifications</h2>
          </div>
        </template>

        <div class="space-y-4">
          <div v-if="!webPush.isSupported.value" class="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-yellow-500" />
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Push notifications are not supported on this browser.
            </p>
          </div>

          <template v-else>
            <div class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div>
                <p class="font-medium text-gray-900 dark:text-white">Enable Push Notifications</p>
                <p class="text-sm text-gray-500">
                  Receive notifications for support replies and updates
                </p>
              </div>
              <UToggle
                :model-value="pushEnabled"
                :loading="webPush.isLoading.value"
                @change="togglePush"
              />
            </div>

            <div v-if="webPush.permission.value === 'denied'" class="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <UIcon name="i-heroicons-x-circle" class="w-5 h-5 text-red-500" />
              <p class="text-sm text-red-600 dark:text-red-400">
                Notifications are blocked. Please enable them in your browser settings.
              </p>
            </div>

            <div v-if="webPush.isSubscribed.value" class="flex justify-end">
              <UButton
                color="gray"
                variant="outline"
                size="sm"
                :loading="isTestingPush"
                icon="i-heroicons-paper-airplane"
                @click="testPush"
              >
                Send Test Notification
              </UButton>
            </div>
          </template>
        </div>
      </UCard>

      <!-- Account Info -->
      <div class="mt-6 text-center text-sm text-gray-500">
        <p>
          Member since {{ userData?.data?.createdAt ? new Date(userData.data.createdAt as string).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '—' }}
        </p>
      </div>
    </div>
  </div>
</template>
