<script setup lang="ts">
import type { RegistrationFieldType, FieldOption, FieldValidation } from '@nvyt/shared'

definePageMeta({
  layout: 'default',
})

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { user } = useAuth()
const orderNumber = computed(() => route.params.orderNumber as string)
const token = computed(() => route.query.token as string | undefined)

// Only use token if user is not logged in
const queryToken = computed(() => user.value ? undefined : token.value)

// Fetch registration data
const { data: registrationResponse, pending, error, refresh } = await useFetch<{
  data?: {
    order: {
      orderNumber: string
      paymentStatus: string
      customerName: string
      customerEmail: string
    }
    event: {
      id: string
      title: string
      slug: string
      coverImage: string | null
      startDate: string
      endDate: string | null
      timezone: string | null
      location: string | null
    }
    registrationFields: Array<{
      id: string
      label: string
      fieldType: RegistrationFieldType
      placeholder?: string | null
      helpText?: string | null
      isRequired: boolean
      options?: FieldOption[] | null
      validation?: FieldValidation | null
    }>
    tickets: Array<{
      id: string
      ticketNumber: string
      attendeeName: string | null
      attendeeEmail: string | null
      registrationData: Record<string, unknown> | null
      registrationCompleted: boolean
      registrationCompletedAt: string | null
      ticketType: {
        id: string
        name: string
        description: string | null
        price: string
      }
      index: number
    }>
    registrationStatus: {
      totalTickets: number
      completedTickets: number
      allCompleted: boolean
      nextTicketIndex: number | null
      requiresRegistration: boolean
    }
    userProfile: {
      name: string
      email: string
      phone: string | null
    } | null
    userHasExistingTicket: boolean
  }
}>(
  () => `/api/v1/orders/${orderNumber.value}/registration`,
  {
    query: { token: queryToken.value },
    watch: [orderNumber, queryToken],
  }
)

const data = computed(() => registrationResponse.value?.data)
const registrationFields = computed(() => data.value?.registrationFields || [])
const tickets = computed(() => data.value?.tickets || [])
const status = computed(() => data.value?.registrationStatus)
const userProfile = computed(() => data.value?.userProfile)
const userHasExistingTicket = computed(() => data.value?.userHasExistingTicket ?? false)

// Current ticket index (for wizard flow)
const currentTicketIndex = ref(0)

// Initialize current index to next incomplete ticket
watch(status, (s) => {
  if (s?.nextTicketIndex !== null && s?.nextTicketIndex !== undefined) {
    currentTicketIndex.value = s.nextTicketIndex
  }
}, { immediate: true })

// Current ticket
const currentTicket = computed(() => tickets.value[currentTicketIndex.value])

// Is first ticket?
const isFirstTicket = computed(() => currentTicketIndex.value === 0)

// Is single ticket?
const isSingleTicket = computed(() => tickets.value.length === 1)

// Is last ticket?
const isLastTicket = computed(() => currentTicketIndex.value === tickets.value.length - 1)

// Submitting state
const isSubmitting = ref(false)

async function submitRegistration(responses: Record<string, string | number | boolean>, useUserProfile: boolean, attendeeInfo: { name: string; email: string; birthdate: string }) {
  if (!currentTicket.value) return

  // Prevent double submission for already registered tickets
  if (currentTicket.value.registrationCompleted) {
    return
  }

  const wasLastTicket = isLastTicket.value

  isSubmitting.value = true
  try {
    await $fetch(`/api/v1/tickets/${currentTicket.value.id}/registration`, {
      method: 'POST',
      query: token.value ? { token: token.value } : undefined,
      body: {
        responses,
        useUserProfile,
        attendeeName: attendeeInfo.name,
        attendeeEmail: attendeeInfo.email,
        attendeeBirthdate: attendeeInfo.birthdate,
      },
    })

    toast.add({
      title: 'Registration Saved',
      description: wasLastTicket
        ? 'All registrations completed!'
        : `Ticket ${currentTicketIndex.value + 1} registered. Moving to next ticket...`,
      color: 'green',
    })

    // Refresh data - the watch on status.nextTicketIndex will update currentTicketIndex
    await refresh()

    // If this was the last ticket, redirect to success
    // The watch on status.allCompleted will also handle this, but we do it explicitly for clarity
    if (wasLastTicket) {
      const successUrl = token.value
        ? `/orders/${orderNumber.value}/success?token=${token.value}`
        : `/orders/${orderNumber.value}/success`
      router.push(successUrl)
    }
    // Otherwise, the watch on status.nextTicketIndex handles moving to the next ticket
  } catch (e: any) {
    toast.add({
      title: 'Registration Failed',
      description: e.data?.message || 'Failed to save registration. Please try again.',
      color: 'red',
    })
  } finally {
    isSubmitting.value = false
  }
}

