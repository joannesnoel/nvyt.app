<script setup lang="ts">
import QRCode from 'qrcode'

definePageMeta({
  layout: 'default',
})

const route = useRoute()
const eventId = computed(() => route.params.id as string)
const toast = useToast()

// Fetch event by ID (not slug)
const { data: eventResponse, pending, refresh } = await useFetch(
  () => `/api/v1/events/by-id/${eventId.value}`,
  { watch: [eventId] }
)
const event = computed(() => eventResponse.value?.data)

// Fetch attendees stats
const { data: attendeesData } = await useFetch(
  () => `/api/v1/events/${eventId.value}/attendees`,
  {
    query: { limit: 5 },
    watch: [eventId],
  }
)
const stats = computed(() => attendeesData.value?.data?.stats)
const recentAttendees = computed(() => attendeesData.value?.data?.attendees ?? [])

// Fetch orders stats for ticket-mode events (to get revenue)
const { data: ordersData } = await useFetch(
  () => `/api/v1/events/${eventId.value}/orders`,
  {
    query: { limit: 5 },
    watch: [eventId],
  }
)
const orderStats = computed(() => ordersData.value?.data?.stats)
const recentOrders = computed(() => ordersData.value?.data?.orders ?? [])

// Fetch verification status for ticket-mode events
const { data: verificationResponse, refresh: refreshVerification } = await useFetch(
  () => `/api/v1/events/${eventId.value}/verification`,
  { 
    watch: [eventId],
    immediate: true,
  }
)
const verification = computed(() => verificationResponse.value?.data)

// Helper to check if event is ticket-based
const isTicketMode = computed(() => event.value?.registrationMode === 'tickets')

// Check if verification is required and not approved
const needsVerification = computed(() => {
  if (!verification.value) return false
  return verification.value.required && verification.value.status !== 'approved'
})

const verificationStatusColor = computed(() => {
  const status = verification.value?.status
  switch (status) {
    case 'approved': return 'green'
    case 'pending': return 'yellow'
    case 'under_review': return 'blue'
    case 'rejected': return 'red'
    case 'draft': return 'gray'
    case 'not_submitted': return 'gray'
    default: return 'gray'
  }
})

const verificationStatusLabel = computed(() => {
  const status = verification.value?.status
  switch (status) {
    case 'approved': return 'Verified'
    case 'pending': return 'Pending Review'
    case 'under_review': return 'Under Review'
    case 'rejected': return 'Rejected'
    case 'draft': return 'Draft - Upload Documents'
    case 'not_submitted': return 'Not Submitted'
    case 'not_required': return 'Not Required'
    default: return status
  }
})

// Format currency
function formatCurrency(amount: number | string) {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num)
}

// Publish/Unpublish
const isUpdating = ref(false)
const isGeneratingQR = ref(false)

// Cancel confirmation modal
const showCancelModal = ref(false)
const cancelConfirmText = ref('')
const CANCEL_CONFIRM_PHRASE = 'CANCEL'

function openCancelModal() {
  cancelConfirmText.value = ''
  showCancelModal.value = true
}

function closeCancelModal() {
  showCancelModal.value = false
  cancelConfirmText.value = ''
}

async function confirmCancelEvent() {
  if (cancelConfirmText.value !== CANCEL_CONFIRM_PHRASE) return
  closeCancelModal()
  await updateEventStatus('cancelled')
}

// Verification modal
const showVerificationModal = ref(false)

// Publish/Unpublish confirmation modals
const showPublishModal = ref(false)
const showUnpublishModal = ref(false)

function openPublishModal() {
  showPublishModal.value = true
}

function openUnpublishModal() {
  showUnpublishModal.value = true
}

async function confirmPublish() {
  showPublishModal.value = false
  await updateEventStatus('published')
}

async function confirmUnpublish() {
  showUnpublishModal.value = false
  await updateEventStatus('draft')
}

