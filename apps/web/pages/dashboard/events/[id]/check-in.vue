<script setup lang="ts">
definePageMeta({
  layout: 'default',
})

const route = useRoute()
const eventId = computed(() => route.params.id as string)
const toast = useToast()

// Manual entry mode
const qrInput = ref('')
const isProcessing = ref(false)
const lastResult = ref<{
  success: boolean
  message: string
  attendee?: any
} | null>(null)

// Stats
const { data: attendeesData, refresh: refreshStats } = await useFetch(
  () => `/api/v1/events/${eventId.value}/attendees`,
  { query: { limit: 1 }, watch: [eventId] }
)

const stats = computed(() => attendeesData.value?.data?.stats ?? {
  confirmed: 0,
  checkedIn: 0,
})

// Recent check-ins
const recentCheckIns = ref<any[]>([])

async function handleCheckIn() {
  if (!qrInput.value.trim() || isProcessing.value) return

  isProcessing.value = true
  lastResult.value = null

  try {
    const response = await $fetch(`/api/v1/events/${eventId.value}/check-in`, {
      method: 'POST',
      body: { qrCode: qrInput.value.trim() },
    })

    lastResult.value = {
      success: true,
      message: 'Check-in successful!',
      attendee: response.data?.attendee,
    }

    // Add to recent check-ins
    if (response.data?.attendee) {
      recentCheckIns.value.unshift({
        ...response.data.attendee,
        checkedInAt: new Date(),
      })
      // Keep only last 10
      if (recentCheckIns.value.length > 10) {
        recentCheckIns.value.pop()
      }
    }

    toast.add({
      title: 'Check-in Successful',
      description: `${response.data?.attendee?.user?.name} has been checked in`,
      color: 'green',
    })

    // Refresh stats
    await refreshStats()
  } catch (e: any) {
    const alreadyCheckedIn = e.data?.data?.alreadyCheckedIn

    lastResult.value = {
      success: false,
      message: e.data?.message || 'Check-in failed',
      attendee: e.data?.data?.attendee,
    }

    toast.add({
      title: alreadyCheckedIn ? 'Already Checked In' : 'Check-in Failed',
      description: e.data?.message,
      color: alreadyCheckedIn ? 'yellow' : 'red',
    })
  } finally {
    isProcessing.value = false
    qrInput.value = ''
  }
}

// Auto-focus input
const inputRef = ref<HTMLInputElement>()
onMounted(() => {
  inputRef.value?.focus()
})

// Keep focus on input for scanner
function handleBlur() {
  setTimeout(() => {
    inputRef.value?.focus()
  }, 100)
}
</script>

<template>
  <div class="py-8">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <div class="flex items-center justify-between mb-8">
        <div>
          <NuxtLink
            :to="`/dashboard/events/${eventId}/attendees`"
            class="text-gray-600 dark:text-gray-400 hover:text-primary flex items-center gap-1 mb-2"
          >
            <UIcon name="i-heroicons-arrow-left" class="w-4 h-4" />
            Back to Attendees
          </NuxtLink>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Check-in Scanner</h1>
        </div>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-2 gap-4 mb-8">
        <UCard class="text-center">
          <p class="text-4xl font-bold text-green-600">{{ stats.checkedIn }}</p>
          <p class="text-gray-500">Checked In</p>
        </UCard>
        <UCard class="text-center">
          <p class="text-4xl font-bold text-gray-900 dark:text-white">{{ stats.confirmed }}</p>
          <p class="text-gray-500">Total Confirmed</p>
        </UCard>
      </div>

      <!-- Scanner Input -->
      <UCard class="mb-8">
        <div class="text-center mb-6">
          <UIcon name="i-heroicons-qr-code" class="w-16 h-16 text-primary mx-auto mb-4" />
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Scan QR Code or Enter Manually
          </h2>
          <p class="text-gray-500 text-sm">
            Use a QR scanner or type the code below
          </p>
        </div>

        <form @submit.prevent="handleCheckIn" class="max-w-md mx-auto">
          <UInput
            ref="inputRef"
            v-model="qrInput"
            placeholder="Scan or enter QR code..."
            size="xl"
            :loading="isProcessing"
            autofocus
            class="text-center text-lg"
            @blur="handleBlur"
          />
          <UButton
            type="submit"
            color="primary"
            size="lg"
            block
            class="mt-4"
            :loading="isProcessing"
          >
            Check In
          </UButton>
        </form>

        <!-- Result -->
        <div v-if="lastResult" class="mt-6">
          <UAlert
            :color="lastResult.success ? 'green' : 'red'"
            :title="lastResult.success ? 'Success!' : 'Error'"
            :description="lastResult.message"
          >
            <template v-if="lastResult.attendee" #description>
              <div class="flex items-center gap-3 mt-2">
                <UAvatar
                  :src="lastResult.attendee.user?.avatarUrl"
                  :alt="lastResult.attendee.user?.name"
                  size="md"
                />
                <div>
                  <p class="font-medium">{{ lastResult.attendee.user?.name }}</p>
                  <p class="text-sm opacity-80">{{ lastResult.attendee.user?.email }}</p>
                </div>
              </div>
            </template>
          </UAlert>
        </div>
      </UCard>

      <!-- Recent Check-ins -->
      <UCard v-if="recentCheckIns.length > 0">
        <template #header>
          <h3 class="font-semibold text-gray-900 dark:text-white">Recent Check-ins</h3>
        </template>

        <div class="space-y-3">
          <div
            v-for="(checkin, index) in recentCheckIns"
            :key="index"
            class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
          >
            <div class="flex items-center gap-3">
              <UAvatar
                :src="checkin.user?.avatarUrl"
                :alt="checkin.user?.name"
                size="sm"
              />
              <div>
                <p class="font-medium text-gray-900 dark:text-white">
                  {{ checkin.user?.name }}
                </p>
                <p class="text-sm text-gray-500">{{ checkin.user?.email }}</p>
              </div>
            </div>
            <div class="text-right">
              <UBadge color="green" variant="soft">Checked In</UBadge>
              <p class="text-xs text-gray-500 mt-1">
                {{ new Date(checkin.checkedInAt).toLocaleTimeString() }}
              </p>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Instructions -->
      <UCard class="mt-8">
        <template #header>
          <h3 class="font-semibold text-gray-900 dark:text-white">Instructions</h3>
        </template>
        <ul class="space-y-2 text-gray-600 dark:text-gray-400">
          <li class="flex items-start gap-2">
            <UIcon name="i-heroicons-check-circle" class="w-5 h-5 text-green-500 mt-0.5" />
            <span>Connect a USB QR code scanner - it will auto-type the code</span>
          </li>
          <li class="flex items-start gap-2">
            <UIcon name="i-heroicons-check-circle" class="w-5 h-5 text-green-500 mt-0.5" />
            <span>Or manually enter the code (format: NVYT-XXXXXXXXXXXX)</span>
          </li>
          <li class="flex items-start gap-2">
            <UIcon name="i-heroicons-check-circle" class="w-5 h-5 text-green-500 mt-0.5" />
            <span>The page will stay focused on the input for continuous scanning</span>
          </li>
          <li class="flex items-start gap-2">
            <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-yellow-500 mt-0.5" />
            <span>Only confirmed attendees can be checked in</span>
          </li>
        </ul>
      </UCard>
    </div>
  </div>
</template>
