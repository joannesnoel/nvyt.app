<script setup lang="ts">
definePageMeta({
  layout: 'default',
})

const route = useRoute()
const slug = computed(() => route.params.slug as string)
const token = computed(() => route.query.token as string | undefined)
const inviteToken = computed(() => route.query.invite as string | undefined)

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

// YouTube embed URL helper
const youtubeEmbedUrl = computed(() => {
  const url = event.value?.promoVideoUrl
  if (!url) return null

  let videoId: string | null = null

  // Standard watch URL: youtube.com/watch?v=VIDEO_ID
  const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
  if (watchMatch) videoId = watchMatch[1]

  // Short URL: youtu.be/VIDEO_ID
  if (!videoId) {
    const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/)
    if (shortMatch) videoId = shortMatch[1]
  }

  // Embed URL: youtube.com/embed/VIDEO_ID
  if (!videoId) {
    const embedMatch = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/)
    if (embedMatch) videoId = embedMatch[1]
  }

  if (videoId) {
    const params = new URLSearchParams({
      autoplay: '1',
      mute: '1',
      loop: '1',
      playlist: videoId,
      controls: '0',
      showinfo: '0',
      rel: '0',
      modestbranding: '1',
      playsinline: '1',
      enablejsapi: '1',
    })
    return `https://www.youtube.com/embed/${videoId}?${params.toString()}`
  }

  return null
})

// RSVP state
const rsvpLoading = ref(false)
const showRsvpModal = ref(false)
const rsvpGuestForm = ref({
  name: '',
  email: '',
})

function openRsvpModal() {
  rsvpGuestForm.value = { name: '', email: '' }
  showRsvpModal.value = true
}

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

// Checkout error state
const checkoutError = ref<string | null>(null)

// Requirements state
const requirementResponses = ref<Record<string, boolean | undefined>>({})

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
  // Clear any previous error
  checkoutError.value = null
  // Initialize requirement responses
  if (event.value?.requirements) {
    const responses: Record<string, boolean | undefined> = {}
    for (const req of event.value.requirements) {
      responses[req.id] = req.type === 'checkbox' ? false : undefined
    }
    requirementResponses.value = responses
  }
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

// Check if all requirements are satisfied (for disabling button)
const requirementsSatisfied = computed(() => {
  if (!event.value?.requirements?.length) return true

  for (const req of event.value.requirements) {
    const response = requirementResponses.value[req.id]

    if (req.type === 'checkbox' && response !== true) {
      return false
    }

    if (req.type === 'yes_no') {
      if (response === undefined || response !== req.requiredAnswer) {
        return false
      }
    }
  }
  return true
})

// Check if event is sold out (capacity reached)
const isEventSoldOut = computed(() => {
  if (!event.value) return false
  if (event.value.maxAttendees === null) return false

  // For ticket-based events, use ticketCount
  if (event.value.registrationMode === 'tickets') {
    return (event.value.ticketCount ?? 0) >= event.value.maxAttendees
  }

  // For RSVP events, use attendeeCount
  return (event.value.attendeeCount ?? 0) >= event.value.maxAttendees
})

// Calculate remaining capacity
const remainingCapacity = computed(() => {
  if (!event.value || event.value.maxAttendees === null) return null

  if (event.value.registrationMode === 'tickets') {
    return event.value.maxAttendees - (event.value.ticketCount ?? 0)
  }

  return event.value.maxAttendees - (event.value.attendeeCount ?? 0)
})