// Navigate to specific ticket (only allow completed or current)
function goToTicket(index: number) {
  const ticket = tickets.value[index]
  if (ticket?.registrationCompleted || index === currentTicketIndex.value) {
    currentTicketIndex.value = index
  }
}

// Format date
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

// Redirect to success if no registration required or all completed
watch(status, (s) => {
  if (!s) return

  if (!s.requiresRegistration || s.allCompleted) {
    const successUrl = token.value
      ? `/orders/${orderNumber.value}/success?token=${token.value}`
      : `/orders/${orderNumber.value}/success`
    router.push(successUrl)
  }
}, { immediate: true })
</script>

<template>
  <div class="py-12">
    <div class="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Loading -->
      <div v-if="pending" class="text-center py-20">
        <UIcon name="i-heroicons-arrow-path" class="w-12 h-12 text-primary mx-auto mb-4 animate-spin" />
        <p class="text-gray-600 dark:text-gray-400">Loading registration form...</p>
      </div>

      <!-- Error -->
      <div v-else-if="error || !data" class="text-center py-20">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">Unable to Load Registration</h1>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          {{ error?.data?.message || 'We couldn\'t load the registration form. Please try again.' }}
        </p>
        <UButton :to="`/orders/${orderNumber}/success`" color="primary">View Order</UButton>
      </div>

      <!-- Registration Form -->
      <div v-else-if="currentTicket">
        <!-- Event Header -->
        <div class="mb-8">
          <div class="flex items-start gap-4">
            <div
              class="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0"
            >
              <img
                v-if="data.event?.coverImage"
                :src="data.event.coverImage"
                :alt="data.event.title"
                class="w-full h-full object-cover rounded-lg"
              >
              <UIcon v-else name="i-heroicons-calendar" class="w-8 h-8 text-gray-400" />
            </div>
            <div>
              <h3 class="font-semibold text-gray-900 dark:text-white">{{ data.event?.title }}</h3>
              <p class="text-sm text-gray-500">{{ formatDate(data.event?.startDate || '') }}</p>
              <p v-if="data.event?.location" class="text-sm text-gray-500">{{ data.event?.location }}</p>
            </div>
          </div>
        </div>

        <!-- Progress Header -->
        <div class="mb-8">
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Complete Your Registration
          </h1>
          <p class="text-gray-600 dark:text-gray-400">
            Please provide information for each ticket holder.
          </p>

          <!-- Progress bar -->
          <div v-if="tickets.length > 1" class="mt-4">
            <div class="flex items-center justify-between text-sm text-gray-500 mb-2">
              <span>Progress</span>
              <span>{{ status?.completedTickets || 0 }} of {{ status?.totalTickets || 0 }} completed</span>
            </div>
            <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                class="bg-primary rounded-full h-2 transition-all duration-300"
                :style="{ width: `${((status?.completedTickets || 0) / (status?.totalTickets || 1)) * 100}%` }"
              />
            </div>
          </div>

          <!-- Ticket pills (for multiple tickets) -->
          <div v-if="tickets.length > 1" class="mt-4 flex flex-wrap gap-2">
            <button
              v-for="(ticket, index) in tickets"
              :key="ticket.id"
              class="px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
              :class="[
                currentTicketIndex === index
                  ? 'bg-primary text-white'
                  : ticket.registrationCompleted
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
                (ticket.registrationCompleted || index === currentTicketIndex)
                  ? 'cursor-pointer hover:opacity-80'
                  : 'cursor-not-allowed opacity-50'
              ]"
              :disabled="!ticket.registrationCompleted && index !== currentTicketIndex"
              @click="goToTicket(index)"
            >
              <UIcon
                v-if="ticket.registrationCompleted"
                name="i-heroicons-check"
                class="w-3 h-3 mr-1 inline"
              />
              Ticket {{ index + 1 }}
            </button>
          </div>
        </div>

        <!-- Registration Form Card -->
        <UCard>
          <RegistrationForm
            :fields="registrationFields"
            :ticket-index="currentTicketIndex"
            :total-tickets="tickets.length"
            :ticket-type-name="currentTicket.ticketType.name"
            :ticket-number="currentTicket.ticketNumber"
            :user-profile="userProfile"
            :is-first-ticket="isFirstTicket"
            :is-single-ticket="isSingleTicket"
            :is-last-ticket="isLastTicket"
            :user-has-existing-ticket="userHasExistingTicket"
            :loading="isSubmitting"
            @submit="submitRegistration"
          />
        </UCard>

      </div>

      <!-- No tickets found -->
      <div v-else-if="data && tickets.length === 0" class="text-center py-20">
        <UIcon name="i-heroicons-ticket" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">No Tickets Found</h1>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          Unable to find tickets for this order. Please contact support if this is unexpected.
        </p>
        <UButton
          :to="token ? `/orders/${orderNumber}/success?token=${token}` : `/orders/${orderNumber}/success`"
          color="primary"
          size="lg"
        >
          View Order
        </UButton>
      </div>

      <!-- All Complete (fallback, should redirect) -->
      <div v-else-if="status?.allCompleted" class="text-center py-20">
        <div class="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-6">
          <UIcon name="i-heroicons-check-circle" class="w-12 h-12 text-green-500" />
        </div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Registration Complete!
        </h1>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          All tickets have been registered. You're all set for the event!
        </p>
        <div class="flex flex-col gap-3 max-w-xs mx-auto">
          <UButton
            :to="token ? `/orders/${orderNumber}/success?token=${token}` : `/orders/${orderNumber}/success`"
            color="primary"
            block
            size="lg"
          >
            View Your Tickets
          </UButton>
        </div>
      </div>

      <!-- Fallback: Unexpected state -->
      <div v-else class="text-center py-20">
        <UIcon name="i-heroicons-question-mark-circle" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">Unable to Load Registration Form</h1>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          Something unexpected happened. Please try refreshing the page.
        </p>
        <div class="flex flex-col gap-3 max-w-xs mx-auto">
          <UButton color="primary" @click="refresh()">
            Refresh
          </UButton>
          <UButton
            :to="token ? `/orders/${orderNumber}/success?token=${token}` : `/orders/${orderNumber}/success`"
            variant="outline"
          >
            View Order
          </UButton>
        </div>
        <!-- Debug info -->
        <details class="mt-8 text-left text-xs max-w-md mx-auto">
          <summary class="cursor-pointer text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            Show debug info
          </summary>
          <div class="mt-2 bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
            <ul class="space-y-1 font-mono text-gray-600 dark:text-gray-400">
              <li>data: {{ !!data }}</li>
              <li>tickets.length: {{ tickets.length }}</li>
              <li>registrationFields.length: {{ registrationFields.length }}</li>
              <li>currentTicketIndex: {{ currentTicketIndex }}</li>
              <li>currentTicket: {{ !!currentTicket }}</li>
              <li>status: {{ JSON.stringify(status, null, 2) }}</li>
            </ul>
          </div>
        </details>
      </div>
    </div>
  </div>
</template>
