<script setup lang="ts">
definePageMeta({
  layout: 'default',
  middleware: 'auth',
})

const route = useRoute()
const toast = useToast()
const orderNumber = computed(() => route.params.orderNumber as string)

useHead(() => ({ title: `Order ${orderNumber.value} - NVYT` }))

// Fetch order details
const { data: orderResponse, pending, error } = await useFetch<{
  data?: {
    id: string
    orderNumber: string
    event: any
    tickets: any[]
    subtotalAmount?: string
    processingFee?: string
    adminFee?: string
    totalFees?: string
    totalAmount: string
    paymentStatus: string
    customerName: string
    customerEmail: string
    createdAt: string
    paidAt?: string | null
    isOrganizer?: boolean
    hasRegistrationFields?: boolean
    registrationStats?: {
      total: number
      completed: number
      pending: number
    } | null
  }
}>(
  () => `/api/v1/orders/${orderNumber.value}`,
  { watch: [orderNumber] }
)

const order = computed(() => orderResponse.value?.data)

// Registration status
const hasIncompleteRegistration = computed(() => {
  if (!order.value?.hasRegistrationFields) return false
  if (order.value?.paymentStatus !== 'paid') return false
  return (order.value?.registrationStats?.pending ?? 0) > 0
})

// Subscribe to real-time updates for this order
const { ticketUpdates } = useOrderUpdates(orderNumber)

