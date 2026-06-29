<script setup lang="ts">
definePageMeta({
  layout: 'dashboard',
})

const route = useRoute()
const eventId = computed(() => route.params.id as string)
const toast = useToast()

// Fetch event to get registration mode
const { data: eventResponse } = await useFetch<{ data?: { registrationMode?: string } }>(
  () => `/api/v1/events/by-id/${eventId.value}`,
)
const event = computed(() => eventResponse.value?.data)
useHead(() => ({ title: event.value?.title ? `Attendees - ${event.value.title} - NVYT` : 'NVYT' }))
const isTicketMode = computed(() => event.value?.registrationMode === 'tickets')

// Filters
const statusFilter = ref<string | undefined>(undefined)
const searchQuery = ref('')
const page = ref(1)

// Fetch attendees
const { data: response, pending, refresh } = await useFetch(
  () => `/api/v1/events/${eventId.value}/attendees`,
  {
    query: computed(() => ({
      status: statusFilter.value,
      search: searchQuery.value || undefined,
      page: page.value,
      limit: 20,
    })),
    watch: [statusFilter, page, eventId],
  }
)

const attendees = computed(() => response.value?.data?.attendees ?? [])
const stats = computed(() => response.value?.data?.stats ?? {
  total: 0, confirmed: 0, pending: 0, waitlisted: 0, declined: 0, cancelled: 0, checkedIn: 0
})
const meta = computed(() => response.value?.meta)
const ticketTypeStats = computed(() => (response.value?.data as any)?.ticketTypeStats ?? [])

// Debounced search
let searchTimeout: ReturnType<typeof setTimeout>
watch(searchQuery, () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    page.value = 1
    refresh()
  }, 300)
})

// Selection
const selectedIds = ref<string[]>([])
const allSelected = computed(() =>
  attendees.value.length > 0 && selectedIds.value.length === attendees.value.length
)

function toggleAll() {
  if (allSelected.value) {
    selectedIds.value = []
  } else {
    selectedIds.value = attendees.value.map((a: any) => a.id)
  }
}

// Status update
const updateLoading = ref(false)

async function updateStatus(attendeeId: string, status: string) {
  updateLoading.value = true
  try {
    await $fetch(`/api/v1/events/${eventId.value}/attendees/${attendeeId}`, {
      method: 'PATCH',
      body: { status },
    })
    toast.add({ title: 'Status Updated', color: 'green' })
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.data?.message, color: 'red' })
  } finally {
    updateLoading.value = false
  }
}

async function bulkUpdateStatus(status: string) {
  if (selectedIds.value.length === 0) return

  updateLoading.value = true
  try {
    await $fetch(`/api/v1/events/${eventId.value}/attendees/bulk`, {
      method: 'PATCH',
      body: {
        attendeeIds: selectedIds.value,
        status,
      },
    })
    toast.add({
      title: 'Bulk Update Complete',
      description: `Updated ${selectedIds.value.length} attendees`,
      color: 'green',
    })
    selectedIds.value = []
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.data?.message, color: 'red' })
  } finally {
    updateLoading.value = false
  }
}

// Export
async function exportAttendees(format: 'csv' | 'json') {
  const url = `/api/v1/events/${eventId.value}/attendees/export?format=${format}`

  if (format === 'csv') {
    window.open(url, '_blank')
  } else {
    const res = await $fetch<{ success: boolean; data: unknown }>(url)
    const payload = res?.data ?? res
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `attendees-${eventId.value}.json`
    link.click()
    URL.revokeObjectURL(link.href)
  }
}

// Resend the check-in QR email to confirmed attendees (all, or a selected subset)
const resendLoading = ref(false)
async function resendQrEmails(attendeeIds?: string[]) {
  const scope = attendeeIds && attendeeIds.length > 0
    ? `${attendeeIds.length} selected attendee(s)`
    : 'all confirmed attendees'
  if (!window.confirm(`Send the check-in QR email to ${scope}?`)) return

  resendLoading.value = true
  try {
    const res = await $fetch<{ data?: { sent?: number; failed?: number } }>(
      `/api/v1/events/${eventId.value}/attendees/resend-qr`,
      { method: 'POST', body: attendeeIds && attendeeIds.length > 0 ? { attendeeIds } : {} }
    )
    const sent = res?.data?.sent ?? 0
    const failed = res?.data?.failed ?? 0
    toast.add({
      title: 'QR Emails Sent',
      description: `Sent ${sent}${failed ? `, ${failed} failed` : ''}`,
      color: failed ? 'orange' : 'green',
    })
    if (attendeeIds && attendeeIds.length > 0) selectedIds.value = []
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.data?.message || 'Failed to send QR emails', color: 'red' })
  } finally {
    resendLoading.value = false
  }
}

