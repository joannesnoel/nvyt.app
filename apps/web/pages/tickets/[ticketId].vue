<script setup lang="ts">
definePageMeta({
  layout: 'default',
  middleware: 'auth',
})

const route = useRoute()
const ticketId = computed(() => route.params.ticketId as string)

// Fetch ticket details
const { data: ticketResponse, pending, error } = await useFetch(
  () => `/api/v1/tickets/${ticketId.value}`,
  { watch: [ticketId] }
)

const ticket = computed(() => ticketResponse.value?.data)

// Generate QR code URL (using a QR code API service)
const qrCodeUrl = computed(() => {
  if (!ticket.value?.qrCode) return ''
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(ticket.value.qrCode)}`
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
    case 'confirmed': return 'green'
    case 'pending': return 'yellow'
    case 'checked_in': return 'blue'
    case 'cancelled': return 'red'
    case 'refunded': return 'gray'
    default: return 'gray'
  }
}
</script>

<template>
  <div class="py-8">
    <div class="max-w-lg mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Back Link -->
      <NuxtLink
        to="/tickets"
        class="text-gray-600 dark:text-gray-400 hover:text-primary flex items-center gap-1 mb-6"
      >
        <UIcon name="i-heroicons-arrow-left" class="w-4 h-4" />
        Back to My Tickets
      </NuxtLink>

      <!-- Loading -->
      <div v-if="pending" class="text-center py-20">
        <UIcon name="i-heroicons-arrow-path" class="w-12 h-12 text-primary mx-auto mb-4 animate-spin" />
        <p class="text-gray-600 dark:text-gray-400">Loading ticket...</p>
      </div>

      <!-- Error -->
      <div v-else-if="error || !ticket" class="text-center py-20">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">Ticket Not Found</h1>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          We couldn't find this ticket or you don't have access to it.
        </p>
        <UButton to="/tickets" color="primary">View My Tickets</UButton>
      </div>

      <!-- Ticket Card -->
      <div v-else>
        <UCard class="overflow-hidden">
          <!-- Status Banner -->
          <div
            :class="[
              'px-4 py-2 text-center text-sm font-medium',
              ticket.status === 'confirmed' ? 'bg-green-500 text-white' :
              ticket.status === 'checked_in' ? 'bg-blue-500 text-white' :
              ticket.status === 'pending' ? 'bg-yellow-500 text-white' :
              'bg-gray-500 text-white'
            ]"
          >
            {{ ticket.status === 'confirmed' ? 'Valid Ticket' :
               ticket.status === 'checked_in' ? 'Already Checked In' :
               ticket.status === 'pending' ? 'Pending Payment' :
               ticket.status.toUpperCase() }}
          </div>

          <div class="p-6">
            <!-- Event Info -->
            <div class="text-center mb-6">
              <h1 class="text-xl font-bold text-gray-900 dark:text-white mb-1">
                {{ ticket.event?.title }}
              </h1>
              <p class="text-gray-600 dark:text-gray-400">
                {{ formatDate(ticket.event?.startDate) }}
              </p>
              <p v-if="ticket.event?.location" class="text-gray-500 text-sm">
                {{ ticket.event.location }}
              </p>
            </div>

            <!-- QR Code -->
            <div class="flex justify-center mb-6">
              <div
                v-if="ticket.status === 'confirmed' || ticket.status === 'checked_in'"
                class="p-4 bg-white rounded-lg shadow-inner"
              >
                <img
                  :src="qrCodeUrl"
                  alt="Ticket QR Code"
                  class="w-64 h-64"
                >
              </div>
              <div
                v-else
                class="w-64 h-64 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center"
              >
                <div class="text-center">
                  <UIcon name="i-heroicons-qr-code" class="w-16 h-16 text-gray-400 mx-auto mb-2" />
                  <p class="text-gray-500">QR code not available</p>
                </div>
              </div>
            </div>

            <!-- Ticket Details -->
            <div class="space-y-3 border-t border-dashed border-gray-200 dark:border-gray-700 pt-4">
              <div class="flex items-center justify-between">
                <span class="text-gray-500">Ticket Type</span>
                <span class="font-medium text-gray-900 dark:text-white">{{ ticket.ticketType?.name }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-gray-500">Ticket Number</span>
                <span class="font-mono text-sm text-gray-900 dark:text-white">{{ ticket.ticketNumber }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-gray-500">Price</span>
                <span class="font-medium text-gray-900 dark:text-white">
                  {{ parseFloat(ticket.ticketType?.price) === 0 ? 'Free' : formatCurrency(ticket.ticketType?.price) }}
                </span>
              </div>
              <div v-if="ticket.attendeeName" class="flex items-center justify-between">
                <span class="text-gray-500">Attendee</span>
                <span class="font-medium text-gray-900 dark:text-white">{{ ticket.attendeeName }}</span>
              </div>
              <div v-if="ticket.checkedInAt" class="flex items-center justify-between">
                <span class="text-gray-500">Checked In</span>
                <span class="font-medium text-green-600">{{ formatDate(ticket.checkedInAt) }}</span>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="px-6 pb-6 space-y-3">
            <UButton
              v-if="ticket.order?.orderNumber"
              :to="`/orders/${ticket.order.orderNumber}`"
              color="gray"
              variant="outline"
              block
              icon="i-heroicons-document-text"
            >
              View Order
            </UButton>
            <UButton
              :to="`/events/${ticket.event?.slug}`"
              color="gray"
              variant="ghost"
              block
              icon="i-heroicons-calendar"
            >
              View Event Details
            </UButton>
          </div>
        </UCard>

        <!-- Instructions -->
        <UAlert
          color="blue"
          icon="i-heroicons-information-circle"
          class="mt-6"
        >
          <template #title>How to use your ticket</template>
          <template #description>
            Present this QR code at the event entrance. The organizer will scan it to check you in.
            Keep your phone charged or take a screenshot of the QR code.
          </template>
        </UAlert>
      </div>
    </div>
  </div>
</template>