function validateRequirements(): boolean {
  if (!event.value?.requirements?.length) return true

  for (const req of event.value.requirements) {
    const response = requirementResponses.value[req.id]

    if (req.type === 'checkbox' && response !== true) {
      toast.add({
        title: 'Requirements',
        description: `You must agree to: "${req.text}"`,
        color: 'yellow',
      })
      return false
    }

    if (req.type === 'yes_no') {
      if (response === undefined) {
        toast.add({
          title: 'Requirements',
          description: `Please answer: "${req.text}"`,
          color: 'yellow',
        })
        return false
      }
      if (response !== req.requiredAnswer) {
        const expected = req.requiredAnswer ? 'Yes' : 'No'
        toast.add({
          title: 'Requirements',
          description: `You must answer "${expected}" to: "${req.text}"`,
          color: 'yellow',
        })
        return false
      }
    }
  }
  return true
}

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

  // Validate requirements
  if (!validateRequirements()) return

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

    // Build requirement responses array
    const reqResponses = event.value.requirements?.length
      ? Object.entries(requirementResponses.value).map(([requirementId, response]) => ({
          requirementId,
          response: response ?? false,
        }))
      : undefined

    const response = await $fetch('/api/v1/orders/checkout', {
      method: 'POST',
      body: {
        eventId: event.value.id,
        items,
        customerName: user.value?.name || guestForm.value.name,
        customerEmail: user.value?.email || guestForm.value.email,
        isGuest: !user.value,
        requirementResponses: reqResponses,
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

    // Extract error message from various possible locations
    const errorMessage = e.data?.message || e.statusMessage || e.message || 'Failed to process checkout. Please try again.'

    // Set inline error for visibility in the modal
    checkoutError.value = errorMessage

    toast.add({
      title: 'Checkout Failed',
      description: errorMessage,
      color: 'red',
      timeout: 6000,
    })

    // Refresh event data to get updated availability
    await refresh()
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

async function handleRsvp(isGuest = false) {
  if (!event.value) return

  // If guest and form not filled, validate
  if (isGuest) {
    if (!rsvpGuestForm.value.name || rsvpGuestForm.value.name.length < 2) {
      toast.add({
        title: 'Name Required',
        description: 'Please enter your name (at least 2 characters).',
        color: 'yellow',
      })
      return
    }
    if (!rsvpGuestForm.value.email || !rsvpGuestForm.value.email.includes('@')) {
      toast.add({
        title: 'Valid Email Required',
        description: 'Please enter a valid email address.',
        color: 'yellow',
      })
      return
    }
  }

  rsvpLoading.value = true
  try {
    const response = await $fetch(`/api/v1/events/${event.value.id}/rsvp`, {
      method: 'POST',
      body: isGuest
        ? {
            isGuest: true,
            guestName: rsvpGuestForm.value.name,
            guestEmail: rsvpGuestForm.value.email,
            inviteToken: inviteToken.value,
          }
        : {
            inviteToken: inviteToken.value,
          },
    }) as any

    // Close modal if open
    showRsvpModal.value = false

    if (response.data?.accountSetupRequired) {
      toast.add({
        title: 'RSVP Successful!',
        description: 'Check your email to set up your account and view your RSVP.',
        color: 'green',
        timeout: 8000,
      })
    } else {
      toast.add({
        title: 'RSVP Successful',
        description: 'You have successfully RSVP\'d to this event',
        color: 'green',
      })
    }

    await refresh()
  } catch (e: any) {
    // Handle account exists error
    if (e.data?.data?.code === 'ACCOUNT_EXISTS_WITH_PASSWORD') {
      toast.add({
        title: 'Account Exists',
        description: 'An account with this email already exists. Please log in.',
        color: 'yellow',
        timeout: 8000,
      })
      showRsvpModal.value = false
      navigateTo(`/login?redirect=/events/${event.value?.slug}`)
      return
    }

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

// Contribution claiming state
const showClaimModal = ref(false)
const claimingItem = ref<any>(null)
const claimForm = ref({
  quantity: 1,
  notes: '',
})
const isClaimLoading = ref(false)

// Check if user can claim contributions (must be confirmed attendee)
const canClaimContributions = computed(() => {
  return user.value && userAttendee.value?.status === 'confirmed' && !isOrganizer.value
})

// Fetch contributions for this event
const { data: contributionsResponse, refresh: refreshContributions } = await useFetch(
  () => event.value?.id ? `/api/v1/events/${event.value.id}/contributions` : null,
  {
    watch: [event],
    immediate: false,
  }
)
const contributions = computed(() => contributionsResponse.value?.data ?? event.value?.contributionItems ?? [])

// Refresh contributions when event loads
watch(event, (e) => {
  if (e?.contributionsEnabled) {
    refreshContributions()
  }
}, { immediate: true })

function openClaimModal(item: any) {
  claimingItem.value = item
  claimForm.value = {
    quantity: 1,
    notes: '',
  }
  showClaimModal.value = true
}

async function claimContribution() {
  if (!event.value || !claimingItem.value) return

  isClaimLoading.value = true
  try {
    await $fetch(`/api/v1/events/${event.value.id}/contributions/${claimingItem.value.id}/claim`, {
      method: 'POST',
      body: claimForm.value,
    })
    toast.add({
      title: 'Claimed!',
      description: `You signed up to bring ${claimingItem.value.name}`,
      color: 'green',
    })
    showClaimModal.value = false
    await refreshContributions()
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to claim item',
      color: 'red',
    })
  } finally {
    isClaimLoading.value = false
  }
}

async function unclaimContribution(item: any) {
  if (!event.value) return

  isClaimLoading.value = true
  try {
    await $fetch(`/api/v1/events/${event.value.id}/contributions/${item.id}/claim`, {
      method: 'DELETE',
    })
    toast.add({
      title: 'Removed',
      description: 'Your contribution claim has been removed',
      color: 'green',
    })
    await refreshContributions()
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to remove claim',
      color: 'red',
    })
  } finally {
    isClaimLoading.value = false
  }
}

function getCategoryColor(category: string) {
  const colors: Record<string, string> = {
    food: 'orange',
    drinks: 'blue',
    supplies: 'green',
    equipment: 'purple',
    other: 'gray',
  }
  return colors[category] || 'gray'
}
</script>

<template>
  <div>
    <!-- Full-width YouTube Video (scrolls with page, behind navbar and content) -->
    <!-- Capped at 1920px width so video height stays reasonable on 4K screens -->
    <div v-if="event && event.mediaType === 'video' && youtubeEmbedUrl" class="relative w-full -mt-16 z-10 bg-black">
      <div class="max-w-[1920px] mx-auto relative" style="padding-bottom: clamp(400px, 56.25%, 1080px);">
        <iframe
          :src="youtubeEmbedUrl"
          :title="event.title"
          class="absolute top-0 left-0 w-full h-full"
          frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        ></iframe>
        <!-- Overlay to prevent hover interactions -->
        <div class="absolute inset-0"></div>
      </div>
    </div>

    <!-- Full-width Cover Image (same layout as video) -->
    <div v-else-if="event && event.mediaType !== 'video' && event.coverImage" class="relative w-full -mt-16 z-10 bg-gray-900">
      <div class="max-w-[1920px] mx-auto relative" style="padding-bottom: clamp(400px, 56.25%, 1080px);">
        <img
          :src="event.coverImage"
          :alt="event.title"
          class="absolute top-0 left-0 w-full h-full object-cover"
        >
      </div>
    </div>

    <!-- #1 - Full-width background (overlays lower part of media) -->
    <div class="relative z-20 bg-gray-50 dark:bg-gray-950 py-12" :class="{ '-mt-24': event && ((event.mediaType === 'video' && youtubeEmbedUrl) || (event.mediaType !== 'video' && event.coverImage)) }">
      <!-- #2 - Narrower content box (overlays more of the media) -->
      <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-6 sm:p-8" :class="{ '-mt-28 lg:-mt-40': event && ((event.mediaType === 'video' && youtubeEmbedUrl) || (event.mediaType !== 'video' && event.coverImage)) }">
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
        <!-- Event Header -->
        <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-8">
          <div>
            <div v-if="event.visibility === 'private' || event.status === 'cancelled'" class="flex items-center gap-2 mb-2">
              <UBadge v-if="event.visibility === 'private'" color="gray" variant="soft">
                <UIcon name="i-heroicons-lock-closed" class="w-3 h-3 mr-1" />
                Private
              </UBadge>
              <UBadge v-if="event.status === 'cancelled'" color="red" variant="soft">
                Cancelled
              </UBadge>
            </div>
            <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
              {{ event.title }}
            </h1>
            <p class="text-gray-600 dark:text-gray-400 mt-2">
              Organized by {{ event.organizationName || event.organizer?.name }}
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
                  @click="handleRsvp(false)"
                >
                  <UIcon name="i-heroicons-hand-raised" class="w-5 h-5 mr-2" />
                  RSVP to this Event
                </UButton>
                <UButton
                  v-else
                  color="primary"
                  size="lg"
                  @click="openRsvpModal"
                >
                  <UIcon name="i-heroicons-hand-raised" class="w-5 h-5 mr-2" />
                  RSVP to this Event
                </UButton>
              </template>

              <!-- Registration Mode: Tickets -->
              <template v-else-if="event.registrationMode === 'tickets'">
                <template v-if="isEventSoldOut">
                  <UButton
                    color="gray"
                    size="lg"
                    disabled
                  >
                    <UIcon name="i-heroicons-x-circle" class="w-5 h-5 mr-2" />
                    Sold Out
                  </UButton>
                </template>
                <template v-else-if="event.ticketTypes?.length">
                  <UButton
                    color="primary"
                    size="lg"
                    @click="openTicketModal"
                  >
                    <UIcon name="i-heroicons-ticket" class="w-5 h-5 mr-2" />
                    Get Tickets
                  </UButton>
                  <p v-if="remainingCapacity !== null && remainingCapacity <= 10" class="text-sm text-orange-600 text-center mt-2">
                    Only {{ remainingCapacity }} spots left!
                  </p>
                </template>
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
                  @click="handleRsvp(false)"
                >
                  <UIcon name="i-heroicons-hand-raised" class="w-5 h-5 mr-2" />
                  RSVP to this Event
                </UButton>
                <UButton
                  v-else
                  color="primary"
                  size="lg"
                  @click="openRsvpModal"
                >
                  <UIcon name="i-heroicons-hand-raised" class="w-5 h-5 mr-2" />
                  RSVP to this Event
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
            <UCard v-if="event.contributionsEnabled && contributions?.length">
              <template #header>
                <div class="flex items-center justify-between">
                  <h2 class="font-semibold text-gray-900 dark:text-white">Contribution List</h2>
                  <p v-if="canClaimContributions" class="text-sm text-gray-500">
                    Sign up to bring something!
                  </p>
                </div>
              </template>
              <div class="space-y-3">
                <div
                  v-for="item in contributions"
                  :key="item.id"
                  class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                  :class="{ 'opacity-60': item.isFullyClaimed }"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div class="flex-1">
                      <div class="flex items-center gap-2 mb-1">
                        <p class="font-medium text-gray-900 dark:text-white">{{ item.name }}</p>
                        <UBadge :color="getCategoryColor(item.category)" variant="soft" size="xs">
                          {{ item.category }}
                        </UBadge>
                        <UBadge v-if="item.isFullyClaimed" color="green" variant="soft" size="xs">
                          Complete
                        </UBadge>
                      </div>
                      <p v-if="item.description" class="text-sm text-gray-500 mb-2">{{ item.description }}</p>
                      <div class="flex items-center gap-3 text-sm">
                        <span :class="item.isFullyClaimed ? 'text-green-600' : 'text-gray-600 dark:text-gray-400'">
                          {{ item.quantityClaimed }}/{{ item.quantityNeeded }} claimed
                        </span>
                      </div>
                      <!-- User's claim indicator -->
                      <p v-if="item.userClaim" class="text-sm text-primary mt-1">
                        You're bringing {{ item.userClaim.quantity }}x
                        <span v-if="item.userClaim.notes" class="text-gray-500">- "{{ item.userClaim.notes }}"</span>
                      </p>
                    </div>
                    <div class="flex-shrink-0">
                      <!-- Claim/Unclaim buttons -->
                      <template v-if="canClaimContributions">
                        <UButton
                          v-if="item.userClaim"
                          color="red"
                          variant="outline"
                          size="sm"
                          :loading="isClaimLoading"
                          @click="unclaimContribution(item)"
                        >
                          Remove
                        </UButton>
                        <UButton
                          v-else-if="!item.isFullyClaimed"
                          color="primary"
                          size="sm"
                          :loading="isClaimLoading"
                          @click="openClaimModal(item)"
                        >
                          I'll bring this
                        </UButton>
                      </template>
                    </div>
                  </div>
                  <!-- Progress bar -->
                  <UProgress
                    :value="(item.quantityClaimed / item.quantityNeeded) * 100"
                    :color="item.isFullyClaimed ? 'green' : 'primary'"
                    size="xs"
                    class="mt-2"
                  />
                  <!-- Claims list (show who's bringing what) -->
                  <div v-if="item.claims?.length > 0" class="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                    <p class="text-xs text-gray-500 mb-1">Who's bringing this:</p>
                    <div class="flex flex-wrap gap-2">
                      <div
                        v-for="claim in item.claims"
                        :key="claim.id"
                        class="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400"
                      >
                        <UAvatar :src="claim.user?.avatarUrl" :alt="claim.user?.name" size="2xs" />
                        <span>{{ claim.user?.name }}</span>
                        <span v-if="claim.quantity > 1">({{ claim.quantity }}x)</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <!-- Info for non-attendees -->
              <template v-if="!canClaimContributions && !isOrganizer" #footer>
                <p class="text-sm text-gray-500 text-center">
                  <template v-if="!user">
                    <NuxtLink :to="`/login?redirect=/events/${event.slug}`" class="text-primary hover:underline">Log in</NuxtLink>
                    and RSVP to sign up for contributions
                  </template>
                  <template v-else-if="!userAttendee">
                    RSVP to this event to sign up for contributions
                  </template>
                  <template v-else-if="userAttendee.status !== 'confirmed'">
                    Your RSVP must be confirmed to sign up for contributions
                  </template>
                </p>
              </template>
            </UCard>

            <!-- Announcements Section -->
            <UCard v-if="event.announcements?.length">
              <template #header>
                <div class="flex items-center gap-3">
                  <div class="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                    <UIcon name="i-heroicons-megaphone" class="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h2 class="font-semibold text-gray-900 dark:text-white">Announcements</h2>
                    <p class="text-sm text-gray-500">Latest updates from the organizer</p>
                  </div>
                </div>
              </template>
              <div class="space-y-4">
                <div
                  v-for="announcement in event.announcements"
                  :key="announcement.id"
                  class="relative"
                >
                  <div class="p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 mb-1">
                        <UIcon
                          v-if="announcement.isPinned"
                          name="i-heroicons-bookmark-solid"
                          class="w-4 h-4 text-primary flex-shrink-0"
                        />
                        <h3 class="font-semibold text-gray-900 dark:text-white">
                          {{ announcement.title }}
                        </h3>
                      </div>
                      <p class="text-xs text-gray-500 mb-2">
                        {{ new Date(announcement.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }}
                      </p>
                      <p class="text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                        {{ announcement.content }}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </UCard>

            <!-- FAQs Section -->
            <UCard v-if="event.faqs?.length">
              <template #header>
                <div class="flex items-center gap-3">
                  <div class="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                    <UIcon name="i-heroicons-question-mark-circle" class="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h2 class="font-semibold text-gray-900 dark:text-white">Frequently Asked Questions</h2>
                    <p class="text-sm text-gray-500">{{ event.faqs.length }} question{{ event.faqs.length !== 1 ? 's' : '' }}</p>
                  </div>
                </div>
              </template>
              <div class="space-y-3">
                <div
                  v-for="(faq, index) in event.faqs"
                  :key="faq.id"
                  class="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
                >
                  <UAccordion
                    :items="[{ label: faq.question, content: faq.answer, slot: 'faq-' + index }]"
                    :ui="{
                      wrapper: '',
                      item: { base: '', padding: '' },
                    }"
                  >
                    <template #default="{ open }">
                      <button
                        class="w-full flex items-start gap-3 p-4 text-left transition-colors"
                        :class="open ? 'bg-gray-50 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'"
                      >
                        <div
                          class="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
                          :class="open ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'"
                        >
                          {{ index + 1 }}
                        </div>
                        <span class="flex-1 font-medium text-gray-900 dark:text-white">
                          {{ faq.question }}
                        </span>
                        <UIcon
                          name="i-heroicons-chevron-down"
                          class="w-5 h-5 text-gray-400 transition-transform flex-shrink-0 mt-0.5"
                          :class="{ 'rotate-180 text-primary': open }"
                        />
                      </button>
                    </template>
                    <template #[`faq-${index}`]>
                      <div class="px-4 pb-4 pt-0">
                        <div class="pl-9 text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                          {{ faq.answer }}
                        </div>
                      </div>
                    </template>
                  </UAccordion>
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
                <UButton
                  v-if="isEventSoldOut"
                  color="gray"
                  block
                  disabled
                >
                  Sold Out
                </UButton>
                <UButton
                  v-else
                  color="primary"
                  block
                  @click="openTicketModal"
                >
                  Get Tickets
                </UButton>
              </template>
            </UCard>
          </div>
        </div>
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

        <!-- Event Requirements Section -->
        <div v-if="event?.requirements?.length" class="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
          <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-3">
            Terms & Requirements
          </h4>
          <div class="space-y-4">
            <div v-for="req in event.requirements" :key="req.id">
              <!-- Checkbox type -->
              <template v-if="req.type === 'checkbox'">
                <div class="flex items-start gap-3">
                  <UCheckbox
                    v-model="requirementResponses[req.id]"
                    :ui="{ wrapper: 'mt-0.5' }"
                  />
                  <div class="flex-1">
                    <p class="text-sm text-gray-700 dark:text-gray-300">{{ req.text }}</p>
                    <p v-if="req.description" class="text-xs text-gray-500 mt-1">
                      {{ req.description }}
                    </p>
                  </div>
                </div>
              </template>

              <!-- Yes/No type -->
              <template v-else-if="req.type === 'yes_no'">
                <div class="space-y-2">
                  <p class="text-sm text-gray-700 dark:text-gray-300">{{ req.text }}</p>
                  <p v-if="req.description" class="text-xs text-gray-500">
                    {{ req.description }}
                  </p>
                  <URadioGroup
                    v-model="requirementResponses[req.id]"
                    :options="[
                      { value: true, label: 'Yes' },
                      { value: false, label: 'No' },
                    ]"
                    :ui="{ fieldset: 'flex gap-4' }"
                  />
                </div>
              </template>
            </div>
          </div>
        </div>

        <template #footer>
          <div class="space-y-4">
            <!-- Checkout Error Alert -->
            <UAlert
              v-if="checkoutError"
              color="red"
              variant="soft"
              icon="i-heroicons-exclamation-circle"
              :title="checkoutError"
              :close-button="{ icon: 'i-heroicons-x-mark', color: 'red', variant: 'link' }"
              @close="checkoutError = null"
            />

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

            <!-- Requirements hint -->
            <p
              v-if="event?.requirements?.length && !requirementsSatisfied"
              class="text-sm text-yellow-600 dark:text-yellow-500 flex items-center gap-2"
            >
              <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4" />
              Please agree to all requirements above to continue
            </p>

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
                :disabled="cartItemCount === 0 || !requirementsSatisfied"
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

    <!-- Guest RSVP Modal -->
    <UModal v-model="showRsvpModal">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              RSVP to {{ event?.title }}
            </h3>
            <UButton
              color="gray"
              variant="ghost"
              icon="i-heroicons-x-mark"
              @click="showRsvpModal = false"
            />
          </div>
        </template>

        <div class="space-y-4">
          <p class="text-sm text-gray-600 dark:text-gray-400">
            Enter your details to RSVP. We'll send you an email to confirm your registration.
          </p>

          <UFormGroup label="Full Name" name="rsvpGuestName" required>
            <UInput
              v-model="rsvpGuestForm.name"
              placeholder="Enter your full name"
              icon="i-heroicons-user"
            />
          </UFormGroup>

          <UFormGroup label="Email Address" name="rsvpGuestEmail" required>
            <UInput
              v-model="rsvpGuestForm.email"
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

        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton
              color="gray"
              variant="outline"
              @click="showRsvpModal = false"
            >
              Cancel
            </UButton>
            <UButton
              color="primary"
              :loading="rsvpLoading"
              @click="handleRsvp(true)"
            >
              <UIcon name="i-heroicons-hand-raised" class="w-4 h-4 mr-2" />
              Confirm RSVP
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Claim Contribution Modal -->
    <UModal v-model="showClaimModal">
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <div class="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
              <UIcon name="i-heroicons-gift" class="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                Sign Up to Bring
              </h3>
              <p class="text-sm text-gray-500">{{ claimingItem?.name }}</p>
            </div>
          </div>
        </template>

        <div v-if="claimingItem" class="space-y-4">
          <p v-if="claimingItem.description" class="text-sm text-gray-600 dark:text-gray-400">
            {{ claimingItem.description }}
          </p>

          <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p class="text-sm">
              <span class="font-medium">{{ claimingItem.remainingNeeded }}</span> more needed
              <span class="text-gray-500">
                ({{ claimingItem.quantityClaimed }}/{{ claimingItem.quantityNeeded }} claimed)
              </span>
            </p>
          </div>

          <UFormGroup label="How many will you bring?">
            <UInput
              v-model.number="claimForm.quantity"
              type="number"
              min="1"
              :max="claimingItem.remainingNeeded"
            />
            <template #hint>
              <span class="text-gray-500">Max: {{ claimingItem.remainingNeeded }}</span>
            </template>
          </UFormGroup>

          <UFormGroup label="Notes (optional)">
            <UTextarea
              v-model="claimForm.notes"
              placeholder="e.g., I'll bring homemade pasta salad"
              :rows="2"
            />
          </UFormGroup>
        </div>

        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton
              color="gray"
              variant="outline"
              @click="showClaimModal = false"
            >
              Cancel
            </UButton>
            <UButton
              color="primary"
              :loading="isClaimLoading"
              :disabled="!claimForm.quantity || claimForm.quantity < 1 || claimForm.quantity > (claimingItem?.remainingNeeded || 1)"
              @click="claimContribution"
            >
              <UIcon name="i-heroicons-check" class="w-4 h-4 mr-2" />
              Confirm
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