async function updateEventStatus(status: 'draft' | 'published' | 'cancelled') {
  isUpdating.value = true
  try {
    await $fetch(`/api/v1/events/${eventId.value}`, {
      method: 'PATCH',
      body: { status },
    })
    toast.add({
      title: 'Event Updated',
      description: `Event is now ${status}`,
      color: 'green',
    })
    await refresh()
  } catch (e: any) {
    // Check if this is a verification error
    if (e.data?.data?.code === 'VERIFICATION_REQUIRED' || e.data?.data?.code === 'VERIFICATION_NOT_APPROVED') {
      showVerificationModal.value = true
      await refreshVerification()
    }
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to update event',
      color: 'red',
    })
  } finally {
    isUpdating.value = false
  }
}

// Copy invite link
async function copyInviteLink() {
  if (!event.value) return

  const config = useRuntimeConfig()
  const baseUrl = config.public.appUrl
  let url = `${baseUrl}/events/${event.value.slug}`

  // Add invite token for private events
  if (event.value.visibility === 'private' && event.value.inviteToken) {
    url += `?token=${event.value.inviteToken}`
  }

  await navigator.clipboard.writeText(url)
  toast.add({
    title: 'Link Copied',
    description: 'Event link copied to clipboard',
    color: 'green',
  })
}