// Watch for ticket updates and apply them in real-time
watch(ticketUpdates, (updates) => {
  if (updates.length === 0 || !orderResponse.value?.data?.tickets) return

  const latestUpdate = updates[updates.length - 1]
  if (!latestUpdate) return

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
    const url = window.URL.createObjectURL(response as unknown as Blob)
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
    const url = window.URL.createObjectURL(response as unknown as Blob)
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

// Check if payment can be retried
const canRetryPayment = computed(() => {
  return (order.value?.paymentStatus === 'pending' || order.value?.paymentStatus === 'failed') &&
    parseFloat(order.value?.totalAmount || '0') > 0
})

// Cancel order
const cancellingOrder = ref(false)
const showCancelConfirm = ref(false)

async function cancelOrder() {
  if (!order.value) return

  cancellingOrder.value = true
  try {
    await $fetch(`/api/v1/orders/${order.value.orderNumber}/cancel`, {
      method: 'POST',
    })

    toast.add({
      title: 'Order Cancelled',
      description: 'Your order has been cancelled and reserved tickets have been released.',
      color: 'green',
      icon: 'i-heroicons-check-circle',
    })

    showCancelConfirm.value = false
    navigateTo('/tickets')
  } catch (e: any) {
    toast.add({
      title: 'Cancellation failed',
      description: e.data?.message || 'Failed to cancel order. Please try again.',
      color: 'red',
    })
  } finally {
    cancellingOrder.value = false
  }
}

// Retry payment
const retryingPayment = ref(false)

async function retryPayment() {
  if (!order.value) return

  retryingPayment.value = true
  try {
    const response = await $fetch(`/api/v1/orders/${order.value.orderNumber}/retry-payment`, {
      method: 'POST',
    }) as any

    if (response.data?.alreadyPaid) {
      // Payment was already confirmed - show success and refresh
      toast.add({
        title: 'Payment Confirmed',
        description: response.data.message || 'Your payment has been confirmed!',
        color: 'green',
        icon: 'i-heroicons-check-circle',
      })
      // Refresh the page to show updated status
      window.location.reload()
    } else if (response.data?.checkoutUrl) {
      window.location.href = response.data.checkoutUrl
    }
  } catch (e: any) {
    toast.add({
      title: 'Payment retry failed',
      description: e.data?.message || 'Failed to retry payment. Please try again.',
      color: 'red',
    })
    retryingPayment.value = false
  }
}
</script>

<template>
  <div class="py-12">
    <div class="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Back Link -->
      <NuxtLink
        :to="order?.isOrganizer ? `/dashboard/events/${order?.event?.id}/orders` : '/tickets'"
        class="inline-flex items-center gap-1 text-gray-600 dark:text-gray-400 hover:text-primary mb-6"
      >
        <UIcon name="i-heroicons-arrow-left" class="w-4 h-4" />
        {{ order?.isOrganizer ? 'Back to Event Dashboard' : 'Back to My Tickets' }}
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
        <!-- Organizer Banner -->
        <UAlert
          v-if="order.isOrganizer"
          color="blue"
          icon="i-heroicons-eye"
          class="mb-6"
        >
          <template #title>Viewing as organizer</template>
          <template #description>
            This order was placed by {{ order.customerName }} ({{ order.customerEmail }}).
          </template>
        </UAlert>

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
                  <UBadge
                    v-if="order.hasRegistrationFields && order.paymentStatus === 'paid'"
                    :color="ticket.registrationCompleted ? 'green' : 'yellow'"
                    variant="soft"
                  >
                    {{ ticket.registrationCompleted ? 'Registered' : 'Pending' }}
                  </UBadge>
                  <template v-if="!order.isOrganizer">
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
                  </template>
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

          <!-- Fee Breakdown (for pending/failed orders with fees) -->
          <div v-if="canRetryPayment && order.totalFees && parseFloat(order.totalFees) > 0" class="pt-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
            <div class="flex items-center justify-between text-sm">
              <span class="text-gray-600 dark:text-gray-400">Subtotal</span>
              <span class="text-gray-900 dark:text-white">{{ formatCurrency(order.subtotalAmount || '0') }}</span>
            </div>
            <div v-if="order.adminFee && parseFloat(order.adminFee) > 0" class="flex items-center justify-between text-sm">
              <span class="text-gray-600 dark:text-gray-400">Platform Fee</span>
              <span class="text-gray-900 dark:text-white">{{ formatCurrency(order.adminFee) }}</span>
            </div>
            <div v-if="order.processingFee && parseFloat(order.processingFee) > 0" class="flex items-center justify-between text-sm">
              <span class="text-gray-600 dark:text-gray-400">Payment Fee</span>
              <span class="text-gray-900 dark:text-white">{{ formatCurrency(order.processingFee) }}</span>
            </div>
            <div class="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
              <span class="font-medium text-gray-900 dark:text-white">Total</span>
              <span class="text-xl font-bold text-primary">
                {{ formatCurrency(order.totalAmount) }}
              </span>
            </div>
          </div>

          <!-- Total (for paid orders or orders without fee breakdown) -->
          <div v-else class="pt-4 border-t border-gray-200 dark:border-gray-700">
            <div class="flex items-center justify-between">
              <span class="font-medium text-gray-900 dark:text-white">Total</span>
              <span class="text-xl font-bold text-primary">
                {{ parseFloat(order.totalAmount) === 0 ? 'Free' : formatCurrency(order.totalAmount) }}
              </span>
            </div>
          </div>
        </UCard>

        <!-- Registration Incomplete Alert -->
        <UCard v-if="hasIncompleteRegistration && !order.isOrganizer" class="mb-6 border-2 border-primary">
          <div class="flex items-start gap-4">
            <div class="p-3 bg-primary-100 dark:bg-primary-900/30 rounded-full">
              <UIcon name="i-heroicons-clipboard-document-list" class="w-6 h-6 text-primary" />
            </div>
            <div class="flex-1">
              <h3 class="font-semibold text-gray-900 dark:text-white mb-1">
                Complete Your Registration
              </h3>
              <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">
                {{ order.registrationStats?.pending === order.registrationStats?.total
                  ? 'Please provide attendee information for your tickets.'
                  : `${order.registrationStats?.pending} of ${order.registrationStats?.total} tickets still need registration details.`
                }}
              </p>
              <UButton
                :to="`/orders/${order.orderNumber}/register`"
                color="primary"
                icon="i-heroicons-pencil-square"
              >
                Complete Registration
              </UButton>
            </div>
          </div>
        </UCard>

        <!-- Payment Pending/Failed Alert -->
        <UAlert
          v-if="canRetryPayment && !order.isOrganizer"
          :color="order.paymentStatus === 'failed' ? 'red' : 'yellow'"
          :icon="order.paymentStatus === 'failed' ? 'i-heroicons-x-circle' : 'i-heroicons-clock'"
          class="mb-6"
        >
          <template #title>
            {{ order.paymentStatus === 'failed' ? 'Payment Failed' : 'Payment Pending' }}
          </template>
          <template #description>
            {{ order.paymentStatus === 'failed'
              ? 'Your payment was not successful. Please retry to complete your order.'
              : 'Your payment has not been completed. Please complete payment to receive your tickets.'
            }}
          </template>
        </UAlert>

        <!-- Actions -->
        <div class="flex flex-col gap-3">
          <template v-if="!order.isOrganizer">
            <UButton
              v-if="canRetryPayment"
              color="primary"
              block
              size="lg"
              icon="i-heroicons-credit-card"
              :loading="retryingPayment"
              @click="retryPayment"
            >
              {{ order.paymentStatus === 'failed' ? 'Retry Payment' : 'Complete Payment' }}
            </UButton>
            <UButton
              v-if="canRetryPayment && order.paymentStatus === 'pending'"
              color="red"
              variant="outline"
              block
              size="lg"
              icon="i-heroicons-x-mark"
              @click="showCancelConfirm = true"
            >
              Cancel Order
            </UButton>
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
              :color="canDownload || canRetryPayment ? 'gray' : 'primary'"
              :variant="canDownload || canRetryPayment ? 'outline' : 'solid'"
              block
              size="lg"
              icon="i-heroicons-ticket"
            >
              View My Tickets
            </UButton>
          </template>
          <UButton
            :to="order.isOrganizer ? `/events/${order.event?.slug}/dashboard` : `/events/${order.event?.slug}`"
            color="gray"
            variant="outline"
            block
            size="lg"
            :icon="order.isOrganizer ? 'i-heroicons-chart-bar' : 'i-heroicons-calendar'"
          >
            {{ order.isOrganizer ? 'Back to Event Dashboard' : 'Back to Event' }}
          </UButton>
        </div>
      </div>

      <!-- Cancel Order Confirmation Modal -->
      <UModal v-model="showCancelConfirm">
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-red-500" />
              <h3 class="font-semibold text-gray-900 dark:text-white">Cancel Order</h3>
            </div>
          </template>

          <p class="text-gray-600 dark:text-gray-400">
            Are you sure you want to cancel this order? Your reserved tickets will be released and this action cannot be undone.
          </p>

          <template #footer>
            <div class="flex justify-end gap-3">
              <UButton
                color="gray"
                variant="outline"
                @click="showCancelConfirm = false"
              >
                Keep Order
              </UButton>
              <UButton
                color="red"
                :loading="cancellingOrder"
                @click="cancelOrder"
              >
                Cancel Order
              </UButton>
            </div>
          </template>
        </UCard>
      </UModal>
    </div>
  </div>
</template>
