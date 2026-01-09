<script setup lang="ts">
definePageMeta({
  layout: 'default',
})

const route = useRoute()
const { user } = useAuth()
const orderNumber = computed(() => route.params.orderNumber as string)
const token = computed(() => route.query.token as string | undefined)

// Fetch order details (include token for guest access)
const { data: orderResponse, pending, error } = await useFetch(
  () => `/api/v1/orders/${orderNumber.value}`,
  {
    query: { token: token.value },
    watch: [orderNumber, token],
  }
)

const order = computed(() => orderResponse.value?.data)

// Determine if this is a guest user (has token but not logged in)
const isGuest = computed(() => !!token.value && !user.value)

// Where to redirect for viewing tickets
const ticketsUrl = computed(() => {
  if (isGuest.value) {
    // Guest users need to set up their account first
    return `/setup-account?token=${token.value}`
  }
  return '/tickets'
})

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
</script>

<template>
  <div class="py-12">
    <div class="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
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
        <UButton to="/dashboard" color="primary">Go to Dashboard</UButton>
      </div>

      <!-- Order Details -->
      <div v-else>
        <!-- Success Header -->
        <div class="text-center mb-8">
          <div class="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <UIcon name="i-heroicons-check-circle" class="w-12 h-12 text-green-500" />
          </div>
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            {{ order.paymentStatus === 'paid' ? 'Payment Successful!' : 'Order Confirmed!' }}
          </h1>
          <p class="text-gray-600 dark:text-gray-400">
            Your tickets are ready. Check your email for confirmation.
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
              <span class="font-medium text-gray-900 dark:text-white">Total Paid</span>
              <span class="text-xl font-bold text-primary">
                {{ parseFloat(order.totalAmount) === 0 ? 'Free' : formatCurrency(order.totalAmount) }}
              </span>
            </div>
          </div>
        </UCard>

        <!-- QR Code Note -->
        <UAlert
          v-if="isGuest"
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
        <div class="flex flex-col sm:flex-row gap-3">
          <UButton
            :to="ticketsUrl"
            color="primary"
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