// Status helpers
function getStatusColor(status: string) {
  switch (status) {
    case 'confirmed': return 'green'
    case 'pending': return 'yellow'
    case 'waitlisted': return 'orange'
    case 'declined': return 'red'
    case 'cancelled': return 'gray'
    default: return 'gray'
  }
}

// Status display label - shows "Paid" instead of "Confirmed" for ticket mode
function getStatusLabel(status: string) {
  if (status === 'confirmed' && isTicketMode.value) {
    return 'Paid'
  }
  if (status === 'checked_in') {
    return 'Checked In'
  }
  return status.charAt(0).toUpperCase() + status.slice(1)
}

const statusOptions = computed(() => {
  const options = [
    { label: 'All', value: undefined },
    { label: isTicketMode.value ? 'Paid' : 'Confirmed', value: 'confirmed' },
    { label: 'Pending', value: 'pending' },
  ]
  // Waitlisted and Declined only apply to RSVP events
  if (!isTicketMode.value) {
    options.push({ label: 'Waitlisted', value: 'waitlisted' })
    options.push({ label: 'Declined', value: 'declined' })
  }
  options.push({ label: 'Cancelled', value: 'cancelled' })
  return options
})

// Column header labels based on mode
const dateColumnLabel = computed(() => isTicketMode.value ? 'Registered' : 'RSVP Date')

// QR code modal
const showQrModal = ref(false)
const qrAttendee = ref<any>(null)

function viewQrCode(attendee: any) {
  qrAttendee.value = attendee
  showQrModal.value = true
}

// Ticket PDF download
const pdfDownloading = ref(false)

async function downloadTicketPdf(ticketId: string) {
  pdfDownloading.value = true
  try {
    const response = await $fetch(`/api/v1/tickets/${ticketId}/download`, {
      responseType: 'blob',
    }) as Blob
    const url = URL.createObjectURL(response)
    const link = document.createElement('a')
    link.href = url
    link.download = `ticket-${ticketId}.pdf`
    link.click()
    URL.revokeObjectURL(url)
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.data?.message || 'Failed to download ticket', color: 'red' })
  } finally {
    pdfDownloading.value = false
  }
}
</script>

