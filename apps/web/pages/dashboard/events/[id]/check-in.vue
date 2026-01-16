<script setup lang="ts">
definePageMeta({
  layout: 'default',
})

const route = useRoute()
const eventId = computed(() => route.params.id as string)
const toast = useToast()

// Scanner mode: 'camera' or 'manual'
const scannerMode = ref<'camera' | 'manual'>('camera')
const scannerPaused = ref(false)
const isCameraActive = computed(() => scannerMode.value === 'camera' && !scannerPaused.value)

// Manual entry mode
const qrInput = ref('')
const isProcessing = ref(false)
const lastResult = ref<{
  success: boolean
  message: string
  type?: 'ticket' | 'rsvp'
  attendeeName?: string
  attendeeEmail?: string
  ticketType?: string
  ticketNumber?: string
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

async function processCheckIn(qrCode: string) {
  if (!qrCode.trim() || isProcessing.value) return

  isProcessing.value = true
  lastResult.value = null

  try {
    const response = await $fetch(`/api/v1/events/${eventId.value}/check-in`, {
      method: 'POST',
      body: { qrCode: qrCode.trim() },
    })

    const data = response.data as any
    const isTicket = data?.type === 'ticket'

    lastResult.value = {
      success: true,
      message: 'Check-in successful!',
      type: data?.type as 'ticket' | 'rsvp' | undefined,
      attendeeName: data?.attendeeName,
      attendeeEmail: data?.attendeeEmail,
      ticketType: isTicket ? data?.ticketType?.name : undefined,
      ticketNumber: isTicket ? data?.ticket?.ticketNumber : undefined,
    }

    // Add to recent check-ins
    recentCheckIns.value.unshift({
      name: data?.attendeeName,
      email: data?.attendeeEmail,
      type: data?.type,
      ticketType: isTicket ? data?.ticketType?.name : null,
      ticketNumber: isTicket ? data?.ticket?.ticketNumber : null,
      checkedInAt: new Date(),
    })
    // Keep only last 10
    if (recentCheckIns.value.length > 10) {
      recentCheckIns.value.pop()
    }

    toast.add({
      title: 'Check-in Successful',
      description: `${data?.attendeeName} has been checked in`,
      color: 'green',
      icon: 'i-heroicons-check-circle',
    })

    // Refresh stats
    await refreshStats()
  } catch (e: any) {
    const alreadyCheckedIn = e.data?.data?.alreadyCheckedIn
    const errorData = e.data?.data

    lastResult.value = {
      success: false,
      message: e.data?.message || 'Check-in failed',
      type: errorData?.type,
      attendeeName: errorData?.purchaser?.name || errorData?.attendee?.user?.name,
      attendeeEmail: errorData?.purchaser?.email || errorData?.attendee?.user?.email,
      ticketType: errorData?.ticketType?.name,
      ticketNumber: errorData?.ticket?.ticketNumber,
    }

    toast.add({
      title: alreadyCheckedIn ? 'Already Checked In' : 'Check-in Failed',
      description: e.data?.message,
      color: alreadyCheckedIn ? 'yellow' : 'red',
      icon: alreadyCheckedIn ? 'i-heroicons-exclamation-triangle' : 'i-heroicons-x-circle',
    })
  } finally {
    isProcessing.value = false
    qrInput.value = ''
  }
}

function handleScan(code: string) {
  // Pause scanner immediately to prevent re-scanning
  scannerPaused.value = true
  processCheckIn(code)
}

function scanNext() {
  lastResult.value = null
  scannerPaused.value = false
}

function handleManualSubmit() {
  processCheckIn(qrInput.value)
}

// Auto-focus input for manual mode
const inputRef = ref<HTMLInputElement>()
watch(scannerMode, (mode) => {
  if (mode === 'manual') {
    nextTick(() => inputRef.value?.focus())
  } else {
    // Reset scanner state when switching to camera
    scannerPaused.value = false
    lastResult.value = null
  }
})

// Keep focus on input for USB scanner (manual mode)
function handleBlur() {
  if (scannerMode.value === 'manual') {
    setTimeout(() => {
      inputRef.value?.focus()
    }, 100)
  }
}
</script>

<template>
  <div class="py-8">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
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
      <div class="grid grid-cols-2 gap-4 mb-6">
        <UCard class="text-center">
          <p class="text-4xl font-bold text-green-600">{{ stats.checkedIn }}</p>
          <p class="text-gray-500">Checked In</p>
        </UCard>
        <UCard class="text-center">
          <p class="text-4xl font-bold text-gray-900 dark:text-white">{{ stats.confirmed }}</p>
          <p class="text-gray-500">Total Confirmed</p>
        </UCard>
      </div>

      <!-- Mode Toggle -->
      <div class="flex justify-center mb-6">
        <div class="inline-flex rounded-lg bg-gray-100 dark:bg-gray-800 p-1">
          <button
            type="button"
            class="px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2"
            :class="scannerMode === 'camera'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'"
            @click="scannerMode = 'camera'"
          >
            <UIcon name="i-heroicons-camera" class="w-4 h-4" />
            Camera
          </button>
          <button
            type="button"
            class="px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2"
            :class="scannerMode === 'manual'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'"
            @click="scannerMode = 'manual'"
          >
            <UIcon name="i-heroicons-pencil-square" class="w-4 h-4" />
            Manual / USB
          </button>
        </div>
      </div>

      <!-- Scanner Card -->
      <UCard class="mb-6">
        <!-- Camera Scanner Mode -->
        <div v-if="scannerMode === 'camera'" class="space-y-4">
          <!-- Show scanner when not paused -->
          <template v-if="!scannerPaused">
            <div class="text-center mb-4">
              <p class="text-gray-600 dark:text-gray-400 text-sm">
                Point your camera at a QR code to scan
              </p>
            </div>

            <QrScanner
              :active="isCameraActive"
              @scan="handleScan"
            />

            <div v-if="isProcessing" class="text-center py-2">
              <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 text-primary animate-spin" />
              <p class="text-sm text-gray-500 mt-2">Processing...</p>
            </div>
          </template>

          <!-- Show result and Scan Next button when paused -->
          <template v-else>
            <!-- Result -->
            <div v-if="lastResult" class="mb-6">
              <UAlert
                :color="lastResult.success ? 'green' : 'red'"
                :icon="lastResult.success ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
              >
                <template #title>
                  {{ lastResult.success ? 'Check-in Successful!' : 'Check-in Failed' }}
                </template>
                <template #description>
                  <div class="mt-2">
                    <p class="font-medium text-lg">{{ lastResult.attendeeName || 'Unknown' }}</p>
                    <p class="text-sm opacity-80">{{ lastResult.attendeeEmail }}</p>
                    <div v-if="lastResult.ticketType" class="mt-2 flex items-center gap-2">
                      <UBadge color="gray" variant="soft">{{ lastResult.ticketType }}</UBadge>
                      <span class="text-xs opacity-70">{{ lastResult.ticketNumber }}</span>
                    </div>
                    <p v-if="!lastResult.success" class="mt-2 text-sm">
                      {{ lastResult.message }}
                    </p>
                  </div>
                </template>
              </UAlert>
            </div>

            <!-- Scan Next Button -->
            <div class="text-center">
              <UButton
                color="primary"
                size="xl"
                @click="scanNext"
                class="px-8"
              >
                <UIcon name="i-heroicons-qr-code" class="w-5 h-5 mr-2" />
                Scan Next Ticket
              </UButton>
            </div>
          </template>
        </div>

        <!-- Manual Entry Mode -->
        <div v-else class="space-y-4">
          <div class="text-center mb-4">
            <UIcon name="i-heroicons-qr-code" class="w-12 h-12 text-primary mx-auto mb-3" />
            <p class="text-gray-600 dark:text-gray-400 text-sm">
              Use a USB scanner or type the QR code manually
            </p>
          </div>

          <form @submit.prevent="handleManualSubmit" class="max-w-md mx-auto">
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

          <!-- Result for manual mode -->
          <div v-if="lastResult" class="mt-6">
            <UAlert
              :color="lastResult.success ? 'green' : 'red'"
              :icon="lastResult.success ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
            >
              <template #title>
                {{ lastResult.success ? 'Check-in Successful!' : 'Check-in Failed' }}
              </template>
              <template #description>
                <div class="mt-2">
                  <p class="font-medium text-lg">{{ lastResult.attendeeName || 'Unknown' }}</p>
                  <p class="text-sm opacity-80">{{ lastResult.attendeeEmail }}</p>
                  <div v-if="lastResult.ticketType" class="mt-2 flex items-center gap-2">
                    <UBadge color="gray" variant="soft">{{ lastResult.ticketType }}</UBadge>
                    <span class="text-xs opacity-70">{{ lastResult.ticketNumber }}</span>
                  </div>
                  <p v-if="!lastResult.success" class="mt-2 text-sm">
                    {{ lastResult.message }}
                  </p>
                </div>
              </template>
            </UAlert>
          </div>
        </div>
      </UCard>

      <!-- Recent Check-ins -->
      <UCard v-if="recentCheckIns.length > 0" class="mb-6">
        <template #header>
          <h3 class="font-semibold text-gray-900 dark:text-white">Recent Check-ins</h3>
        </template>

        <div class="space-y-3">
          <div
            v-for="(checkin, index) in recentCheckIns"
            :key="index"
            class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
          >
            <div>
              <p class="font-medium text-gray-900 dark:text-white">
                {{ checkin.name }}
              </p>
              <p class="text-sm text-gray-500">{{ checkin.email }}</p>
              <div v-if="checkin.ticketType" class="mt-1">
                <UBadge color="gray" variant="soft" size="xs">{{ checkin.ticketType }}</UBadge>
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

      <!-- Tips -->
      <UCard>
        <template #header>
          <h3 class="font-semibold text-gray-900 dark:text-white">Tips</h3>
        </template>
        <ul class="space-y-2 text-gray-600 dark:text-gray-400 text-sm">
          <li class="flex items-start gap-2">
            <UIcon name="i-heroicons-device-phone-mobile" class="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
            <span><strong>Camera mode:</strong> Best for scanning with your phone on-site</span>
          </li>
          <li class="flex items-start gap-2">
            <UIcon name="i-heroicons-computer-desktop" class="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
            <span><strong>Manual mode:</strong> Use with USB barcode scanners or manual entry</span>
          </li>
          <li class="flex items-start gap-2">
            <UIcon name="i-heroicons-light-bulb" class="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" />
            <span>For best results, ensure good lighting and hold the QR code steady</span>
          </li>
        </ul>
      </UCard>
    </div>
  </div>
</template>
