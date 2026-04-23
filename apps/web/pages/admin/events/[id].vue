<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
})

const route = useRoute()
const toast = useToast()
const eventId = computed(() => route.params.id as string)

// Fetch event detail
const { data, pending } = await useFetch(
  () => `/api/v1/admin/events/${eventId.value}`,
  { watch: [eventId] }
)

const event = computed(() => data.value?.data?.event)

useHead(() => ({ title: event.value?.title ? `${event.value.title} - Admin - NVYT` : 'NVYT' }))
const stats = computed(() => data.value?.data?.stats)
const recentOrders = computed(() => data.value?.data?.recentOrders || [])
const ticketTypes = computed(() => data.value?.data?.ticketTypes || [])
const verification = computed(() => data.value?.data?.verification)

const isTicketMode = computed(() => event.value?.registrationMode === 'tickets')

function formatDate(date: string | Date) {
  return new Date(date).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatShortDate(date: string | Date) {
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatCurrency(amount: number | string) {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num)
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

function getStatusLabel(status: string) {
  return status === 'published' ? 'Live' : status.charAt(0).toUpperCase() + status.slice(1)
}

function getPaymentStatusColor(status: string) {
  switch (status) {
    case 'paid': return 'green'
    case 'pending': return 'yellow'
    case 'refunded': return 'gray'
    default: return 'gray'
  }
}

function getVerificationStatusColor(status: string) {
  switch (status) {
    case 'approved': return 'green'
    case 'pending': return 'yellow'
    case 'under_review': return 'blue'
    case 'rejected': return 'red'
    default: return 'gray'
  }
}

function getVerificationStatusLabel(status: string) {
  switch (status) {
    case 'approved': return 'Verified'
    case 'pending': return 'Pending Review'
    case 'under_review': return 'Under Review'
    case 'rejected': return 'Rejected'
    case 'draft': return 'Draft'
    case 'not_required': return 'Not Required'
    default: return status
  }
}

// Impersonate organizer
const { fetchUser } = useAuth()
const impersonating = ref(false)

async function impersonateOrganizer() {
  if (!event.value?.organizer?.id) return
  impersonating.value = true
  try {
    await $fetch('/api/v1/admin/impersonate', {
      method: 'POST',
      body: { userId: event.value.organizer.id },
    })
    await fetchUser()
    await navigateTo('/dashboard')
  } catch (e: any) {
    toast.add({ title: e?.data?.message || 'Failed to impersonate', color: 'red' })
    impersonating.value = false
  }
}

// Service Agreement
const { data: agreementData, refresh: refreshAgreement } = await useFetch(
  () => `/api/v1/admin/events/${eventId.value}/service-agreement`,
  { watch: [eventId] }
)
const agreement = computed(() => (agreementData.value as any)?.data ?? null)
const generatingAgreement = ref(false)
const publishingAgreement = ref(false)
const showAgreementPreview = ref(false)

async function generateAgreement() {
  generatingAgreement.value = true
  try {
    await $fetch(`/api/v1/admin/events/${eventId.value}/service-agreement`, {
      method: 'POST',
    })
    await refreshAgreement()
    toast.add({ title: 'Service agreement drafted', color: 'green' })
    showAgreementPreview.value = true
  } catch (e: any) {
    toast.add({ title: 'Error', description: e?.data?.message || 'Failed to generate agreement', color: 'red' })
  } finally {
    generatingAgreement.value = false
  }
}

async function toggleAgreementStatus() {
  if (!agreement.value) return
  const newStatus = agreement.value.status === 'published' ? 'draft' : 'published'
  publishingAgreement.value = true
  try {
    await $fetch(`/api/v1/admin/events/${eventId.value}/service-agreement`, {
      method: 'PATCH',
      body: { status: newStatus },
    })
    await refreshAgreement()
    toast.add({
      title: newStatus === 'published' ? 'Agreement published' : 'Agreement unpublished',
      description: newStatus === 'published' ? 'The organizer can now view and print this agreement.' : undefined,
      color: 'green',
    })
  } catch (e: any) {
    toast.add({ title: 'Error', description: e?.data?.message || 'Failed to update agreement', color: 'red' })
  } finally {
    publishingAgreement.value = false
  }
}
</script>

<template>
  <div>
    <!-- Back Button -->
    <div class="mb-6">
      <UButton
        to="/admin/events"
        color="gray"
        variant="ghost"
        icon="i-heroicons-arrow-left"
        size="sm"
      >
        Back to Events
      </UButton>
    </div>

    <!-- Loading -->
    <div v-if="pending" class="space-y-4">
      <USkeleton class="h-8 w-1/3" />
      <USkeleton class="h-4 w-1/4" />
      <div class="grid md:grid-cols-4 gap-4 mt-8">
        <USkeleton v-for="i in 4" :key="i" class="h-24" />
      </div>
    </div>

    <!-- Event Detail -->
    <div v-else-if="event">
      <!-- Header -->
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <div class="flex items-center gap-3">
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
              {{ event.title }}
            </h1>
            <UBadge :color="getStatusColor(event.status)" variant="soft">
              {{ getStatusLabel(event.status) }}
            </UBadge>
          </div>
          <p class="text-gray-600 dark:text-gray-400 mt-1">
            {{ formatDate(event.startDate) }}
            <span v-if="event.location"> &middot; {{ event.location }}</span>
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <UButton
            color="primary"
            variant="outline"
            icon="i-heroicons-arrow-right-on-rectangle"
            :loading="impersonating"
            @click="impersonateOrganizer"
          >
            Impersonate Organizer
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
            :to="`/dashboard/events/${event.id}`"
            color="gray"
            variant="outline"
            icon="i-heroicons-chart-bar"
            target="_blank"
          >
            Organizer Dashboard
          </UButton>
        </div>
      </div>

      <!-- Metric Cards -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <AdminStatCard
          title="Registrations"
          :value="stats?.registrations ?? 0"
          icon="i-heroicons-users"
          color="indigo"
        />
        <AdminStatCard
          title="Gross Revenue"
          :value="isTicketMode ? formatCurrency(stats?.orders?.grossRevenue ?? 0) : '-'"
          icon="i-heroicons-banknotes"
          color="green"
        />
        <AdminStatCard
          title="Net Revenue"
          :value="isTicketMode ? formatCurrency(stats?.orders?.netRevenue ?? 0) : '-'"
          icon="i-heroicons-currency-dollar"
          color="blue"
        />
        <AdminStatCard
          title="Check-in Rate"
          :value="`${stats?.tickets?.checkInRate ?? 0}%`"
          :subtitle="`${stats?.tickets?.checkedIn ?? 0} of ${stats?.tickets?.totalTickets ?? 0} checked in`"
          icon="i-heroicons-check-circle"
          color="yellow"
        />
      </div>

      <!-- Main Content Grid -->
      <div class="grid lg:grid-cols-3 gap-6">
        <!-- Left Column (2/3) -->
        <div class="lg:col-span-2 space-y-6">
          <!-- Recent Orders (ticket events) -->
          <UCard v-if="isTicketMode">
            <template #header>
              <h2 class="font-semibold text-gray-900 dark:text-white">Recent Orders</h2>
            </template>

            <div v-if="recentOrders.length === 0" class="text-center py-8">
              <UIcon name="i-heroicons-ticket" class="w-10 h-10 text-gray-400 mx-auto mb-2" />
              <p class="text-gray-500">No orders yet</p>
            </div>

            <div v-else class="overflow-x-auto -mx-4 sm:mx-0">
              <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead>
                  <tr>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Order #</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                    <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                    <th class="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Tickets</th>
                    <th class="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                  <tr v-for="order in recentOrders" :key="order.id" class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td class="px-4 py-2 text-sm font-mono text-gray-900 dark:text-white">
                      {{ order.orderNumber }}
                    </td>
                    <td class="px-4 py-2">
                      <p class="text-sm font-medium text-gray-900 dark:text-white">{{ order.customerName }}</p>
                      <p class="text-xs text-gray-500">{{ order.customerEmail }}</p>
                    </td>
                    <td class="px-4 py-2 text-sm text-right text-gray-900 dark:text-white">
                      {{ formatCurrency(order.totalAmount) }}
                    </td>
                    <td class="px-4 py-2 text-sm text-center text-gray-900 dark:text-white">
                      {{ order.ticketCount }}
                    </td>
                    <td class="px-4 py-2 text-center">
                      <UBadge :color="getPaymentStatusColor(order.paymentStatus)" variant="soft" size="xs">
                        {{ order.paymentStatus }}
                      </UBadge>
                    </td>
                    <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                      {{ formatShortDate(order.createdAt) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </UCard>

          <!-- Ticket Types (ticket events) -->
          <UCard v-if="isTicketMode && ticketTypes.length > 0">
            <template #header>
              <h2 class="font-semibold text-gray-900 dark:text-white">Ticket Types</h2>
            </template>

            <div class="overflow-x-auto -mx-4 sm:mx-0">
              <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead>
                  <tr>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Price</th>
                    <th class="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Sold / Total</th>
                    <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                  <tr v-for="tt in ticketTypes" :key="tt.id" class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td class="px-4 py-2">
                      <div class="flex items-center gap-2">
                        <span class="text-sm font-medium text-gray-900 dark:text-white">{{ tt.name }}</span>
                        <UBadge v-if="tt.status === 'sold_out'" color="red" variant="soft" size="xs">Sold Out</UBadge>
                        <UBadge v-else-if="tt.status === 'disabled'" color="gray" variant="soft" size="xs">Disabled</UBadge>
                      </div>
                    </td>
                    <td class="px-4 py-2 text-sm text-right text-gray-900 dark:text-white">
                      {{ tt.price === 0 ? 'Free' : formatCurrency(tt.price) }}
                    </td>
                    <td class="px-4 py-2 text-sm text-center text-gray-900 dark:text-white">
                      {{ tt.quantitySold }} / {{ tt.quantity ?? '∞' }}
                    </td>
                    <td class="px-4 py-2 text-sm text-right text-gray-900 dark:text-white">
                      {{ formatCurrency(tt.revenue) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </UCard>

          <!-- Attendee Stats (RSVP/open events) -->
          <UCard v-if="!isTicketMode">
            <template #header>
              <h2 class="font-semibold text-gray-900 dark:text-white">Attendee Breakdown</h2>
            </template>

            <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div class="text-center p-4">
                <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ stats?.attendees?.total ?? 0 }}</p>
                <p class="text-sm text-gray-500">Total</p>
              </div>
              <div class="text-center p-4">
                <p class="text-2xl font-bold text-green-600">{{ stats?.attendees?.confirmed ?? 0 }}</p>
                <p class="text-sm text-gray-500">Confirmed</p>
              </div>
              <div class="text-center p-4">
                <p class="text-2xl font-bold text-yellow-600">{{ stats?.attendees?.pending ?? 0 }}</p>
                <p class="text-sm text-gray-500">Pending</p>
              </div>
              <div class="text-center p-4">
                <p class="text-2xl font-bold text-blue-600">{{ stats?.attendees?.checkedIn ?? 0 }}</p>
                <p class="text-sm text-gray-500">Checked In</p>
              </div>
            </div>
          </UCard>
        </div>

        <!-- Sidebar (1/3) -->
        <div class="space-y-6">
          <!-- Event Info -->
          <UCard>
            <template #header>
              <h2 class="font-semibold text-gray-900 dark:text-white">Event Info</h2>
            </template>

            <div class="space-y-4">
              <div>
                <p class="text-sm text-gray-500 mb-1">Organizer</p>
                <div class="flex items-center gap-2">
                  <UAvatar :src="event.organizer.avatarUrl || undefined" :alt="event.organizer.name" size="xs" />
                  <div>
                    <p class="text-sm font-medium text-gray-900 dark:text-white">{{ event.organizer.name }}</p>
                    <p class="text-xs text-gray-500">{{ event.organizer.email }}</p>
                  </div>
                </div>
              </div>

              <div>
                <p class="text-sm text-gray-500 mb-1">Visibility</p>
                <UBadge :color="event.visibility === 'public' ? 'green' : 'gray'" variant="soft">
                  {{ event.visibility }}
                </UBadge>
              </div>

              <div>
                <p class="text-sm text-gray-500 mb-1">Registration Mode</p>
                <UBadge color="indigo" variant="soft">
                  {{ event.registrationMode }}
                </UBadge>
              </div>

              <div>
                <p class="text-sm text-gray-500 mb-1">Capacity</p>
                <p class="text-sm font-medium text-gray-900 dark:text-white">
                  {{ event.maxAttendees ? `${event.maxAttendees} max` : 'Unlimited' }}
                </p>
              </div>

              <div>
                <p class="text-sm text-gray-500 mb-1">Created</p>
                <p class="text-sm font-medium text-gray-900 dark:text-white">
                  {{ formatDate(event.createdAt) }}
                </p>
              </div>
            </div>
          </UCard>

          <!-- Verification Info -->
          <UCard v-if="verification">
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="font-semibold text-gray-900 dark:text-white">Verification</h2>
                <UBadge :color="getVerificationStatusColor(verification.status)" variant="soft" size="xs">
                  {{ getVerificationStatusLabel(verification.status) }}
                </UBadge>
              </div>
            </template>

            <div class="space-y-3">
              <div>
                <p class="text-sm text-gray-500">Business Name</p>
                <p class="text-sm font-medium text-gray-900 dark:text-white">{{ verification.businessName }}</p>
              </div>
              <div v-if="verification.businessType">
                <p class="text-sm text-gray-500">Business Type</p>
                <p class="text-sm font-medium text-gray-900 dark:text-white">{{ verification.businessType }}</p>
              </div>
              <div>
                <p class="text-sm text-gray-500">Country</p>
                <p class="text-sm font-medium text-gray-900 dark:text-white">{{ verification.country }}</p>
              </div>
              <div v-if="verification.adminFeeRate">
                <p class="text-sm text-gray-500">Admin Fee Rate</p>
                <p class="text-sm font-medium text-gray-900 dark:text-white">{{ (parseFloat(verification.adminFeeRate) * 100).toFixed(2) }}%</p>
              </div>
            </div>
          </UCard>

          <!-- No Verification -->
          <UCard v-else-if="isTicketMode">
            <template #header>
              <h2 class="font-semibold text-gray-900 dark:text-white">Verification</h2>
            </template>
            <p class="text-sm text-gray-500">No verification submitted for this event.</p>
          </UCard>

          <!-- Service Agreement -->
          <UCard v-if="isTicketMode">
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="font-semibold text-gray-900 dark:text-white">Service Agreement</h2>
                <UBadge v-if="agreement" :color="agreement.status === 'published' ? 'green' : 'yellow'" variant="soft" size="xs">
                  {{ agreement.status === 'published' ? 'Published' : 'Draft' }}
                </UBadge>
              </div>
            </template>

            <div v-if="agreement" class="space-y-3">
              <p class="text-sm text-gray-500">
                Generated {{ new Date(agreement.createdAt).toLocaleDateString() }}
                <span v-if="agreement.updatedAt !== agreement.createdAt">
                  &middot; Updated {{ new Date(agreement.updatedAt).toLocaleDateString() }}
                </span>
              </p>

              <div class="flex flex-wrap gap-2">
                <UButton
                  size="sm"
                  color="primary"
                  variant="soft"
                  icon="i-heroicons-eye"
                  @click="showAgreementPreview = true"
                >
                  Preview
                </UButton>
                <UButton
                  size="sm"
                  color="gray"
                  variant="soft"
                  icon="i-heroicons-arrow-path"
                  :loading="generatingAgreement"
                  @click="generateAgreement"
                >
                  Regenerate
                </UButton>
                <UButton
                  size="sm"
                  :color="agreement.status === 'published' ? 'yellow' : 'green'"
                  variant="soft"
                  :icon="agreement.status === 'published' ? 'i-heroicons-eye-slash' : 'i-heroicons-check-circle'"
                  :loading="publishingAgreement"
                  @click="toggleAgreementStatus"
                >
                  {{ agreement.status === 'published' ? 'Unpublish' : 'Publish' }}
                </UButton>
              </div>
            </div>

            <div v-else class="space-y-3">
              <p class="text-sm text-gray-500">No service agreement has been drafted for this event.</p>
              <UButton
                size="sm"
                color="primary"
                icon="i-heroicons-document-text"
                :loading="generatingAgreement"
                @click="generateAgreement"
              >
                Draft Agreement
              </UButton>
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
        This event doesn't exist.
      </p>
      <UButton to="/admin/events" color="primary">Back to Events</UButton>
    </div>

    <!-- Service Agreement Preview Modal -->
    <UModal v-model="showAgreementPreview" :ui="{ width: 'max-w-4xl' }">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Service Agreement Preview</h3>
            <UButton color="gray" variant="ghost" icon="i-heroicons-x-mark" @click="showAgreementPreview = false" />
          </div>
        </template>

        <div v-if="agreement" class="prose dark:prose-invert max-w-none overflow-auto max-h-[70vh]">
          <div v-html="agreement.content" />
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="soft" @click="showAgreementPreview = false">Close</UButton>
            <UButton
              v-if="agreement?.status !== 'published'"
              color="green"
              icon="i-heroicons-check-circle"
              :loading="publishingAgreement"
              @click="toggleAgreementStatus"
            >
              Publish
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
