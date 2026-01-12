<script setup lang="ts">
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

// Publish/Unpublish
const isUpdating = ref(false)

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
              @click="updateEventStatus('published')"
            >
              Publish
            </UButton>
            <UButton
              v-else-if="event.status === 'published'"
              color="yellow"
              variant="outline"
              icon="i-heroicons-pause"
              :loading="isUpdating"
              @click="updateEventStatus('draft')"
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
              <div class="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                <UIcon name="i-heroicons-queue-list" class="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p class="text-2xl font-bold text-gray-900 dark:text-white">
                  {{ stats?.waitlisted ?? 0 }}
                </p>
                <p class="text-sm text-gray-500">Waitlisted</p>
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

              <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
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
                  :to="`/dashboard/events/${eventId}/tickets`"
                  class="p-4 text-center rounded-lg border border-gray-200 dark:border-gray-700 hover:border-primary dark:hover:border-primary transition-colors"
                >
                  <UIcon name="i-heroicons-ticket" class="w-8 h-8 text-primary mx-auto mb-2" />
                  <p class="font-medium text-gray-900 dark:text-white">Tickets</p>
                  <p class="text-sm text-gray-500">Manage pricing</p>
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

                <NuxtLink
                  :to="`/dashboard/events/${eventId}/edit`"
                  class="p-4 text-center rounded-lg border border-gray-200 dark:border-gray-700 hover:border-primary dark:hover:border-primary transition-colors"
                >
                  <UIcon name="i-heroicons-pencil-square" class="w-8 h-8 text-primary mx-auto mb-2" />
                  <p class="font-medium text-gray-900 dark:text-white">Edit</p>
                  <p class="text-sm text-gray-500">Update details</p>
                </NuxtLink>

                <NuxtLink
                  :to="`/dashboard/events/${eventId}/invite`"
                  class="p-4 text-center rounded-lg border border-gray-200 dark:border-gray-700 hover:border-primary dark:hover:border-primary transition-colors"
                >
                  <UIcon name="i-heroicons-envelope" class="w-8 h-8 text-primary mx-auto mb-2" />
                  <p class="font-medium text-gray-900 dark:text-white">Invite</p>
                  <p class="text-sm text-gray-500">Send invitations</p>
                </NuxtLink>

                <NuxtLink
                  :to="`/dashboard/events/${eventId}/team`"
                  class="p-4 text-center rounded-lg border border-gray-200 dark:border-gray-700 hover:border-primary dark:hover:border-primary transition-colors"
                >
                  <UIcon name="i-heroicons-user-group" class="w-8 h-8 text-primary mx-auto mb-2" />
                  <p class="font-medium text-gray-900 dark:text-white">Team</p>
                  <p class="text-sm text-gray-500">Manage members</p>
                </NuxtLink>

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

            <!-- Recent Attendees -->
            <UCard>
              <template #header>
                <div class="flex items-center justify-between">
                  <h2 class="font-semibold text-gray-900 dark:text-white">Recent RSVPs</h2>
                  <UButton
                    :to="`/dashboard/events/${eventId}/attendees`"
                    color="gray"
                    variant="ghost"
                    size="sm"
                  >
                    View All
                  </UButton>
                </div>
              </template>

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
                      :src="attendee.user?.avatarUrl"
                      :alt="attendee.user?.name"
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
            </UCard>
          </div>

          <!-- Sidebar -->
          <div class="space-y-6">
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
  </div>
</template>
