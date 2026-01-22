<script setup lang="ts">
definePageMeta({
  layout: 'default',
})

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { user } = useAuth()
const { trackPurchase } = useAnalytics()

// Track if we've already fired the purchase event (prevent duplicates)
const hasFiredPurchaseEvent = ref(false)
const orderNumber = computed(() => route.params.orderNumber as string)
const token = computed(() => route.query.token as string | undefined)

// Only use token if user is not logged in
const queryToken = computed(() => user.value ? undefined : token.value)

// Fetch order details (include token only for guest access)
const { data: orderResponse, pending, error } = await useFetch<{
  data?: {
    id: string
    orderNumber: string
    event: any
    tickets: any[]
    totalAmount: string
    subtotalAmount?: string
    processingFee?: string
    adminFee?: string
    totalFees?: string
    paymentStatus: string
    customerName: string
    customerEmail: string
    createdAt: string
  }
}>(
  () => `/api/v1/orders/${orderNumber.value}`,
  {
    query: { token: queryToken.value },
    watch: [orderNumber, queryToken],
  }
)

const order = computed(() => orderResponse.value?.data)

// Check if registration is required (only after order loads and payment is confirmed)
const { data: registrationResponse } = await useFetch<{
  data?: {
    registrationStatus: {
      requiresRegistration: boolean
      allCompleted: boolean
    }
  }
}>(
  () => `/api/v1/orders/${orderNumber.value}/registration`,
  {
    query: { token: queryToken.value },
    watch: [orderNumber, queryToken],
    // Only fetch if order is paid
    immediate: false,
  }
)

// Redirect to registration if needed
watchEffect(() => {
  const isPaid = order.value?.paymentStatus === 'paid'
  if (!isPaid) return

  const regStatus = registrationResponse.value?.data?.registrationStatus
  if (regStatus?.requiresRegistration && !regStatus?.allCompleted) {
    const registerUrl = token.value
      ? `/orders/${orderNumber.value}/register?token=${token.value}`
      : `/orders/${orderNumber.value}/register`
    router.push(registerUrl)
  }
})

// Fetch registration status when order is paid
watch(() => order.value?.paymentStatus, async (paymentStatus) => {
  if (paymentStatus === 'paid') {
    // Track purchase event in Google Analytics (only once)
    if (!hasFiredPurchaseEvent.value && order.value) {
      hasFiredPurchaseEvent.value = true
      trackPurchase({
        transactionId: order.value.orderNumber,
        value: parseFloat(order.value.totalAmount),
        currency: 'PHP',
        items: order.value.tickets.map((ticket: any) => ({
          item_id: ticket.ticketType?.id || ticket.ticketTypeId,
          item_name: ticket.ticketType?.name || 'Ticket',
          price: parseFloat(ticket.ticketType?.price || '0'),
          quantity: 1,
          item_category: order.value!.event?.title,
        })),
      })
    }

    // Trigger registration status fetch
    await $fetch(`/api/v1/orders/${orderNumber.value}/registration`, {
      query: { token: queryToken.value },
    }).then((res: any) => {
      registrationResponse.value = res
    }).catch(() => {
      // Ignore errors - registration might not be set up
    })
  }
}, { immediate: true })

// Determine if this is a guest user (has token but not logged in)
const isGuest = computed(() => !!token.value && !user.value)

// Handle auth errors for guests with invalid/used tokens
// If user is not logged in and we have a token but got an error, redirect to login
const shouldRedirectToLogin = computed(() => {
  if (!error.value) return false
  if (user.value) return false // Logged in users shouldn't redirect
  if (!token.value) return false // No token means they came here without one
  // Token was provided but failed - likely used/expired, redirect to login
  return error.value.statusCode === 401
})

// Redirect to login if needed
watchEffect(() => {
  if (shouldRedirectToLogin.value) {
    toast.add({
      title: 'Please log in',
      description: 'Your account has been set up. Please log in to view your order.',
      color: 'blue',
      icon: 'i-heroicons-information-circle',
    })
    router.push(`/login?redirect=/orders/${orderNumber.value}`)
  }
})

