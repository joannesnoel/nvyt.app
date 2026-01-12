<script setup lang="ts">
definePageMeta({
  layout: 'default',
  middleware: 'auth',
})

const route = useRoute()
const toast = useToast()
const orderNumber = computed(() => route.params.orderNumber as string)

// Fetch order details
const { data: orderResponse, pending, error } = await useFetch(
  () => `/api/v1/orders/${orderNumber.value}`,
  { watch: [orderNumber] }
)

const order = computed(() => orderResponse.value?.data)

// Subscribe to real-time updates for this order
const { ticketUpdates } = useOrderUpdates(orderNumber)

// Watch for ticket updates and apply them in real-time
watch(ticketUpdates, (updates) => {
  if (updates.length === 0 || !orderResponse.value?.data?.tickets) return

  const latestUpdate = updates[updates.length - 1]

  // Find and update the ticket in the order data
  const ticketIndex = orderResponse.value.data.tickets.findIndex(
    (t: any) => t.id === latestUpdate.ticketId
  )

  if (ticketIndex !== -1) {
    // Update the ticket status reactively
    orderResponse.value.data.tickets[ticketIndex].status = latestUpdate.status
    orderResponse.value.data.tickets[ticketIndex].checkedInAt = latestUpdate.checkedInAt

    // Show toast notification
    toast.add({
      title: 'Ticket Checked In',
      description: `Ticket ${latestUpdate.ticketNumber} has been checked in.`,
      color: 'blue',
      icon: 'i-heroicons-check-circle',
    })
  }
}, { deep: true })

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatCurrency(amount: string | number) {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(num)
}

function getStatusColor(status: string) {
  switch (status) {
    case 'paid': return 'green'
    case 'pending': return 'yellow'
    case 'failed': return 'red'
    case 'refunded': return 'gray'
    default: return 'gray'
  }
}

function getTicketStatusColor(status: string) {
  switch (status) {
    case 'confirmed': return 'green'
    case 'pending': return 'yellow'
    case 'checked_in': return 'blue'
    case 'cancelled': return 'red'
    case 'refunded': return 'gray'
    default: return 'gray'
  }
}

// Download tickets
const downloading = ref(false)
const downloadingTicket = ref<string | null>(null)

async function downloadAllTickets() {
  if (!order.value) return

  downloading.value = true
  try {
    const response = await $fetch(`/api/v1/orders/${order.value.orderNumber}/tickets/download`, {
      responseType: 'blob',
    })

    // Create download link
    const url = window.URL.createObjectURL(response as Blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `tickets-${order.value.orderNumber}.pdf`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)

    toast.add({
      title: 'Download started',
      description: 'Your tickets PDF is being downloaded.',
      color: 'green',
    })
  } catch (e: any) {
    toast.add({
      title: 'Download failed',
      description: e.data?.message || 'Failed to download tickets',
      color: 'red',
    })
  } finally {
    downloading.value = false
  }
}

async function downloadSingleTicket(ticketId: string, ticketNumber: string) {
  downloadingTicket.value = ticketId
  try {
    const response = await $fetch(`/api/v1/tickets/${ticketId}/download`, {
      responseType: 'blob',
    })

    // Create download link
    const url = window.URL.createObjectURL(response as Blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `ticket-${ticketNumber}.pdf`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)

    toast.add({
      title: 'Download started',
      description: 'Your ticket PDF is being downloaded.',
      color: 'green',
    })
  } catch (e: any) {
    toast.add({
      title: 'Download failed',
      description: e.data?.message || 'Failed to download ticket',
      color: 'red',
    })
  } finally {
    downloadingTicket.value = null
  }
}

// Check if tickets can be downloaded
const canDownload = computed(() => {
  return order.value?.paymentStatus === 'paid' &&
    order.value?.tickets?.some((t: any) => t.status === 'confirmed' || t.status === 'checked_in')
})
</script>

