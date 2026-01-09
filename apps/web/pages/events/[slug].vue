<script setup lang="ts">
definePageMeta({
  layout: 'default',
})

const route = useRoute()
const slug = computed(() => route.params.slug as string)
const token = computed(() => route.query.token as string | undefined)

const toast = useToast()
const { user, isLoading: authLoading } = useAuth()

// Fetch event data - use $fetch for proper SSR support
const { data: eventResponse, status, refresh, error: fetchError } = await useAsyncData(
  `event-${route.params.slug}`,
  () => $fetch<{ success: boolean; data: any }>(`/api/v1/events/by-slug/${route.params.slug}`, {
    query: { token: route.query.token || undefined },
  }).catch((err) => {
    // Return null on error so we can handle it gracefully
    console.error('Failed to fetch event:', err)
    return null
  }),
  {
    watch: [slug, token],
  }
)

const pending = computed(() => status.value === 'pending')
const event = computed(() => eventResponse.value?.data)
const apiError = computed(() => {
  if (fetchError.value) {
    return (fetchError.value as any).data?.message || fetchError.value.message || 'Failed to load event'
  }
  if (status.value === 'success' && !eventResponse.value) {
    return 'Failed to load event'
  }
  return null
})
const isOrganizer = computed(() => event.value?.isOrganizer)
const userAttendee = computed(() => event.value?.userAttendee)

// RSVP state
const rsvpLoading = ref(false)

// Cancel RSVP confirmation modal
const showCancelRsvpModal = ref(false)
const cancelRsvpConfirmText = ref('')
const CANCEL_CONFIRM_PHRASE = 'CANCEL'

function openCancelRsvpModal() {
  cancelRsvpConfirmText.value = ''
  showCancelRsvpModal.value = true
}

function closeCancelRsvpModal() {
  showCancelRsvpModal.value = false
  cancelRsvpConfirmText.value = ''
}

async function confirmCancelRsvp() {
  if (cancelRsvpConfirmText.value !== CANCEL_CONFIRM_PHRASE) return
  closeCancelRsvpModal()
  await cancelRsvp()
}

// Ticket purchase state
const showTicketModal = ref(false)
const ticketCart = ref<Record<string, number>>({})
const isCheckingOut = ref(false)

// Guest checkout state
const showGuestForm = ref(false)
const guestForm = ref({
  name: '',
  email: '',
})

function openTicketModal() {
  // Initialize cart with 0 for each ticket type
  if (event.value?.ticketTypes) {
    const cart: Record<string, number> = {}
    for (const tt of event.value.ticketTypes) {
      cart[tt.id] = 0
    }
    ticketCart.value = cart
  }
  // Reset guest form
  showGuestForm.value = false
  guestForm.value = { name: '', email: '' }
  showTicketModal.value = true
}

function updateTicketQuantity(ticketTypeId: string, delta: number) {
  const tt = event.value?.ticketTypes?.find((t: any) => t.id === ticketTypeId)
  if (!tt) return

  const current = ticketCart.value[ticketTypeId] || 0
  const newValue = current + delta

  // Validate min/max
  if (newValue < 0) return
  if (newValue > tt.maxPerOrder) return
  if (tt.quantity && newValue > (tt.quantity - tt.quantitySold)) return

  ticketCart.value[ticketTypeId] = newValue
}

const cartTotal = computed(() => {
  if (!event.value?.ticketTypes) return 0
  let total = 0
  for (const [id, qty] of Object.entries(ticketCart.value)) {
    const tt = event.value.ticketTypes.find((t: any) => t.id === id)
    if (tt && qty > 0) {
      total += parseFloat(tt.price) * qty
    }
  }
  return total
})

const cartItemCount = computed(() => {
  return Object.values(ticketCart.value).reduce((a, b) => a + b, 0)
})