<template>
  <div class="sm:py-8">
    <div class="px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Attendees</h1>
        </div>

        <div class="flex items-center gap-2">
          <UDropdown
            :items="[[
              { label: 'Export CSV', icon: 'i-heroicons-document-text', click: () => exportAttendees('csv') },
              { label: 'Export JSON', icon: 'i-heroicons-code-bracket', click: () => exportAttendees('json') },
            ]]"
          >
            <UButton color="gray" variant="outline" icon="i-heroicons-arrow-down-tray">
              <span class="hidden sm:inline">Export</span>
            </UButton>
          </UDropdown>

          <UButton
            v-if="!isTicketMode"
            color="gray"
            variant="outline"
            icon="i-heroicons-envelope"
            :loading="resendLoading"
            @click="resendQrEmails()"
          >
            <span class="hidden sm:inline">Resend QR emails</span>
            <span class="sm:hidden">Resend QR</span>
          </UButton>

          <UButton
            :to="`/dashboard/events/${eventId}/check-in`"
            color="primary"
            icon="i-heroicons-qr-code"
          >
            <span class="hidden sm:inline">Check-in Scanner</span>
            <span class="sm:hidden">Scan</span>
          </UButton>
        </div>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8" :class="{ 'lg:grid-cols-7': !isTicketMode, 'lg:grid-cols-5': isTicketMode }">
        <UCard class="text-center">
          <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ stats.total }}</p>
          <p class="text-sm text-gray-500">Total</p>
        </UCard>
        <UCard class="text-center">
          <p class="text-2xl font-bold text-green-600">{{ stats.confirmed }}</p>
          <p class="text-sm text-gray-500">{{ isTicketMode ? 'Paid' : 'Confirmed' }}</p>
        </UCard>
        <UCard class="text-center">
          <p class="text-2xl font-bold text-yellow-600">{{ stats.pending }}</p>
          <p class="text-sm text-gray-500">Pending</p>
        </UCard>
        <!-- Waitlisted and Declined only apply to RSVP events -->
        <UCard v-if="!isTicketMode" class="text-center">
          <p class="text-2xl font-bold text-orange-600">{{ stats.waitlisted }}</p>
          <p class="text-sm text-gray-500">Waitlisted</p>
        </UCard>
        <UCard v-if="!isTicketMode" class="text-center">
          <p class="text-2xl font-bold text-red-600">{{ stats.declined }}</p>
          <p class="text-sm text-gray-500">Declined</p>
        </UCard>
        <UCard class="text-center">
          <p class="text-2xl font-bold text-gray-600">{{ stats.cancelled }}</p>
          <p class="text-sm text-gray-500">Cancelled</p>
        </UCard>
        <UCard class="text-center">
          <p class="text-2xl font-bold text-primary">{{ stats.checkedIn }}</p>
          <p class="text-sm text-gray-500">Checked In</p>
        </UCard>
      </div>

      <!-- Ticket Type Breakdown -->
      <div v-if="isTicketMode && ticketTypeStats.length > 0" class="mb-8">
        <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">Sales by Ticket Type</h3>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <UCard v-for="tt in ticketTypeStats" :key="tt.id" class="text-center">
            <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ tt.sold }}</p>
            <p class="text-sm text-gray-500">{{ tt.name }}</p>
            <p v-if="tt.quantity != null" class="text-xs text-gray-400 mt-1">
              of {{ tt.quantity }}
            </p>
          </UCard>
        </div>
      </div>

      <!-- Filters & Actions -->
      <div class="flex flex-col md:flex-row gap-4 mb-6">
        <UInput
          v-model="searchQuery"
          placeholder="Search by name or email..."
          icon="i-heroicons-magnifying-glass"
          class="md:w-80"
        />

        <USelectMenu
          v-model="statusFilter"
          :options="statusOptions"
          value-attribute="value"
          option-attribute="label"
          placeholder="Filter by status"
          class="w-40"
        />

        <div class="flex-1" />

        <!-- Bulk Actions -->
        <div v-if="selectedIds.length > 0" class="flex items-center gap-2">
          <span class="text-sm text-gray-600 dark:text-gray-400">
            {{ selectedIds.length }} selected
          </span>
          <UButton
            color="green"
            variant="soft"
            size="sm"
            :loading="updateLoading"
            @click="bulkUpdateStatus('confirmed')"
          >
            {{ isTicketMode ? 'Mark Paid' : 'Confirm' }}
          </UButton>
          <UButton
            v-if="!isTicketMode"
            color="red"
            variant="soft"
            size="sm"
            :loading="updateLoading"
            @click="bulkUpdateStatus('declined')"
          >
            Decline
          </UButton>
          <UButton
            v-if="!isTicketMode"
            color="gray"
            variant="soft"
            size="sm"
            icon="i-heroicons-envelope"
            :loading="resendLoading"
            @click="resendQrEmails(selectedIds)"
          >
            Resend QR
          </UButton>
        </div>
      </div>

      <!-- Attendees Table -->
      <UCard>
        <div v-if="pending" class="space-y-4">
          <USkeleton v-for="i in 5" :key="i" class="h-16 w-full" />
        </div>

        <div v-else-if="attendees.length === 0" class="text-center py-12">
          <UIcon name="i-heroicons-users" class="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p class="text-gray-600 dark:text-gray-400">No attendees found</p>
        </div>

        <!-- Mobile Card View -->
        <div v-else class="md:hidden space-y-4">
          <!-- Select All for Mobile -->
          <div class="flex items-center justify-between px-1 pb-2 border-b border-gray-200 dark:border-gray-700">
            <label class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <UCheckbox :model-value="allSelected" @change="toggleAll" />
              Select all
            </label>
            <span class="text-sm text-gray-500">{{ attendees.length }} attendees</span>
          </div>

          <div
            v-for="attendee in attendees"
            :key="attendee.id"
            class="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
            :class="{ 'ring-2 ring-primary': selectedIds.includes(attendee.id) }"
          >
            <div class="flex items-start justify-between mb-3">
              <div class="flex items-center gap-3">
                <UCheckbox
                  :model-value="selectedIds.includes(attendee.id)"
                  @change="selectedIds.includes(attendee.id)
                    ? selectedIds = selectedIds.filter(id => id !== attendee.id)
                    : selectedIds.push(attendee.id)"
                />
                <UAvatar
                  :src="attendee.user?.avatarUrl ?? undefined"
                  :alt="attendee.user?.name ?? undefined"
                  size="sm"
                />
                <div>
                  <p class="font-medium text-gray-900 dark:text-white">
                    {{ attendee.user?.name }}
                  </p>
                  <p class="text-sm text-gray-500 truncate max-w-[180px]">{{ attendee.user?.email }}</p>
                </div>
              </div>
              <UBadge :color="getStatusColor(attendee.status)" variant="soft">
                {{ getStatusLabel(attendee.status) }}
              </UBadge>
            </div>

            <div class="space-y-2 mb-3 pl-9">
              <div v-if="isTicketMode && attendee.purchasedBy?.name" class="flex justify-between">
                <span class="text-sm text-gray-500">Purchased By</span>
                <span class="text-sm text-gray-900 dark:text-white">{{ attendee.purchasedBy.name }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-sm text-gray-500">{{ dateColumnLabel }}</span>
                <span class="text-sm text-gray-900 dark:text-white">
                  {{ attendee.respondedAt ? new Date(attendee.respondedAt).toLocaleDateString() : '-' }}
                </span>
              </div>
              <div class="flex justify-between">
                <span class="text-sm text-gray-500">Checked In</span>
                <span v-if="attendee.checkedInAt" class="text-sm text-green-600">
                  {{ new Date(attendee.checkedInAt).toLocaleTimeString() }}
                </span>
                <span v-else class="text-sm text-gray-400">-</span>
              </div>
            </div>

            <div class="flex flex-wrap gap-2 pt-3 border-t border-gray-100 dark:border-gray-800 pl-9">
              <UButton
                v-if="attendee.qrCode"
                color="primary"
                variant="soft"
                size="xs"
                icon="i-heroicons-qr-code"
                @click="viewQrCode(attendee)"
              >
                View QR
              </UButton>
              <UButton
                v-if="isTicketMode"
                color="primary"
                variant="soft"
                size="xs"
                icon="i-heroicons-arrow-down-tray"
                :loading="pdfDownloading"
                @click="downloadTicketPdf(attendee.id)"
              >
                PDF
              </UButton>
              <UButton
                v-if="attendee.status !== 'confirmed' && attendee.status !== 'checked_in'"
                color="green"
                variant="soft"
                size="xs"
                :loading="updateLoading"
                @click="updateStatus(attendee.id, 'confirmed')"
              >
                {{ isTicketMode ? 'Mark Paid' : 'Confirm' }}
              </UButton>
              <!-- Waitlist and Decline only apply to RSVP events -->
              <UButton
                v-if="!isTicketMode && attendee.status !== 'waitlisted'"
                color="yellow"
                variant="soft"
                size="xs"
                :loading="updateLoading"
                @click="updateStatus(attendee.id, 'waitlisted')"
              >
                Waitlist
              </UButton>
              <UButton
                v-if="!isTicketMode && attendee.status !== 'declined'"
                color="red"
                variant="soft"
                size="xs"
                :loading="updateLoading"
                @click="updateStatus(attendee.id, 'declined')"
              >
                Decline
              </UButton>
            </div>
          </div>
        </div>

        <!-- Desktop Table View -->
        <div class="hidden md:block overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="border-b border-gray-200 dark:border-gray-700">
                <th class="py-3 px-4 text-left">
                  <UCheckbox :model-value="allSelected" @change="toggleAll" />
                </th>
                <th class="py-3 px-4 text-left text-sm font-medium text-gray-500">Attendee</th>
                <th v-if="isTicketMode" class="py-3 px-4 text-left text-sm font-medium text-gray-500">Purchased By</th>
                <th class="py-3 px-4 text-left text-sm font-medium text-gray-500">Status</th>
                <th class="py-3 px-4 text-left text-sm font-medium text-gray-500">{{ dateColumnLabel }}</th>
                <th class="py-3 px-4 text-left text-sm font-medium text-gray-500">Checked In</th>
                <th class="py-3 px-4 text-right text-sm font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="attendee in attendees"
                :key="attendee.id"
                class="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
              >
                <td class="py-3 px-4">
                  <UCheckbox
                    :model-value="selectedIds.includes(attendee.id)"
                    @change="selectedIds.includes(attendee.id)
                      ? selectedIds = selectedIds.filter(id => id !== attendee.id)
                      : selectedIds.push(attendee.id)"
                  />
                </td>
                <td class="py-3 px-4">
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
                </td>
                <td v-if="isTicketMode" class="py-3 px-4">
                  <div v-if="attendee.purchasedBy?.name">
                    <p class="text-sm text-gray-900 dark:text-white">{{ attendee.purchasedBy.name }}</p>
                    <p class="text-xs text-gray-500">{{ attendee.purchasedBy.email }}</p>
                  </div>
                  <span v-else class="text-sm text-gray-400">-</span>
                </td>
                <td class="py-3 px-4">
                  <UBadge :color="getStatusColor(attendee.status)" variant="soft">
                    {{ getStatusLabel(attendee.status) }}
                  </UBadge>
                </td>
                <td class="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                  {{ attendee.respondedAt ? new Date(attendee.respondedAt).toLocaleDateString() : '-' }}
                </td>
                <td class="py-3 px-4">
                  <span v-if="attendee.checkedInAt" class="text-green-600 text-sm">
                    {{ new Date(attendee.checkedInAt).toLocaleTimeString() }}
                  </span>
                  <span v-else class="text-gray-400 text-sm">-</span>
                </td>
                <td class="py-3 px-4 text-right">
                  <UDropdown
                    :items="[[
                      ...(attendee.qrCode ? [{
                        label: 'View QR Code',
                        icon: 'i-heroicons-qr-code',
                        click: () => viewQrCode(attendee)
                      }] : []),
                      ...(isTicketMode ? [{
                        label: 'Download PDF',
                        icon: 'i-heroicons-arrow-down-tray',
                        click: () => downloadTicketPdf(attendee.id)
                      }] : []),
                      ...(attendee.status !== 'confirmed' && attendee.status !== 'checked_in' ? [{
                        label: isTicketMode ? 'Mark as Paid' : 'Confirm',
                        icon: 'i-heroicons-check',
                        click: () => updateStatus(attendee.id, 'confirmed')
                      }] : []),
                      // Waitlist and Decline only for RSVP events
                      ...(!isTicketMode ? [{
                        label: 'Waitlist',
                        icon: 'i-heroicons-clock',
                        disabled: attendee.status === 'waitlisted',
                        click: () => updateStatus(attendee.id, 'waitlisted')
                      },
                      {
                        label: 'Decline',
                        icon: 'i-heroicons-x-mark',
                        disabled: attendee.status === 'declined',
                        click: () => updateStatus(attendee.id, 'declined')
                      }] : []),
                    ]]"
                  >
                    <UButton
                      color="gray"
                      variant="ghost"
                      icon="i-heroicons-ellipsis-vertical"
                      :loading="updateLoading"
                    />
                  </UDropdown>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div v-if="meta && (meta.totalPages ?? 0) > 1" class="flex justify-center mt-6">
          <UPagination
            v-model="page"
            :page-count="meta.limit ?? 20"
            :total="meta.total ?? 0"
          />
        </div>
      </UCard>
    </div>
  </div>

  <!-- QR Code Modal -->
  <UModal v-model="showQrModal">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">QR Code</h3>
          <UButton color="gray" variant="ghost" icon="i-heroicons-x-mark" @click="showQrModal = false" />
        </div>
      </template>

      <div v-if="qrAttendee" class="flex flex-col items-center gap-4">
        <p class="text-sm text-gray-600 dark:text-gray-400">
          {{ qrAttendee.user?.name || qrAttendee.attendeeName || 'Attendee' }}
        </p>
        <p v-if="qrAttendee.ticketNumber" class="text-xs text-gray-500">
          {{ qrAttendee.ticketNumber }}
        </p>
        <img
          :src="`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrAttendee.qrCode)}`"
          :alt="`QR Code for ${qrAttendee.user?.name || 'attendee'}`"
          class="w-64 h-64"
        />
        <p class="text-xs text-gray-400 font-mono break-all text-center max-w-[280px]">
          {{ qrAttendee.qrCode }}
        </p>
        <UButton
          v-if="isTicketMode"
          color="primary"
          variant="soft"
          icon="i-heroicons-arrow-down-tray"
          @click="downloadTicketPdf(qrAttendee.id)"
          :loading="pdfDownloading"
        >
          Download PDF
        </UButton>
      </div>
    </UCard>
  </UModal>
</template>