<template>
  <div class="py-12">
    <div class="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Back Link -->
      <NuxtLink
        to="/tickets"
        class="inline-flex items-center gap-1 text-gray-600 dark:text-gray-400 hover:text-primary mb-6"
      >
        <UIcon name="i-heroicons-arrow-left" class="w-4 h-4" />
        Back to My Tickets
      </NuxtLink>

      <!-- Loading -->
      <div v-if="pending" class="text-center py-20">
        <UIcon name="i-heroicons-arrow-path" class="w-12 h-12 text-primary mx-auto mb-4 animate-spin" />
        <p class="text-gray-600 dark:text-gray-400">Loading order details...</p>
      </div>

      <!-- Error -->
      <div v-else-if="error || !order" class="text-center py-20">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">Order Not Found</h1>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          We couldn't find this order or you don't have access to it.
        </p>
        <UButton to="/tickets" color="primary">Go to My Tickets</UButton>
      </div>

      <!-- Order Details -->
      <div v-else>
        <!-- Order Header -->
        <div class="mb-6">
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Order Details</h1>
        </div>

        <!-- Order Summary Card -->
        <UCard class="mb-6">
          <template #header>
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-gray-500">Order Number</p>
                <p class="font-mono font-bold text-gray-900 dark:text-white">{{ order.orderNumber }}</p>
              </div>
              <UBadge :color="getStatusColor(order.paymentStatus)" size="lg">
                {{ order.paymentStatus }}
              </UBadge>
            </div>
          </template>

          <!-- Event Info -->
          <div class="flex items-start gap-4 pb-4 border-b border-gray-200 dark:border-gray-700">
            <div
              class="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0"
            >
              <img
                v-if="order.event?.coverImage"
                :src="order.event.coverImage"
                :alt="order.event.title"
                class="w-full h-full object-cover rounded-lg"
              >
              <UIcon v-else name="i-heroicons-calendar" class="w-8 h-8 text-gray-400" />
            </div>
            <div>
              <NuxtLink
                :to="`/events/${order.event?.slug}`"
                class="font-semibold text-gray-900 dark:text-white hover:text-primary"
              >
                {{ order.event?.title }}
              </NuxtLink>
              <p class="text-sm text-gray-500">{{ formatDate(order.event?.startDate) }}</p>
              <p v-if="order.event?.location" class="text-sm text-gray-500">{{ order.event?.location }}</p>
            </div>
          </div>

          <!-- Tickets -->
          <div class="py-4">
            <h4 class="font-medium text-gray-900 dark:text-white mb-3">Tickets</h4>
            <div class="space-y-3">
              <div
                v-for="ticket in order.tickets"
                :key="ticket.id"
                class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
              >
                <div>
                  <p class="font-medium text-gray-900 dark:text-white">
                    {{ ticket.ticketType?.name }}
                  </p>
                  <p class="text-sm text-gray-500">
                    {{ ticket.ticketNumber }}
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  <UBadge
                    :color="getTicketStatusColor(ticket.status)"
                    variant="soft"
                  >
                    {{ ticket.status.replace('_', ' ') }}
                  </UBadge>
                  <UButton
                    v-if="ticket.status === 'confirmed' || ticket.status === 'checked_in'"
                    color="gray"
                    variant="ghost"
                    size="xs"
                    icon="i-heroicons-arrow-down-tray"
                    :loading="downloadingTicket === ticket.id"
                    @click="downloadSingleTicket(ticket.id, ticket.ticketNumber)"
                  >
                    PDF
                  </UButton>
                  <UButton
                    :to="`/tickets/${ticket.id}`"
                    color="gray"
                    variant="ghost"
                    size="xs"
                    icon="i-heroicons-qr-code"
                  >
                    QR
                  </UButton>
                </div>
              </div>
            </div>
          </div>

          <!-- Order Info -->
          <div class="py-4 border-t border-gray-200 dark:border-gray-700 space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-gray-500">Order Date</span>
              <span class="text-gray-900 dark:text-white">{{ formatDate(order.createdAt) }}</span>
            </div>
            <div v-if="order.paidAt" class="flex justify-between">
              <span class="text-gray-500">Paid Date</span>
              <span class="text-gray-900 dark:text-white">{{ formatDate(order.paidAt) }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500">Customer</span>
              <span class="text-gray-900 dark:text-white">{{ order.customerName }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500">Email</span>
              <span class="text-gray-900 dark:text-white">{{ order.customerEmail }}</span>
            </div>
          </div>

          <!-- Total -->
          <div class="pt-4 border-t border-gray-200 dark:border-gray-700">
            <div class="flex items-center justify-between">
              <span class="font-medium text-gray-900 dark:text-white">Total</span>
              <span class="text-xl font-bold text-primary">
                {{ parseFloat(order.totalAmount) === 0 ? 'Free' : formatCurrency(order.totalAmount) }}
              </span>
            </div>
          </div>
        </UCard>

        <!-- Actions -->
        <div class="flex flex-col sm:flex-row gap-3">
          <UButton
            v-if="canDownload"
            color="primary"
            block
            size="lg"
            icon="i-heroicons-arrow-down-tray"
            :loading="downloading"
            @click="downloadAllTickets"
          >
            Download All Tickets (PDF)
          </UButton>
          <UButton
            to="/tickets"
            :color="canDownload ? 'gray' : 'primary'"
            :variant="canDownload ? 'outline' : 'solid'"
            block
            size="lg"
            icon="i-heroicons-ticket"
          >
            View My Tickets
          </UButton>
          <UButton
            :to="`/events/${order.event?.slug}`"
            color="gray"
            variant="outline"
            block
            size="lg"
            icon="i-heroicons-calendar"
          >
            Back to Event
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>