async function checkout() {
  if (!event.value) return
  if (cartItemCount.value === 0) {
    toast.add({
      title: 'No Tickets Selected',
      description: 'Please select at least one ticket.',
      color: 'yellow',
    })
    return
  }

  // If not logged in, need guest info
  if (!user.value) {
    if (!showGuestForm.value) {
      showGuestForm.value = true
      return
    }

    // Validate guest form
    if (!guestForm.value.name || guestForm.value.name.length < 2) {
      toast.add({
        title: 'Name Required',
        description: 'Please enter your name (at least 2 characters).',
        color: 'yellow',
      })
      return
    }
    if (!guestForm.value.email || !guestForm.value.email.includes('@')) {
      toast.add({
        title: 'Valid Email Required',
        description: 'Please enter a valid email address.',
        color: 'yellow',
      })
      return
    }
  }

  isCheckingOut.value = true
  try {
    const items = Object.entries(ticketCart.value)
      .filter(([_, qty]) => qty > 0)
      .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }))

    const response = await $fetch('/api/v1/orders/checkout', {
      method: 'POST',
      body: {
        eventId: event.value.id,
        items,
        customerName: user.value?.name || guestForm.value.name,
        customerEmail: user.value?.email || guestForm.value.email,
        isGuest: !user.value,
      },
    }) as any

    if (response.data.checkoutUrl) {
      // Redirect to PayMongo checkout
      window.location.href = response.data.checkoutUrl
    } else {
      // Free tickets or completed
      if (response.data.accountSetupRequired) {
        toast.add({
          title: 'Tickets Confirmed!',
          description: 'Check your email to set up your account and access your tickets.',
          color: 'green',
          timeout: 8000,
        })
      } else {
        toast.add({
          title: 'Tickets Confirmed!',
          description: 'Your free tickets have been confirmed.',
          color: 'green',
        })
      }
      showTicketModal.value = false
      navigateTo(`/orders/${response.data.order.orderNumber}/success`)
    }
  } catch (e: any) {
    console.error('Checkout error:', e)

    // Handle account exists error
    if (e.data?.data?.code === 'ACCOUNT_EXISTS_WITH_PASSWORD') {
      toast.add({
        title: 'Account Exists',
        description: 'An account with this email already exists. Please log in.',
        color: 'yellow',
        timeout: 8000,
      })
      showTicketModal.value = false
      navigateTo(`/login?redirect=/events/${event.value?.slug}`)
      return
    }

    toast.add({
      title: 'Checkout Failed',
      description: e.data?.message || e.message || 'Failed to process checkout. Please try again.',
      color: 'red',
    })
  } finally {
    isCheckingOut.value = false
  }
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(amount)
}

async function handleRsvp() {
  if (!event.value) return

  rsvpLoading.value = true
  try {
    await $fetch(`/api/v1/events/${event.value.id}/rsvp`, {
      method: 'POST',
    })

    toast.add({
      title: 'RSVP Successful',
      description: 'You have successfully RSVP\'d to this event',
      color: 'green',
    })

    await refresh()
  } catch (e: any) {
    toast.add({
      title: 'RSVP Failed',
      description: e.data?.message || 'Failed to RSVP',
      color: 'red',
    })
  } finally {
    rsvpLoading.value = false
  }
}