async function downloadQRCode() {
  if (!event.value) return

  isGeneratingQR.value = true
  try {
    const config = useRuntimeConfig()
    const baseUrl = config.public.appUrl

    // Build the event URL
    let eventUrl = `${baseUrl}/events/${event.value.slug}`

    // Add invite token for private events
    if (event.value.visibility === 'private' && event.value.inviteToken) {
      eventUrl += `?token=${event.value.inviteToken}`
    }

    // Add tracking parameters
    const trackingParams = new URLSearchParams()
    trackingParams.set('utm_source', 'qr_code')
    trackingParams.set('utm_medium', 'offline')
    trackingParams.set('utm_campaign', event.value.slug)
    trackingParams.set('ref', 'qr')

    const separator = eventUrl.includes('?') ? '&' : '?'
    eventUrl += separator + trackingParams.toString()

    // Generate QR code as PNG data URL
    const qrDataUrl = await QRCode.toDataURL(eventUrl, {
      width: 1024,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    })

    // Trigger download
    const link = document.createElement('a')
    link.href = qrDataUrl
    link.download = `qr-${event.value.slug}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    toast.add({
      title: 'QR Code Downloaded',
      description: 'Your event QR code has been downloaded.',
      color: 'green',
    })
  } catch (e: any) {
    toast.add({
      title: 'Download Failed',
      description: 'Failed to generate QR code. Please try again.',
      color: 'red',
    })
  } finally {
    isGeneratingQR.value = false
  }
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function getStatusColor(status: string) {
  switch (status) {
    case 'published': return 'green'
    case 'draft': return 'yellow'
    case 'cancelled': return 'red'
    case 'completed': return 'gray'
    default: return 'gray'
  }
}
</script>

<template>
  <div class="py-8">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Loading -->
      <div v-if="pending" class="space-y-4">
        <USkeleton class="h-8 w-1/3" />
        <USkeleton class="h-4 w-1/4" />
        <div class="grid md:grid-cols-4 gap-4 mt-8">
          <USkeleton v-for="i in 4" :key="i" class="h-24" />
        </div>
      </div>

      <!-- Event Management -->
      <div v-else-if="event">
        <!-- Header -->
        <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <NuxtLink
              to="/dashboard"
              class="text-gray-600 dark:text-gray-400 hover:text-primary flex items-center gap-1 mb-2"
            >
              <UIcon name="i-heroicons-arrow-left" class="w-4 h-4" />
              Back to Dashboard
            </NuxtLink>
            <div class="flex items-center gap-3">
              <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
                {{ event.title }}
              </h1>
              <UBadge :color="getStatusColor(event.status)" variant="soft">
                {{ event.status }}
              </UBadge>
            </div>
            <p class="text-gray-600 dark:text-gray-400 mt-1">
              {{ formatDate(event.startDate) }}
              <span v-if="event.location"> &middot; {{ event.location }}</span>
            </p>
          </div>

          <div class="flex flex-wrap gap-2">
            <UButton
              color="gray"
              variant="outline"
              icon="i-heroicons-link"
              @click="copyInviteLink"
            >
              Copy Link
            </UButton>
            <UButton
              color="gray"
              variant="outline"
              icon="i-heroicons-qr-code"
              :loading="isGeneratingQR"
              @click="downloadQRCode"
            >
              Download QR
            </UButton>
            <UButton
              :to="`/events/${event.slug}`"
              color="gray"
              variant="outline"
              icon="i-heroicons-eye"
              target="_blank"
            >
              View Public Page
            </UButton>
            <UButton
              v-if="event.status === 'draft'"
              color="green"
              icon="i-heroicons-rocket-launch"
              :loading="isUpdating"
              @click="openPublishModal"
            >
              Publish
            </UButton>
            <UButton
              v-else-if="event.status === 'published'"
              color="yellow"
              variant="outline"
              icon="i-heroicons-pause"
              :loading="isUpdating"
              @click="openUnpublishModal"
            >
              Unpublish
            </UButton>
          </div>
        </div>

        <!-- Quick Stats -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <UCard>
            <div class="flex items-center gap-3">
              <div class="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <UIcon name="i-heroicons-users" class="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p class="text-2xl font-bold text-gray-900 dark:text-white">
                  {{ stats?.confirmed ?? 0 }}
                </p>
                <p class="text-sm text-gray-500">Confirmed</p>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center gap-3">
              <div class="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                <UIcon name="i-heroicons-clock" class="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p class="text-2xl font-bold text-gray-900 dark:text-white">
                  {{ stats?.pending ?? 0 }}
                </p>
                <p class="text-sm text-gray-500">Pending</p>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center gap-3">
              <div :class="[
                'p-2 rounded-lg',
                isTicketMode
                  ? 'bg-emerald-100 dark:bg-emerald-900/30'
                  : 'bg-orange-100 dark:bg-orange-900/30'
              ]">
                <UIcon
                  :name="isTicketMode ? 'i-heroicons-currency-dollar' : 'i-heroicons-queue-list'"
                  :class="[
                    'w-5 h-5',
                    isTicketMode ? 'text-emerald-600' : 'text-orange-600'
                  ]"
                />
              </div>
              <div>
                <p class="text-2xl font-bold text-gray-900 dark:text-white">
                  <template v-if="isTicketMode">
                    {{ formatCurrency(orderStats?.totalRevenue ?? 0) }}
                  </template>
                  <template v-else>
                    {{ stats?.waitlisted ?? 0 }}
                  </template>
                </p>
                <p class="text-sm text-gray-500">
                  {{ isTicketMode ? 'Revenue' : 'Waitlisted' }}
                </p>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center gap-3">
              <div class="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                <UIcon name="i-heroicons-check-badge" class="w-5 h-5 text-primary" />
              </div>
              <div>
                <p class="text-2xl font-bold text-gray-900 dark:text-white">
                  {{ stats?.checkedIn ?? 0 }}
                </p>
                <p class="text-sm text-gray-500">Checked In</p>
              </div>
            </div>
          </UCard>
        </div>

        <!-- Main Content -->
        <div class="grid md:grid-cols-3 gap-8">
          <!-- Actions -->
          <div class="md:col-span-2 space-y-6">
            <!-- Quick Actions -->
            <UCard>
              <template #header>
                <h2 class="font-semibold text-gray-900 dark:text-white">Quick Actions</h2>
              </template>

              <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <!-- Primary: Most used -->
                <NuxtLink
                  :to="`/dashboard/events/${eventId}/attendees`"
                  class="p-4 text-center rounded-lg border border-gray-200 dark:border-gray-700 hover:border-primary dark:hover:border-primary transition-colors"
                >
                  <UIcon name="i-heroicons-users" class="w-8 h-8 text-primary mx-auto mb-2" />
                  <p class="font-medium text-gray-900 dark:text-white">Attendees</p>
                  <p class="text-sm text-gray-500">Manage guests</p>
                </NuxtLink>

                <NuxtLink
                  v-if="event.registrationMode === 'tickets'"
                  :to="`/dashboard/events/${eventId}/orders`"
                  class="p-4 text-center rounded-lg border border-gray-200 dark:border-gray-700 hover:border-primary dark:hover:border-primary transition-colors"
                >
                  <UIcon name="i-heroicons-shopping-cart" class="w-8 h-8 text-primary mx-auto mb-2" />
                  <p class="font-medium text-gray-900 dark:text-white">Orders</p>
                  <p class="text-sm text-gray-500">Sales & refunds</p>
                </NuxtLink>

                <NuxtLink
                  :to="`/dashboard/events/${eventId}/check-in`"
                  class="p-4 text-center rounded-lg border border-gray-200 dark:border-gray-700 hover:border-primary dark:hover:border-primary transition-colors"
                >
                  <UIcon name="i-heroicons-qr-code" class="w-8 h-8 text-primary mx-auto mb-2" />
                  <p class="font-medium text-gray-900 dark:text-white">Check-in</p>
                  <p class="text-sm text-gray-500">Scan QR codes</p>
                </NuxtLink>

                <!-- Ticket Configuration -->
                <NuxtLink
                  v-if="event.registrationMode === 'tickets'"
                  :to="`/dashboard/events/${eventId}/tickets`"
                  class="p-4 text-center rounded-lg border border-gray-200 dark:border-gray-700 hover:border-primary dark:hover:border-primary transition-colors"
                >
                  <UIcon name="i-heroicons-ticket" class="w-8 h-8 text-primary mx-auto mb-2" />
                  <p class="font-medium text-gray-900 dark:text-white">Tickets</p>
                  <p class="text-sm text-gray-500">Manage pricing</p>
                </NuxtLink>

                <NuxtLink
                  v-if="event.registrationMode === 'tickets'"
                  :to="`/dashboard/events/${eventId}/registration`"
                  class="p-4 text-center rounded-lg border border-gray-200 dark:border-gray-700 hover:border-primary dark:hover:border-primary transition-colors"
                >
                  <UIcon name="i-heroicons-clipboard-document-list" class="w-8 h-8 text-primary mx-auto mb-2" />
                  <p class="font-medium text-gray-900 dark:text-white">Registration Form</p>
                  <p class="text-sm text-gray-500">Post-purchase fields</p>
                </NuxtLink>

                <!-- Event Setup -->
                <NuxtLink
                  :to="`/dashboard/events/${eventId}/edit`"
                  class="p-4 text-center rounded-lg border border-gray-200 dark:border-gray-700 hover:border-primary dark:hover:border-primary transition-colors"
                >
                  <UIcon name="i-heroicons-pencil-square" class="w-8 h-8 text-primary mx-auto mb-2" />
                  <p class="font-medium text-gray-900 dark:text-white">Edit</p>
                  <p class="text-sm text-gray-500">Update details</p>
                </NuxtLink>

                <NuxtLink
                  :to="`/dashboard/events/${eventId}/preview`"
                  class="p-4 text-center rounded-lg border border-gray-200 dark:border-gray-700 hover:border-primary dark:hover:border-primary transition-colors"
                >
                  <UIcon name="i-heroicons-paint-brush" class="w-8 h-8 text-primary mx-auto mb-2" />
                  <p class="font-medium text-gray-900 dark:text-white">Customize</p>
                  <p class="text-sm text-gray-500">Edit appearance</p>
                </NuxtLink>

                <!-- Collaboration & Outreach -->
                <NuxtLink
                  :to="`/dashboard/events/${eventId}/team`"
                  class="p-4 text-center rounded-lg border border-gray-200 dark:border-gray-700 hover:border-primary dark:hover:border-primary transition-colors"
                >
                  <UIcon name="i-heroicons-user-group" class="w-8 h-8 text-primary mx-auto mb-2" />
                  <p class="font-medium text-gray-900 dark:text-white">Team</p>
                  <p class="text-sm text-gray-500">Manage members</p>
                </NuxtLink>

                <NuxtLink
                  :to="`/dashboard/events/${eventId}/invite`"
                  class="p-4 text-center rounded-lg border border-gray-200 dark:border-gray-700 hover:border-primary dark:hover:border-primary transition-colors"
                >
                  <UIcon name="i-heroicons-envelope" class="w-8 h-8 text-primary mx-auto mb-2" />
                  <p class="font-medium text-gray-900 dark:text-white">Invite</p>
                  <p class="text-sm text-gray-500">Send invitations</p>
                </NuxtLink>

                <!-- Content -->
                <NuxtLink
                  :to="`/dashboard/events/${eventId}/announcements`"
                  class="p-4 text-center rounded-lg border border-gray-200 dark:border-gray-700 hover:border-primary dark:hover:border-primary transition-colors"
                >
                  <UIcon name="i-heroicons-megaphone" class="w-8 h-8 text-primary mx-auto mb-2" />
                  <p class="font-medium text-gray-900 dark:text-white">Announcements</p>
                  <p class="text-sm text-gray-500">News & updates</p>
                </NuxtLink>

                <NuxtLink
                  :to="`/dashboard/events/${eventId}/faqs`"
                  class="p-4 text-center rounded-lg border border-gray-200 dark:border-gray-700 hover:border-primary dark:hover:border-primary transition-colors"
                >
                  <UIcon name="i-heroicons-question-mark-circle" class="w-8 h-8 text-primary mx-auto mb-2" />
                  <p class="font-medium text-gray-900 dark:text-white">FAQs</p>
                  <p class="text-sm text-gray-500">Q&A section</p>
                </NuxtLink>

                <!-- Optional -->
                <NuxtLink
                  v-if="event.contributionsEnabled"
                  :to="`/dashboard/events/${eventId}/contributions`"
                  class="p-4 text-center rounded-lg border border-gray-200 dark:border-gray-700 hover:border-primary dark:hover:border-primary transition-colors"
                >
                  <UIcon name="i-heroicons-gift" class="w-8 h-8 text-primary mx-auto mb-2" />
                  <p class="font-medium text-gray-900 dark:text-white">Contributions</p>
                  <p class="text-sm text-gray-500">Manage list</p>
                </NuxtLink>
              </div>
            </UCard>

            <!-- Recent Attendees/Orders -->
            <UCard>
              <template #header>
                <div class="flex items-center justify-between">
                  <h2 class="font-semibold text-gray-900 dark:text-white">
                    {{ isTicketMode ? 'Recent Orders' : 'Recent RSVPs' }}
                  </h2>
                  <UButton
                    :to="isTicketMode ? `/dashboard/events/${eventId}/orders` : `/dashboard/events/${eventId}/attendees`"
                    color="gray"
                    variant="ghost"
                    size="sm"
                  >
                    View All
                  </UButton>
                </div>
              </template>

              <!-- For RSVP-based events -->
              <template v-if="!isTicketMode">
                <div v-if="recentAttendees.length === 0" class="text-center py-8">
                  <UIcon name="i-heroicons-users" class="w-10 h-10 text-gray-400 mx-auto mb-2" />
                  <p class="text-gray-500">No RSVPs yet</p>
                </div>

                <div v-else class="space-y-3">
                  <div
                    v-for="attendee in recentAttendees"
                    :key="attendee.id"
                    class="flex items-center justify-between"
                  >
                    <div class="flex items-center gap-3">
                      <UAvatar
                        :src="attendee.user?.avatarUrl ?? undefined"
                        :alt="attendee.user?.name ?? undefined"
                        size="sm"
                      />
                      <div>
                        <p class="font-medium text-gray-900 dark:text-white">
                          {{ attendee.user?.name }}
                        </p>
                        <p class="text-sm text-gray-500">{{ attendee.user?.email }}</p>
                      </div>
                    </div>
                    <UBadge
                      :color="attendee.status === 'confirmed' ? 'green' :
                              attendee.status === 'pending' ? 'yellow' : 'gray'"
                      variant="soft"
                      size="sm"
                    >
                      {{ attendee.status }}
                    </UBadge>
                  </div>
                </div>
              </template>

              <!-- For ticket-based events -->
              <template v-else>
                <div v-if="!recentOrders || recentOrders.length === 0" class="text-center py-8">
                  <UIcon name="i-heroicons-ticket" class="w-10 h-10 text-gray-400 mx-auto mb-2" />
                  <p class="text-gray-500">No orders yet</p>
                </div>

                <div v-else class="space-y-3">
                  <div
                    v-for="order in recentOrders"
                    :key="order.id"
                    class="flex items-center justify-between"
                  >
                    <div>
                      <p class="font-medium text-gray-900 dark:text-white">
                        {{ order.customerName || order.customerEmail }}
                      </p>
                      <p class="text-sm text-gray-500">{{ order.orderNumber }} · {{ order.ticketCount }} ticket{{ order.ticketCount > 1 ? 's' : '' }}</p>
                    </div>
                    <div class="text-right">
                      <p class="font-medium text-gray-900 dark:text-white">
                        {{ formatCurrency(order.totalAmount) }}
                      </p>
                      <UBadge
                        :color="order.paymentStatus === 'paid' ? 'green' :
                                order.paymentStatus === 'pending' ? 'yellow' : 'gray'"
                        variant="soft"
                        size="xs"
                      >
                        {{ order.paymentStatus }}
                      </UBadge>
                    </div>
                  </div>
                </div>
              </template>
            </UCard>
          </div>

          <!-- Sidebar -->
          <div class="space-y-6">
            <!-- Verification Status (for paid ticket events) -->
            <UCard v-if="verification?.required">
              <template #header>
                <div class="flex items-center justify-between">
                  <h2 class="font-semibold text-gray-900 dark:text-white">Verification Status</h2>
                  <UBadge :color="verificationStatusColor" variant="soft">
                    {{ verificationStatusLabel }}
                  </UBadge>
                </div>
              </template>

              <div class="space-y-4">
                <p class="text-sm text-gray-600 dark:text-gray-400">
                  {{ verification.message }}
                </p>

                <div v-if="verification.verification" class="space-y-2">
                  <div>
                    <p class="text-sm text-gray-500">Business Name</p>
                    <p class="font-medium text-gray-900 dark:text-white">
                      {{ verification.verification.businessName }}
                    </p>
                  </div>
                  <div>
                    <p class="text-sm text-gray-500">Country</p>
                    <p class="font-medium text-gray-900 dark:text-white">
                      {{ verification.verification.country }}
                    </p>
                  </div>
                  <div v-if="verification.documents?.length > 0">
                    <p class="text-sm text-gray-500">Documents</p>
                    <p class="font-medium text-gray-900 dark:text-white">
                      {{ verification.documents.length }} uploaded
                    </p>
                  </div>
                </div>

                <UButton
                  v-if="verification.status !== 'approved'"
                  :to="`/dashboard/events/${eventId}/verification`"
                  color="primary"
                  block
                >
                  {{ verification.status === 'not_submitted' ? 'Submit Verification' : 'View Verification' }}
                </UButton>
              </div>
            </UCard>

            <!-- Event Details -->
            <UCard>
              <template #header>
                <h2 class="font-semibold text-gray-900 dark:text-white">Event Details</h2>
              </template>

              <div class="space-y-4">
                <div>
                  <p class="text-sm text-gray-500 mb-1">Visibility</p>
                  <UBadge
                    :color="event.visibility === 'public' ? 'green' : 'gray'"
                    variant="soft"
                  >
                    {{ event.visibility }}
                  </UBadge>
                </div>

                <div>
                  <p class="text-sm text-gray-500 mb-1">Capacity</p>
                  <p class="font-medium text-gray-900 dark:text-white">
                    {{ event.maxAttendees ? `${event.maxAttendees} max` : 'Unlimited' }}
                  </p>
                </div>

                <div>
                  <p class="text-sm text-gray-500 mb-1">Requires Approval</p>
                  <p class="font-medium text-gray-900 dark:text-white">
                    {{ event.requiresApproval ? 'Yes' : 'No' }}
                  </p>
                </div>

                <div>
                  <p class="text-sm text-gray-500 mb-1">Features</p>
                  <div class="flex flex-wrap gap-2">
                    <UBadge v-if="event.registrationMode === 'tickets'" color="primary" variant="soft">
                      Ticketing
                    </UBadge>
                    <UBadge v-if="event.contributionsEnabled" color="primary" variant="soft">
                      Contributions
                    </UBadge>
                    <span v-if="event.registrationMode !== 'tickets' && !event.contributionsEnabled" class="text-gray-500">
                      None enabled
                    </span>
                  </div>
                </div>
              </div>
            </UCard>

            <!-- Danger Zone -->
            <UCard>
              <template #header>
                <h2 class="font-semibold text-red-600">Danger Zone</h2>
              </template>

              <div class="space-y-3">
                <UButton
                  v-if="event.status !== 'cancelled'"
                  color="red"
                  variant="outline"
                  block
                  @click="openCancelModal"
                >
                  Cancel Event
                </UButton>
                <p class="text-sm text-gray-500">
                  Cancelling will notify all attendees and prevent new RSVPs.
                </p>
              </div>
            </UCard>
          </div>
        </div>
      </div>

      <!-- Not Found -->
      <div v-else class="text-center py-20">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">Event Not Found</h1>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          This event doesn't exist or you don't have access to it.
        </p>
        <UButton to="/dashboard" color="primary">Back to Dashboard</UButton>
      </div>
    </div>

    <!-- Cancel Event Confirmation Modal -->
    <UModal v-model="showCancelModal">
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <div class="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-red-600" />
            </div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Cancel Event
            </h3>
          </div>
        </template>

        <div class="space-y-4">
          <p class="text-gray-600 dark:text-gray-400">
            Are you sure you want to cancel this event? This action will:
          </p>
          <ul class="list-disc list-inside text-sm text-gray-600 dark:text-gray-400 space-y-1">
            <li>Notify all attendees that the event is cancelled</li>
            <li>Prevent any new RSVPs</li>
            <li>This action cannot be undone</li>
          </ul>

          <div class="pt-2">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Type <span class="font-bold text-red-600">{{ CANCEL_CONFIRM_PHRASE }}</span> to confirm
            </label>
            <UInput
              v-model="cancelConfirmText"
              placeholder="Type CANCEL to confirm"
              :ui="{ base: 'font-mono' }"
            />
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton
              color="gray"
              variant="outline"
              @click="closeCancelModal"
            >
              Keep Event
            </UButton>
            <UButton
              color="red"
              :disabled="cancelConfirmText !== CANCEL_CONFIRM_PHRASE"
              :loading="isUpdating"
              @click="confirmCancelEvent"
            >
              Cancel Event
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Verification Required Modal -->
    <UModal v-model="showVerificationModal">
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <div class="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
              <UIcon name="i-heroicons-shield-check" class="w-5 h-5 text-yellow-600" />
            </div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Verification Required
            </h3>
          </div>
        </template>

        <div class="space-y-4">
          <p class="text-gray-600 dark:text-gray-400">
            Events selling paid tickets require business verification before they can be published.
            This helps ensure a safe and trustworthy experience for ticket buyers.
          </p>

          <div v-if="verification?.status === 'rejected'" class="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <p class="text-sm font-medium text-red-800 dark:text-red-200">
              Your verification was rejected:
            </p>
            <p class="text-sm text-red-600 dark:text-red-300 mt-1">
              {{ verification?.verification?.rejectionReason || 'Please resubmit with valid documents.' }}
            </p>
          </div>

          <div class="space-y-2">
            <h4 class="font-medium text-gray-900 dark:text-white">What you'll need:</h4>
            <ul class="list-disc list-inside text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <li>Business registration documents (DTI/SEC for Philippines)</li>
              <li>Valid government-issued business license</li>
              <li>Business registration number</li>
            </ul>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton
              color="gray"
              variant="outline"
              @click="showVerificationModal = false"
            >
              Close
            </UButton>
            <UButton
              :to="`/dashboard/events/${eventId}/verification`"
              color="primary"
              @click="showVerificationModal = false"
            >
              {{ verification?.status === 'not_submitted' ? 'Start Verification' : 'View Verification' }}
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Publish Confirmation Modal -->
    <UModal v-model="showPublishModal">
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <div class="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <UIcon name="i-heroicons-rocket-launch" class="w-5 h-5 text-green-600" />
            </div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Publish Event
            </h3>
          </div>
        </template>

        <div class="space-y-4">
          <p class="text-gray-600 dark:text-gray-400">
            Are you ready to publish <span class="font-semibold text-gray-900 dark:text-white">{{ event?.title }}</span>?
          </p>

          <div class="space-y-2">
            <h4 class="font-medium text-gray-900 dark:text-white">Once published:</h4>
            <ul class="list-disc list-inside text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <li v-if="event?.visibility === 'public'">Your event will be visible to the public</li>
              <li v-else>Your event will be accessible via invite link</li>
              <li v-if="event?.registrationMode === 'tickets'">Attendees will be able to purchase tickets</li>
              <li v-else>Attendees will be able to RSVP</li>
              <li>You can still edit event details after publishing</li>
            </ul>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton
              color="gray"
              variant="outline"
              @click="showPublishModal = false"
            >
              Cancel
            </UButton>
            <UButton
              color="green"
              :loading="isUpdating"
              @click="confirmPublish"
            >
              Publish Event
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Unpublish Confirmation Modal -->
    <UModal v-model="showUnpublishModal">
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <div class="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
              <UIcon name="i-heroicons-pause" class="w-5 h-5 text-yellow-600" />
            </div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Unpublish Event
            </h3>
          </div>
        </template>

        <div class="space-y-4">
          <p class="text-gray-600 dark:text-gray-400">
            Are you sure you want to unpublish <span class="font-semibold text-gray-900 dark:text-white">{{ event?.title }}</span>?
          </p>

          <div class="space-y-2">
            <h4 class="font-medium text-gray-900 dark:text-white">What happens when you unpublish:</h4>
            <ul class="list-disc list-inside text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <li>The public event page will no longer be accessible</li>
              <li>New RSVPs and ticket purchases will be disabled</li>
              <li>Existing attendees will keep their tickets/RSVPs</li>
              <li>You can republish the event at any time</li>
            </ul>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton
              color="gray"
              variant="outline"
              @click="showUnpublishModal = false"
            >
              Keep Published
            </UButton>
            <UButton
              color="yellow"
              :loading="isUpdating"
              @click="confirmUnpublish"
            >
              Unpublish Event
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