// Where to redirect for viewing tickets
const ticketsUrl = computed(() => {
  if (isGuest.value) {
    // Guest users need to set up their account first
    return `/setup-account?token=${token.value}`
  }
  return '/tickets'
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

// Download tickets
const downloading = ref(false)

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

// Retry payment
const retryingPayment = ref(false)

async function retryPayment() {
  if (!order.value) return

  retryingPayment.value = true
  try {
    const response = await $fetch(`/api/v1/orders/${order.value.orderNumber}/retry-payment`, {
      method: 'POST',
      query: token.value ? { token: token.value } : undefined,
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
      <!-- Loading -->
      <div v-if="pending" class="text-center py-20">
        <UIcon name="i-heroicons-arrow-path" class="w-12 h-12 text-primary mx-auto mb-4 animate-spin" />
        <p class="text-gray-600 dark:text-gray-400">Loading order details...</p>
      </div>

      <!-- Redirecting to login (don't show error) -->
      <div v-else-if="shouldRedirectToLogin" class="text-center py-20">
        <UIcon name="i-heroicons-arrow-path" class="w-12 h-12 text-primary mx-auto mb-4 animate-spin" />
        <p class="text-gray-600 dark:text-gray-400">Redirecting to login...</p>
      </div>

      <!-- Error -->
      <div v-else-if="error || !order" class="text-center py-20">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">Order Not Found</h1>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          We couldn't find this order or you don't have access to it.
        </p>
        <UButton to="/dashboard" color="primary">Go to Dashboard</UButton>
      </div>

      <!-- Order Details -->
      <div v-else>
        <!-- Success Header -->
        <div class="text-center mb-8">
          <div
            class="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"
            :class="canRetryPayment
              ? 'bg-yellow-100 dark:bg-yellow-900/30'
              : 'bg-green-100 dark:bg-green-900/30'"
          >
            <UIcon
              :name="canRetryPayment ? 'i-heroicons-clock' : 'i-heroicons-check-circle'"
              class="w-12 h-12"
              :class="canRetryPayment ? 'text-yellow-500' : 'text-green-500'"
            />
          </div>
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            {{ order.paymentStatus === 'paid' ? 'Payment Successful!' : order.paymentStatus === 'failed' ? 'Payment Failed' : 'Payment Pending' }}
          </h1>
          <p class="text-gray-600 dark:text-gray-400">
            <template v-if="order.paymentStatus === 'paid'">
              Your tickets are ready. Check your email for confirmation.
            </template>
            <template v-else-if="order.paymentStatus === 'failed'">
              Your payment was not successful. Please retry to complete your order.
            </template>
            <template v-else>
              Your payment has not been completed yet. Please complete payment to receive your tickets.
            </template>
          </p>
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
              <h3 class="font-semibold text-gray-900 dark:text-white">{{ order.event?.title }}</h3>
              <p class="text-sm text-gray-500">{{ formatDate(order.event?.startDate) }}</p>
              <p v-if="order.event?.location" class="text-sm text-gray-500">{{ order.event?.location }}</p>
            </div>
          </div>

          <!-- Tickets -->
          <div class="py-4">
            <h4 class="font-medium text-gray-900 dark:text-white mb-3">Your Tickets</h4>
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
                <UBadge
                  :color="ticket.status === 'confirmed' ? 'green' : ticket.status === 'pending' ? 'yellow' : 'gray'"
                  variant="soft"
                >
                  {{ ticket.status }}
                </UBadge>
              </div>
            </div>
          </div>

          <!-- Total -->
          <div class="pt-4 border-t border-gray-200 dark:border-gray-700">
            <div class="flex items-center justify-between">
              <span class="font-medium text-gray-900 dark:text-white">
                {{ order.paymentStatus === 'paid' ? 'Total Paid' : 'Total Due' }}
              </span>
              <span class="text-xl font-bold text-primary">
                {{ parseFloat(order.totalAmount) === 0 ? 'Free' : formatCurrency(order.totalAmount) }}
              </span>
            </div>
          </div>
        </UCard>

        <!-- Payment Pending Alert -->
        <UAlert
          v-if="canRetryPayment"
          :color="order.paymentStatus === 'failed' ? 'red' : 'yellow'"
          :icon="order.paymentStatus === 'failed' ? 'i-heroicons-x-circle' : 'i-heroicons-exclamation-triangle'"
          :title="order.paymentStatus === 'failed' ? 'Payment was not completed' : 'Payment not yet received'"
          :description="order.paymentStatus === 'failed'
            ? 'Your payment could not be processed. Please try again to complete your order.'
            : 'We have not received your payment yet. If you closed the payment page, click the button below to retry.'"
          class="mb-6"
        />
        <!-- QR Code Note (only show for paid orders) -->
        <UAlert
          v-else-if="isGuest"
          color="blue"
          icon="i-heroicons-user-plus"
          title="Set up your account"
          description="Create a password to access your tickets anytime. You'll also receive your tickets via email."
          class="mb-6"
        />
        <UAlert
          v-else
          color="blue"
          icon="i-heroicons-qr-code"
          title="Show your QR code at the event"
          description="Each ticket has a unique QR code. You'll receive them via email, or you can view them in your tickets page."
          class="mb-6"
        />

        <!-- Actions -->
        <div class="flex flex-col gap-3">
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
            v-if="canDownload && !isGuest"
            color="primary"
            block
            size="lg"
            icon="i-heroicons-arrow-down-tray"
            :loading="downloading"
            @click="downloadAllTickets"
          >
            Download Tickets (PDF)
          </UButton>
          <UButton
            v-if="!canRetryPayment"
            :to="ticketsUrl"
            :color="canDownload && !isGuest ? 'gray' : 'primary'"
            :variant="canDownload && !isGuest ? 'outline' : 'solid'"
            block
            size="lg"
            :icon="isGuest ? 'i-heroicons-user-plus' : 'i-heroicons-ticket'"
          >
            {{ isGuest ? 'Set Up Account to View Tickets' : 'View My Tickets' }}
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