async function cancelRsvp() {
  if (!event.value) return

  rsvpLoading.value = true
  try {
    await $fetch(`/api/v1/events/${event.value.id}/rsvp`, {
      method: 'DELETE',
    })

    toast.add({
      title: 'RSVP Cancelled',
      description: 'Your RSVP has been cancelled',
      color: 'green',
    })

    await refresh()
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to cancel RSVP',
      color: 'red',
    })
  } finally {
    rsvpLoading.value = false
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

// Status badge color
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
</script>

<template>
  <div class="py-12">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Loading -->
      <div v-if="pending" class="space-y-4">
        <USkeleton class="h-64 w-full rounded-xl" />
        <USkeleton class="h-8 w-2/3" />
        <USkeleton class="h-4 w-1/3" />
        <USkeleton class="h-32 w-full" />
      </div>

      <!-- Error / Not Found -->
      <div v-else-if="!event || apiError" class="text-center py-20">
        <UIcon name="i-heroicons-calendar-days" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">Event Not Found</h1>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          {{ apiError || "This event doesn't exist or you don't have access to it." }}
        </p>
        <UButton to="/events" color="primary">Browse Events</UButton>
      </div>

      <!-- Event Content -->
      <div v-else>
        <!-- Cover Image -->
        <div class="aspect-video bg-gray-100 dark:bg-gray-800 rounded-xl overflow-hidden mb-8">
          <img
            v-if="event.coverImage"
            :src="event.coverImage"
            :alt="event.title"
            class="w-full h-full object-cover"
          >
          <div v-else class="w-full h-full flex items-center justify-center">
            <UIcon name="i-heroicons-photo" class="w-16 h-16 text-gray-400" />
          </div>
        </div>

        <!-- Event Header -->
        <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-8">
          <div>
            <div class="flex items-center gap-2 mb-2">
              <UBadge v-if="event.visibility === 'private'" color="gray" variant="soft">
                <UIcon name="i-heroicons-lock-closed" class="w-3 h-3 mr-1" />
                Private
              </UBadge>
              <UBadge :color="event.status === 'published' ? 'green' : 'yellow'" variant="soft">
                {{ event.status }}
              </UBadge>
            </div>
            <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
              {{ event.title }}
            </h1>
            <p class="text-gray-600 dark:text-gray-400 mt-2">
              Organized by {{ event.organizer?.name }}
            </p>
          </div>

          <!-- Action Buttons -->
          <div class="flex flex-col gap-2">
            <!-- Organizer Actions -->
            <template v-if="isOrganizer">
              <UButton
                :to="`/dashboard/events/${event.id}`"
                color="primary"
                icon="i-heroicons-cog-6-tooth"
              >
                Manage Event
              </UButton>
              <UButton
                :to="`/dashboard/events/${event.id}/attendees`"
                color="gray"
                variant="outline"
                icon="i-heroicons-users"
              >
                View Attendees ({{ event.attendeeCount }})
              </UButton>
            </template>

            <!-- Attendee Actions -->
            <template v-else>
              <!-- Loading auth state -->
              <template v-if="authLoading">
                <USkeleton class="h-10 w-full" />
              </template>

              <!-- Registration Mode: RSVP -->
              <template v-else-if="event.registrationMode === 'rsvp'">
                <!-- Already RSVP'd -->
                <template v-if="userAttendee">
                  <UBadge :color="getStatusColor(userAttendee.status)" size="lg" class="justify-center">
                    {{ userAttendee.status === 'confirmed' ? 'You\'re going!' :
                       userAttendee.status === 'pending' ? 'Awaiting Approval' :
                       userAttendee.status === 'waitlisted' ? 'On Waitlist' :
                       userAttendee.status }}
                  </UBadge>
                  <UButton
                    v-if="userAttendee.status !== 'cancelled'"
                    color="red"
                    variant="outline"
                    @click="openCancelRsvpModal"
                  >
                    Cancel RSVP
                  </UButton>
                </template>

                <!-- Not RSVP'd -->
                <UButton
                  v-else-if="user"
                  color="primary"
                  size="lg"
                  :loading="rsvpLoading"
                  @click="handleRsvp"
                >
                  <UIcon name="i-heroicons-hand-raised" class="w-5 h-5 mr-2" />
                  RSVP to this Event
                </UButton>
                <UButton
                  v-else
                  to="/login"
                  color="primary"
                  size="lg"
                >
                  <UIcon name="i-heroicons-hand-raised" class="w-5 h-5 mr-2" />
                  Login to RSVP
                </UButton>
              </template>

              <!-- Registration Mode: Tickets -->
              <template v-else-if="event.registrationMode === 'tickets'">
                <UButton
                  v-if="user && event.ticketTypes?.length"
                  color="primary"
                  size="lg"
                  @click="openTicketModal"
                >
                  <UIcon name="i-heroicons-ticket" class="w-5 h-5 mr-2" />
                  Get Tickets
                </UButton>
                <UButton
                  v-else-if="!user"
                  to="/login"
                  color="primary"
                  size="lg"
                >
                  <UIcon name="i-heroicons-ticket" class="w-5 h-5 mr-2" />
                  Login to Get Tickets
                </UButton>
                <p v-else class="text-sm text-gray-500 text-center">
                  No tickets available
                </p>
              </template>

              <!-- Registration Mode: Open -->
              <template v-else-if="event.registrationMode === 'open'">
                <UBadge color="green" size="lg" class="justify-center">
                  <UIcon name="i-heroicons-check-circle" class="w-4 h-4 mr-1" />
                  Open Event - Just Show Up!
                </UBadge>
                <p class="text-sm text-gray-500 text-center">
                  No registration required
                </p>
              </template>

              <!-- Fallback for events without registrationMode (legacy) -->
              <template v-else>
                <UButton
                  v-if="user"
                  color="primary"
                  size="lg"
                  :loading="rsvpLoading"
                  @click="handleRsvp"
                >
                  <UIcon name="i-heroicons-hand-raised" class="w-5 h-5 mr-2" />
                  RSVP to this Event
                </UButton>
                <UButton
                  v-else
                  to="/login"
                  color="primary"
                  size="lg"
                >
                  <UIcon name="i-heroicons-hand-raised" class="w-5 h-5 mr-2" />
                  Login to RSVP
                </UButton>
              </template>
            </template>
          </div>
        </div>

        <!-- Event Details Grid -->
        <div class="grid md:grid-cols-3 gap-8">
          <!-- Main Content -->
          <div class="md:col-span-2 space-y-8">
            <!-- Description -->
            <UCard>
              <template #header>
                <h2 class="font-semibold text-gray-900 dark:text-white">About this Event</h2>
              </template>
              <div class="prose dark:prose-invert max-w-none">
                <p v-if="event.description" class="whitespace-pre-wrap">{{ event.description }}</p>
                <p v-else class="text-gray-500">No description provided.</p>
              </div>
            </UCard>

            <!-- Contribution List -->
            <UCard v-if="event.contributionsEnabled && event.contributionItems?.length">
              <template #header>
                <h2 class="font-semibold text-gray-900 dark:text-white">Contribution List</h2>
              </template>
              <div class="space-y-3">
                <div
                  v-for="item in event.contributionItems"
                  :key="item.id"
                  class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                >
                  <div>
                    <p class="font-medium text-gray-900 dark:text-white">{{ item.name }}</p>
                    <p v-if="item.description" class="text-sm text-gray-500">{{ item.description }}</p>
                  </div>
                  <div class="text-right">
                    <span class="text-sm text-gray-600 dark:text-gray-400">
                      {{ item.quantityClaimed }}/{{ item.quantityNeeded }} claimed
                    </span>
                  </div>
                </div>
              </div>
            </UCard>
          </div>

          <!-- Sidebar -->
          <div class="space-y-4">
            <!-- Date & Time -->
            <UCard>
              <div class="flex items-start gap-3">
                <div class="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                  <UIcon name="i-heroicons-calendar-days" class="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p class="font-medium text-gray-900 dark:text-white">Date & Time</p>
                  <p class="text-sm text-gray-600 dark:text-gray-400">
                    {{ formatDate(event.startDate) }}
                  </p>
                  <p v-if="event.endDate" class="text-sm text-gray-500">
                    to {{ formatDate(event.endDate) }}
                  </p>
                </div>
              </div>
            </UCard>

            <!-- Location -->
            <UCard v-if="event.location">
              <div class="flex items-start gap-3">
                <div class="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                  <UIcon name="i-heroicons-map-pin" class="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p class="font-medium text-gray-900 dark:text-white">Location</p>
                  <p class="text-sm text-gray-600 dark:text-gray-400">
                    {{ event.location }}
                  </p>
                </div>
              </div>
            </UCard>

            <!-- Capacity (for RSVP mode) -->
            <UCard v-if="event.registrationMode === 'rsvp'">
              <div class="flex items-start gap-3">
                <div class="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                  <UIcon name="i-heroicons-users" class="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p class="font-medium text-gray-900 dark:text-white">Attendees</p>
                  <p class="text-sm text-gray-600 dark:text-gray-400">
                    {{ event.attendeeCount }}
                    <span v-if="event.maxAttendees"> / {{ event.maxAttendees }}</span>
                    <span v-else> attending</span>
                  </p>
                  <div v-if="event.maxAttendees" class="mt-2">
                    <UProgress
                      :value="(event.attendeeCount / event.maxAttendees) * 100"
                      :color="event.attendeeCount >= event.maxAttendees ? 'red' : 'primary'"
                      size="sm"
                    />
                  </div>
                </div>
              </div>
            </UCard>

            <!-- Registration Info (for Open mode) -->
            <UCard v-if="event.registrationMode === 'open'">
              <div class="flex items-start gap-3">
                <div class="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <UIcon name="i-heroicons-check-circle" class="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p class="font-medium text-gray-900 dark:text-white">Open Event</p>
                  <p class="text-sm text-gray-600 dark:text-gray-400">
                    No registration required. Everyone is welcome!
                  </p>
                </div>
              </div>
            </UCard>

            <!-- Ticket Types (for Tickets mode) -->
            <UCard v-if="event.registrationMode === 'tickets' && event.ticketTypes?.length">
              <template #header>
                <h3 class="font-semibold text-gray-900 dark:text-white">Tickets</h3>
              </template>
              <div class="space-y-3">
                <div
                  v-for="ticket in event.ticketTypes"
                  :key="ticket.id"
                  class="flex items-center justify-between"
                >
                  <div>
                    <p class="font-medium text-gray-900 dark:text-white">{{ ticket.name }}</p>
                    <p class="text-sm text-gray-500">
                      {{ ticket.quantity ? `${ticket.quantity - ticket.quantitySold} left` : 'Unlimited' }}
                    </p>
                  </div>
                  <p class="font-semibold text-primary">
                    {{ Number(ticket.price) === 0 ? 'Free' : formatCurrency(Number(ticket.price)) }}
                  </p>
                </div>
              </div>
              <template #footer>
                <USkeleton v-if="authLoading" class="h-10 w-full" />
                <UButton
                  v-else-if="user"
                  color="primary"
                  block
                  @click="openTicketModal"
                >
                  Get Tickets
                </UButton>
                <UButton
                  v-else
                  to="/login"
                  color="primary"
                  block
                >
                  Login to Get Tickets
                </UButton>
              </template>
            </UCard>
          </div>
        </div>
      </div>
    </div>

    <!-- Ticket Purchase Modal -->
    <UModal v-model="showTicketModal" :ui="{ width: 'max-w-xl' }">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Select Tickets
            </h3>
            <UButton
              color="gray"
              variant="ghost"
              icon="i-heroicons-x-mark"
              @click="showTicketModal = false"
            />
          </div>
        </template>

        <div v-if="event?.ticketTypes" class="space-y-4">
          <div
            v-for="tt in event.ticketTypes"
            :key="tt.id"
            class="p-4 border border-gray-200 dark:border-gray-700 rounded-lg"
          >
            <div class="flex items-center justify-between mb-2">
              <div>
                <h4 class="font-medium text-gray-900 dark:text-white">{{ tt.name }}</h4>
                <p v-if="tt.description" class="text-sm text-gray-500">{{ tt.description }}</p>
              </div>
              <p class="font-semibold text-primary text-lg">
                {{ Number(tt.price) === 0 ? 'Free' : formatCurrency(Number(tt.price)) }}
              </p>
            </div>

            <div class="flex items-center justify-between">
              <p class="text-sm text-gray-500">
                {{ tt.quantity ? `${tt.quantity - tt.quantitySold} available` : 'Unlimited' }}
              </p>

              <div class="flex items-center gap-3">
                <UButton
                  color="gray"
                  variant="outline"
                  icon="i-heroicons-minus"
                  size="sm"
                  :disabled="(ticketCart[tt.id] || 0) <= 0"
                  @click="updateTicketQuantity(tt.id, -1)"
                />
                <span class="w-8 text-center font-medium">{{ ticketCart[tt.id] || 0 }}</span>
                <UButton
                  color="gray"
                  variant="outline"
                  icon="i-heroicons-plus"
                  size="sm"
                  :disabled="(ticketCart[tt.id] || 0) >= tt.maxPerOrder || (tt.quantity && (ticketCart[tt.id] || 0) >= (tt.quantity - tt.quantitySold))"
                  @click="updateTicketQuantity(tt.id, 1)"
                />
              </div>
            </div>
          </div>
        </div>

        <template #footer>
          <div class="space-y-4">
            <!-- Guest Form (shown when not logged in and showGuestForm is true) -->
            <div v-if="!user && showGuestForm" class="space-y-3 border-t border-gray-200 dark:border-gray-700 pt-4">
              <p class="text-sm text-gray-600 dark:text-gray-400">
                Enter your details to continue as a guest. We'll send you an email to set up your account.
              </p>
              <UFormGroup label="Full Name" name="guestName">
                <UInput
                  v-model="guestForm.name"
                  placeholder="Enter your full name"
                  icon="i-heroicons-user"
                />
              </UFormGroup>
              <UFormGroup label="Email Address" name="guestEmail">
                <UInput
                  v-model="guestForm.email"
                  type="email"
                  placeholder="Enter your email address"
                  icon="i-heroicons-envelope"
                />
              </UFormGroup>
              <p class="text-xs text-gray-500">
                Already have an account?
                <NuxtLink :to="`/login?redirect=/events/${event?.slug}`" class="text-primary hover:underline">
                  Log in
                </NuxtLink>
              </p>
            </div>

            <!-- Footer Actions -->
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-gray-500">{{ cartItemCount }} ticket(s)</p>
                <p class="text-xl font-bold text-gray-900 dark:text-white">
                  {{ cartTotal === 0 ? 'Free' : formatCurrency(cartTotal) }}
                </p>
              </div>
              <UButton
                color="primary"
                size="lg"
                :loading="isCheckingOut"
                :disabled="cartItemCount === 0"
                @click="checkout"
              >
                <template v-if="user">
                  {{ cartTotal === 0 ? 'Get Free Tickets' : 'Proceed to Payment' }}
                </template>
                <template v-else-if="!showGuestForm">
                  Continue as Guest
                </template>
                <template v-else>
                  {{ cartTotal === 0 ? 'Get Free Tickets' : 'Proceed to Payment' }}
                </template>
              </UButton>
            </div>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Cancel RSVP Confirmation Modal -->
    <UModal v-model="showCancelRsvpModal">
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <div class="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-red-600" />
            </div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Cancel RSVP
            </h3>
          </div>
        </template>

        <div class="space-y-4">
          <p class="text-gray-600 dark:text-gray-400">
            Are you sure you want to cancel your RSVP for this event?
          </p>
          <ul class="list-disc list-inside text-sm text-gray-600 dark:text-gray-400 space-y-1">
            <li>You will lose your spot at this event</li>
            <li>If the event is full, you may not be able to RSVP again</li>
          </ul>

          <div class="pt-2">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Type <span class="font-bold text-red-600">{{ CANCEL_CONFIRM_PHRASE }}</span> to confirm
            </label>
            <UInput
              v-model="cancelRsvpConfirmText"
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
              @click="closeCancelRsvpModal"
            >
              Keep RSVP
            </UButton>
            <UButton
              color="red"
              :disabled="cancelRsvpConfirmText !== CANCEL_CONFIRM_PHRASE"
              :loading="rsvpLoading"
              @click="confirmCancelRsvp"
            >
              Cancel RSVP
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
