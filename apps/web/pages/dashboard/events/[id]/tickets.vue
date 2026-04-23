<script setup lang="ts">
definePageMeta({
  layout: 'dashboard',
})

const route = useRoute()
const eventId = computed(() => route.params.id as string)
const toast = useToast()

// Fetch event details
const { data: eventResponse, pending: eventPending, refresh: refreshEvent } = await useFetch(
  () => `/api/v1/events/by-id/${eventId.value}`,
  { watch: [eventId] }
)
const event = computed(() => eventResponse.value?.data)
useHead(() => ({ title: event.value?.title ? `Tickets - ${event.value.title} - NVYT` : 'NVYT' }))

// Fetch ticket types
const { data: ticketTypesResponse, pending: ticketsPending, refresh: refreshTicketTypes } = await useFetch(
  () => `/api/v1/events/${eventId.value}/ticket-types`,
  { watch: [eventId] }
)
const ticketTypes = computed(() => ticketTypesResponse.value?.data ?? [])

// Fetch verification status
const { data: verificationResponse } = await useFetch(
  () => `/api/v1/events/${eventId.value}/verification`,
  { watch: [eventId] }
)
const verification = computed(() => verificationResponse.value?.data)

// Modal state
const showModal = ref(false)
const editingTicketType = ref<any>(null)
const isSubmitting = ref(false)
const unpublishConfirmed = ref(false)
const formErrors = ref<Record<string, string>>({})

// Whether saving will unpublish the event
const willUnpublish = computed(() => {
  if (!event.value || event.value.status !== 'published') return false
  if (verification.value?.status === 'approved') return false
  // Creating a new paid ticket
  if (!editingTicketType.value && formData.value.price > 0) return true
  // Editing an existing ticket: changing to paid
  if (editingTicketType.value && formData.value.price > 0) {
    const oldPrice = parseFloat(editingTicketType.value.price)
    if (oldPrice === 0) return true
  }
  return false
})

// Form data
const formData = ref({
  name: '',
  description: '',
  price: 0,
  quantity: undefined as number | undefined,
  salesStart: '',
  salesEnd: '',
  maxPerOrder: 10,
  minPerOrder: 1,
  showAvailability: true,
  showNextTierPrice: true,
})

function openCreateModal() {
  editingTicketType.value = null
  formData.value = {
    name: '',
    description: '',
    price: 0,
    quantity: undefined,
    salesStart: '',
    salesEnd: '',
    maxPerOrder: 10,
    minPerOrder: 1,
    showAvailability: true,
    showNextTierPrice: true,
  }
  unpublishConfirmed.value = false
  showModal.value = true
}

function openEditModal(ticketType: any) {
  editingTicketType.value = ticketType
  unpublishConfirmed.value = false
  formData.value = {
    name: ticketType.name,
    description: ticketType.description || '',
    price: parseFloat(ticketType.price),
    quantity: ticketType.quantity,
    salesStart: ticketType.salesStart ? formatDateTimeLocal(ticketType.salesStart) : '',
    salesEnd: ticketType.salesEnd ? formatDateTimeLocal(ticketType.salesEnd) : '',
    maxPerOrder: ticketType.maxPerOrder,
    minPerOrder: ticketType.minPerOrder,
    showAvailability: ticketType.showAvailability ?? true,
    showNextTierPrice: ticketType.showNextTierPrice ?? true,
  }
  showModal.value = true
}

function formatDateTimeLocal(dateStr: string) {
  const date = new Date(dateStr)
  // Format as YYYY-MM-DDTHH:mm for datetime-local input using LOCAL time
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

// Convert datetime-local string to ISO string preserving local time intent
function toISOString(datetimeLocal: string): string {
  if (!datetimeLocal) return ''
  return new Date(datetimeLocal).toISOString()
}

async function saveTicketType() {
  isSubmitting.value = true
  formErrors.value = {}
  try {
    // Convert dates to ISO strings to preserve timezone
    const payload = {
      ...formData.value,
      quantity: formData.value.quantity != null && formData.value.quantity !== '' ? formData.value.quantity : null,
      salesStart: formData.value.salesStart ? toISOString(formData.value.salesStart) : null,
      salesEnd: formData.value.salesEnd ? toISOString(formData.value.salesEnd) : null,
    }

    if (editingTicketType.value) {
      // Update existing
      await $fetch(`/api/v1/events/${eventId.value}/ticket-types/${editingTicketType.value.id}`, {
        method: 'PATCH',
        body: payload,
      })
      toast.add({
        title: 'Ticket Type Updated',
        description: 'Your changes have been saved.',
        color: 'green',
      })
    } else {
      // Create new
      await $fetch(`/api/v1/events/${eventId.value}/ticket-types`, {
        method: 'POST',
        body: payload,
      })
      toast.add({
        title: 'Ticket Type Created',
        description: 'New ticket type has been added.',
        color: 'green',
      })
    }

    const wasUnpublished = willUnpublish.value
    showModal.value = false
    await refreshTicketTypes()
    if (wasUnpublished) {
      await refreshEvent()
      toast.add({
        title: 'Event Unpublished',
        description: 'Your event has been moved to draft. Complete business verification to re-publish.',
        color: 'orange',
      })
    }
  } catch (e: any) {
    const fieldErrors = e.data?.data?.fieldErrors as Record<string, string[]> | undefined
    if (fieldErrors) {
      for (const [field, msgs] of Object.entries(fieldErrors)) {
        if (msgs?.length) formErrors.value[field] = msgs[0]
      }
    }
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to save ticket type',
      color: 'red',
    })
  } finally {
    isSubmitting.value = false
  }
}

async function toggleStatus(ticketType: any) {
  const newStatus = ticketType.status === 'active' ? 'disabled' : 'active'
  try {
    await $fetch(`/api/v1/events/${eventId.value}/ticket-types/${ticketType.id}/status`, {
      method: 'PATCH',
      body: { status: newStatus },
    })
    toast.add({
      title: 'Status Updated',
      description: `Ticket type is now ${newStatus}`,
      color: 'green',
    })
    await refreshTicketTypes()
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to update status',
      color: 'red',
    })
  }
}

async function deleteTicketType(ticketType: any) {
  if (!confirm(`Are you sure you want to delete "${ticketType.name}"? This cannot be undone.`)) {
    return
  }

  try {
    await ($fetch as any)(`/api/v1/events/${eventId.value}/ticket-types/${ticketType.id}`, {
      method: 'DELETE',
    })
    toast.add({
      title: 'Ticket Type Deleted',
      description: 'The ticket type has been removed.',
      color: 'green',
    })
    await refreshTicketTypes()
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to delete ticket type',
      color: 'red',
    })
  }
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
    case 'active': return 'green'
    case 'sold_out': return 'red'
    case 'disabled': return 'gray'
    default: return 'gray'
  }
}

// Check if ticket is enabled but not currently on sale
function getTicketSaleWarning(tt: any): { show: boolean; message: string } | null {
  // Only check active tickets that aren't sold out
  if (tt.status !== 'active') return null
  if (tt.isSoldOut) return null

  // Use server-computed isOnSale if available
  if (tt.isOnSale === true) return null

  const now = new Date()

  // Check if sales period has ended
  if (tt.salesEnd && new Date(tt.salesEnd) < now) {
    return { show: true, message: 'Sales period has ended.' }
  }

  // Use server-computed next sale info (considers both tiers and ticket sales dates)
  if (tt.nextSaleStart) {
    const startDate = new Date(tt.nextSaleStart)
    const formattedDate = startDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })

    if (tt.nextSaleTierName) {
      return {
        show: true,
        message: `Tier "${tt.nextSaleTierName}" starts ${formattedDate}.`,
      }
    } else {
      return {
        show: true,
        message: `Sales start ${formattedDate}.`,
      }
    }
  }

  // Generic message if we can't determine the exact reason
  return {
    show: true,
    message: 'No active price tier. Check price tier settings.',
  }
}

// Drag and drop reordering
const isDragging = ref(false)
const draggedIndex = ref<number | null>(null)

function handleDragStart(index: number) {
  isDragging.value = true
  draggedIndex.value = index
}

function handleDragEnd() {
  isDragging.value = false
  draggedIndex.value = null
}

async function handleDrop(targetIndex: number) {
  if (draggedIndex.value === null || draggedIndex.value === targetIndex) return

  const ticketTypeIds = [...ticketTypes.value].map(t => t.id)
  const [movedId] = ticketTypeIds.splice(draggedIndex.value!, 1)
  if (movedId) {
    ticketTypeIds.splice(targetIndex, 0, movedId)
  }

  try {
    await $fetch(`/api/v1/events/${eventId.value}/ticket-types/reorder`, {
      method: 'PATCH',
      body: { ticketTypeIds },
    })
    await refreshTicketTypes()
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to reorder ticket types',
      color: 'red',
    })
  }
}

// Price tier management
const expandedTiers = ref<Set<string>>(new Set())
const priceTiersCache = ref<Record<string, any[]>>({})
const loadingTiers = ref<Set<string>>(new Set())
const showTierModal = ref(false)
const editingTier = ref<any>(null)
const selectedTicketTypeForTier = ref<any>(null)
const isTierSubmitting = ref(false)

const tierFormData = ref({
  name: '',
  price: 0,
  tierType: 'time' as 'time' | 'quantity' | 'hybrid',
  startDate: '',
  endDate: '',
  quantityLimit: undefined as number | undefined,
  sortOrder: 0,
})

function toggleTiers(ticketTypeId: string) {
  if (expandedTiers.value.has(ticketTypeId)) {
    expandedTiers.value.delete(ticketTypeId)
  } else {
    expandedTiers.value.add(ticketTypeId)
    if (!priceTiersCache.value[ticketTypeId]) {
      fetchPriceTiers(ticketTypeId)
    }
  }
}

async function fetchPriceTiers(ticketTypeId: string) {
  loadingTiers.value.add(ticketTypeId)
  try {
    const response = await $fetch(`/api/v1/events/${eventId.value}/ticket-types/${ticketTypeId}/price-tiers`)
    priceTiersCache.value[ticketTypeId] = (response as any).data ?? []
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to fetch price tiers',
      color: 'red',
    })
    priceTiersCache.value[ticketTypeId] = []
  } finally {
    loadingTiers.value.delete(ticketTypeId)
  }
}

function openCreateTierModal(ticketType: any) {
  selectedTicketTypeForTier.value = ticketType
  editingTier.value = null
  tierFormData.value = {
    name: '',
    price: 0,
    tierType: 'time',
    startDate: '',
    endDate: '',
    quantityLimit: undefined,
    sortOrder: (priceTiersCache.value[ticketType.id]?.length ?? 0),
  }
  showTierModal.value = true
}

function openEditTierModal(ticketType: any, tier: any) {
  selectedTicketTypeForTier.value = ticketType
  editingTier.value = tier
  tierFormData.value = {
    name: tier.name,
    price: parseFloat(tier.price),
    tierType: tier.tierType || 'time',
    startDate: tier.startDate ? formatDateTimeLocal(tier.startDate) : '',
    endDate: tier.endDate ? formatDateTimeLocal(tier.endDate) : '',
    quantityLimit: tier.quantityLimit ?? undefined,
    sortOrder: tier.sortOrder ?? 0,
  }
  showTierModal.value = true
}

async function savePriceTier() {
  if (!selectedTicketTypeForTier.value) return

  isTierSubmitting.value = true
  try {
    const tierType = tierFormData.value.tierType
    const payload: Record<string, any> = {
      name: tierFormData.value.name,
      price: tierFormData.value.price,
      tierType,
      sortOrder: tierFormData.value.sortOrder,
    }

    // Include dates for time and hybrid tiers
    if (tierType === 'time' || tierType === 'hybrid') {
      payload.startDate = toISOString(tierFormData.value.startDate)
      payload.endDate = toISOString(tierFormData.value.endDate)
    }

    // Include quantity limit for quantity and hybrid tiers
    if (tierType === 'quantity' || tierType === 'hybrid') {
      payload.quantityLimit = tierFormData.value.quantityLimit
    }

    const ticketTypeId = selectedTicketTypeForTier.value.id

    if (editingTier.value) {
      await $fetch(`/api/v1/events/${eventId.value}/ticket-types/${ticketTypeId}/price-tiers/${editingTier.value.id}`, {
        method: 'PATCH',
        body: payload,
      })
      toast.add({
        title: 'Price Tier Updated',
        description: 'Your changes have been saved.',
        color: 'green',
      })
    } else {
      await $fetch(`/api/v1/events/${eventId.value}/ticket-types/${ticketTypeId}/price-tiers`, {
        method: 'POST',
        body: payload,
      })
      toast.add({
        title: 'Price Tier Created',
        description: 'New price tier has been added.',
        color: 'green',
      })
    }

    showTierModal.value = false
    await fetchPriceTiers(ticketTypeId)
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to save price tier',
      color: 'red',
    })
  } finally {
    isTierSubmitting.value = false
  }
}

async function deletePriceTier(ticketType: any, tier: any) {
  if (!confirm(`Are you sure you want to delete the "${tier.name}" price tier? This cannot be undone.`)) {
    return
  }

  try {
    await ($fetch as any)(`/api/v1/events/${eventId.value}/ticket-types/${ticketType.id}/price-tiers/${tier.id}`, {
      method: 'DELETE',
    })
    toast.add({
      title: 'Price Tier Deleted',
      description: 'The price tier has been removed.',
      color: 'green',
    })
    await fetchPriceTiers(ticketType.id)
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to delete price tier',
      color: 'red',
    })
  }
}

function formatShortDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function isTierActive(tier: any) {
  const now = new Date()
  const tierType = tier.tierType || 'time'

  if (tierType === 'time') {
    if (!tier.startDate || !tier.endDate) return false
    const start = new Date(tier.startDate)
    const end = new Date(tier.endDate)
    return now >= start && now <= end
  }

  if (tierType === 'quantity') {
    if (tier.quantityLimit === null) return true
    return tier.quantitySold < tier.quantityLimit
  }

  if (tierType === 'hybrid') {
    const timeActive = tier.startDate && tier.endDate
      ? new Date(tier.startDate) <= now && new Date(tier.endDate) >= now
      : true
    const quantityActive = tier.quantityLimit === null || tier.quantitySold < tier.quantityLimit
    return timeActive && quantityActive
  }

  return false
}

function isTierSoldOut(tier: any) {
  if (tier.tierType === 'time') return false
  if (tier.quantityLimit === null) return false
  return tier.quantitySold >= tier.quantityLimit
}

function getTierTypeLabel(tierType: string) {
  switch (tierType) {
    case 'time': return 'Time-based'
    case 'quantity': return 'Quantity-based'
    case 'hybrid': return 'Hybrid'
    default: return 'Time-based'
  }
}

function getTierTypeColor(tierType: string) {
  switch (tierType) {
    case 'time': return 'blue'
    case 'quantity': return 'purple'
    case 'hybrid': return 'orange'
    default: return 'blue'
  }
}
</script>

<template>
  <div class="sm:py-8">
    <div class="px-4 sm:px-6 lg:px-8">
      <!-- Loading -->
      <div v-if="eventPending" class="space-y-4">
        <USkeleton class="h-8 w-1/3" />
        <USkeleton class="h-4 w-1/4" />
      </div>

      <!-- Content -->
      <div v-else-if="event">
        <!-- Header -->
        <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
              Ticket Types
            </h1>
            <p class="text-gray-600 dark:text-gray-400">
              {{ event.title }}
            </p>
          </div>

          <UButton
            color="primary"
            icon="i-heroicons-plus"
            @click="openCreateModal"
          >
            Add Ticket Type
          </UButton>
        </div>

        <!-- No Ticketing Warning -->
        <UAlert
          v-if="event.registrationMode !== 'tickets'"
          color="yellow"
          icon="i-heroicons-exclamation-triangle"
          title="Registration Mode Not Set to Tickets"
          description="Change the registration mode to 'Tickets' in event settings to sell tickets."
          class="mb-6"
        />

        <!-- Ticket Types List -->
        <div v-if="ticketsPending" class="space-y-4">
          <USkeleton v-for="i in 3" :key="i" class="h-32" />
        </div>

        <div v-else-if="ticketTypes.length === 0" class="text-center py-16">
          <UIcon name="i-heroicons-ticket" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            No Ticket Types Yet
          </h2>
          <p class="text-gray-600 dark:text-gray-400 mb-6">
            Create ticket types to start selling tickets for your event.
          </p>
          <UButton color="primary" @click="openCreateModal">
            Create First Ticket Type
          </UButton>
        </div>

        <div v-else class="space-y-4">
          <div
            v-for="(tt, index) in ticketTypes"
            :key="tt.id"
            draggable="true"
            @dragstart="handleDragStart(index)"
            @dragend="handleDragEnd"
            @drop.prevent="handleDrop(index)"
            @dragover.prevent
          >
          <UCard :class="{ 'opacity-50': isDragging && draggedIndex === index }">
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div class="flex items-start gap-3 flex-1">
                <!-- Drag handle -->
                <div class="cursor-move text-gray-400 hover:text-gray-600 mt-1">
                  <UIcon name="i-heroicons-bars-3" class="w-5 h-5" />
                </div>
                <div class="flex-1">
                <div class="flex items-center gap-3 mb-2">
                  <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                    {{ tt.name }}
                  </h3>
                  <UBadge :color="getStatusColor(tt.status)" variant="soft">
                    {{ tt.status.replace('_', ' ') }}
                  </UBadge>
                  <UBadge v-if="tt.isSoldOut" color="red" variant="solid">
                    Sold Out
                  </UBadge>
                </div>
                <div v-if="tt.description" class="text-gray-600 dark:text-gray-400 mb-2 rich-text-display" v-html="sanitizeHtml(tt.description)" />
                <div class="flex flex-wrap gap-4 text-sm text-gray-500">
                  <span class="font-medium text-primary text-lg">
                    {{ formatCurrency(tt.price) }}
                  </span>
                  <span v-if="tt.quantity">
                    {{ tt.quantitySold }} / {{ tt.quantity }} sold
                  </span>
                  <span v-else>
                    {{ tt.quantitySold }} sold (unlimited)
                  </span>
                  <span>
                    Min: {{ tt.minPerOrder }}, Max: {{ tt.maxPerOrder }} per order
                  </span>
                </div>
                <div v-if="tt.salesStart || tt.salesEnd" class="mt-2 text-sm text-gray-500">
                  <span v-if="tt.salesStart">
                    Sales start: {{ new Date(tt.salesStart).toLocaleDateString() }}
                  </span>
                  <span v-if="tt.salesStart && tt.salesEnd"> &middot; </span>
                  <span v-if="tt.salesEnd">
                    Sales end: {{ new Date(tt.salesEnd).toLocaleDateString() }}
                  </span>
                </div>

                <!-- Warning: Ticket is active but not on sale -->
                <UAlert
                  v-if="getTicketSaleWarning(tt)"
                  color="amber"
                  variant="soft"
                  icon="i-heroicons-exclamation-triangle"
                  class="mt-3"
                >
                  <template #title>
                    <span class="text-sm font-medium">Not Currently On Sale</span>
                  </template>
                  <template #description>
                    <span class="text-sm">{{ getTicketSaleWarning(tt)?.message }}</span>
                  </template>
                </UAlert>
              </div>
              </div>

              <div class="flex items-center gap-2">
                <UButton
                  color="gray"
                  variant="ghost"
                  icon="i-heroicons-pencil"
                  @click="openEditModal(tt)"
                />
                <UButton
                  :color="tt.status === 'active' ? 'yellow' : 'green'"
                  variant="ghost"
                  :icon="tt.status === 'active' ? 'i-heroicons-pause' : 'i-heroicons-play'"
                  @click="toggleStatus(tt)"
                />
                <UButton
                  v-if="tt.quantitySold === 0"
                  color="red"
                  variant="ghost"
                  icon="i-heroicons-trash"
                  @click="deleteTicketType(tt)"
                />
              </div>
            </div>

            <!-- Progress bar for sold tickets -->
            <div v-if="tt.quantity" class="mt-4">
              <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  class="bg-primary rounded-full h-2 transition-all"
                  :style="{ width: `${Math.min(100, (tt.quantitySold / tt.quantity) * 100)}%` }"
                />
              </div>
            </div>

            <!-- Price Tiers Section -->
            <div class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                class="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-primary w-full"
                @click="toggleTiers(tt.id)"
              >
                <UIcon
                  name="i-heroicons-chevron-right"
                  class="w-4 h-4 transition-transform"
                  :class="{ 'rotate-90': expandedTiers.has(tt.id) }"
                />
                <UIcon name="i-heroicons-tag" class="w-4 h-4" />
                <span>Price Tiers</span>
                <UBadge
                  v-if="priceTiersCache[tt.id]?.length || tt.tierCount"
                  color="primary"
                  variant="soft"
                  size="xs"
                >
                  {{ priceTiersCache[tt.id]?.length ?? tt.tierCount }}
                </UBadge>
              </button>

              <!-- Expanded Tiers Content -->
              <div v-if="expandedTiers.has(tt.id)" class="mt-4 space-y-3">
                <!-- Loading state -->
                <div v-if="loadingTiers.has(tt.id)" class="flex items-center gap-2 text-sm text-gray-500">
                  <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin" />
                  Loading price tiers...
                </div>

                <!-- Empty state -->
                <div
                  v-else-if="!priceTiersCache[tt.id]?.length"
                  class="text-sm text-gray-500 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-center"
                >
                  <p class="mb-2">No price tiers defined. Using base price ({{ formatCurrency(tt.price) }}).</p>
                  <p class="text-xs text-gray-400 mb-3">Add tiers for time-based pricing (e.g., Early Bird, Regular)</p>
                  <UButton
                    color="primary"
                    variant="soft"
                    size="sm"
                    icon="i-heroicons-plus"
                    @click="openCreateTierModal(tt)"
                  >
                    Add Price Tier
                  </UButton>
                </div>

                <!-- Tiers list -->
                <div v-else class="space-y-2">
                  <div
                    v-for="tier in priceTiersCache[tt.id]"
                    :key="tier.id"
                    class="flex items-center justify-between p-3 rounded-lg border"
                    :class="[
                      isTierActive(tier)
                        ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800'
                        : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700',
                      isTierSoldOut(tier) ? 'opacity-60' : ''
                    ]"
                  >
                    <div class="flex-1">
                      <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-medium text-gray-900 dark:text-white">{{ tier.name }}</span>
                        <UBadge :color="getTierTypeColor(tier.tierType || 'time') as any" variant="soft" size="xs">
                          {{ getTierTypeLabel(tier.tierType || 'time') }}
                        </UBadge>
                        <UBadge v-if="isTierActive(tier)" color="green" variant="soft" size="xs">
                          Active
                        </UBadge>
                        <UBadge v-if="isTierSoldOut(tier)" color="red" variant="soft" size="xs">
                          Sold Out
                        </UBadge>
                      </div>
                      <div class="text-sm text-gray-500 mt-1 space-y-0.5">
                        <div v-if="tier.startDate && tier.endDate">
                          {{ formatShortDate(tier.startDate) }} - {{ formatShortDate(tier.endDate) }}
                        </div>
                        <div v-if="tier.quantityLimit !== null">
                          {{ tier.quantitySold }} / {{ tier.quantityLimit }} sold
                        </div>
                      </div>
                    </div>
                    <div class="flex items-center gap-3">
                      <span class="font-semibold text-primary">{{ formatCurrency(tier.price) }}</span>
                      <div class="flex items-center gap-1">
                        <UButton
                          color="gray"
                          variant="ghost"
                          icon="i-heroicons-pencil"
                          size="xs"
                          @click="openEditTierModal(tt, tier)"
                        />
                        <UButton
                          color="red"
                          variant="ghost"
                          icon="i-heroicons-trash"
                          size="xs"
                          @click="deletePriceTier(tt, tier)"
                        />
                      </div>
                    </div>
                  </div>

                  <!-- Add tier button -->
                  <UButton
                    color="gray"
                    variant="soft"
                    size="sm"
                    icon="i-heroicons-plus"
                    block
                    @click="openCreateTierModal(tt)"
                  >
                    Add Price Tier
                  </UButton>
                </div>
              </div>
            </div>
          </UCard>
          </div>
        </div>

        <!-- Next Step: Setup Public Page -->
        <div v-if="ticketTypes.length > 0 && event.status !== 'published'" class="mt-8 p-6 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-200 dark:border-primary-800">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 class="font-semibold text-gray-900 dark:text-white">
                Ready to go live?
              </h3>
              <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Customize your event page appearance, add a cover image, and publish when you're ready.
              </p>
            </div>
            <UButton
              :to="`/dashboard/events/${eventId}/preview`"
              color="primary"
              icon="i-heroicons-arrow-right"
              trailing
            >
              Setup Public Page
            </UButton>
          </div>
        </div>
      </div>

      <!-- Not Found -->
      <div v-else class="text-center py-20">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">Event Not Found</h1>
        <UButton to="/dashboard" color="primary">Back to Dashboard</UButton>
      </div>
    </div>

    <!-- Create/Edit Modal -->
    <UModal v-model="showModal">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
            {{ editingTicketType ? 'Edit Ticket Type' : 'Create Ticket Type' }}
          </h3>
        </template>

        <form @submit.prevent="saveTicketType" class="space-y-4">
          <UFormGroup label="Name" required :error="formErrors.name">
            <UInput
              v-model="formData.name"
              placeholder="e.g., General Admission, VIP"
              required
            />
          </UFormGroup>

          <UFormGroup label="Description" :error="formErrors.description">
            <RichTextEditor
              v-model="formData.description"
              placeholder="What's included with this ticket?"
              :max-length="1000"
            />
          </UFormGroup>

          <div class="grid grid-cols-2 gap-4">
            <UFormGroup label="Price (PHP)" required :error="formErrors.price">
              <UInput
                v-model.number="formData.price"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                required
              />
            </UFormGroup>

            <UFormGroup label="Quantity" :error="formErrors.quantity">
              <UInput
                v-model.number="formData.quantity"
                type="number"
                min="0"
                placeholder="Unlimited"
              />
              <template #hint>
                Leave empty for unlimited
              </template>
            </UFormGroup>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <UFormGroup label="Min per Order" :error="formErrors.minPerOrder">
              <UInput
                v-model.number="formData.minPerOrder"
                type="number"
                min="1"
                required
              />
            </UFormGroup>

            <UFormGroup label="Max per Order" :error="formErrors.maxPerOrder">
              <UInput
                v-model.number="formData.maxPerOrder"
                type="number"
                min="1"
                required
              />
            </UFormGroup>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <UFormGroup label="Sales Start" :error="formErrors.salesStart">
              <UInput
                v-model="formData.salesStart"
                type="datetime-local"
              />
            </UFormGroup>

            <UFormGroup label="Sales End" :error="formErrors.salesEnd">
              <UInput
                v-model="formData.salesEnd"
                type="datetime-local"
              />
            </UFormGroup>
          </div>

          <!-- Display Settings -->
          <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
            <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Display Settings</p>
            <div class="space-y-3">
              <div class="flex items-center gap-3">
                <UCheckbox v-model="formData.showAvailability" />
                <div>
                  <p class="text-sm text-gray-900 dark:text-white">Show availability</p>
                  <p class="text-xs text-gray-500">Display "X left" or "X available" on the public page</p>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <UCheckbox v-model="formData.showNextTierPrice" />
                <div>
                  <p class="text-sm text-gray-900 dark:text-white">Show next tier price</p>
                  <p class="text-xs text-gray-500">Display countdown and price increase info for upcoming tiers</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Unpublish warning -->
          <UAlert
            v-if="willUnpublish && !unpublishConfirmed"
            color="orange"
            variant="subtle"
            icon="i-heroicons-exclamation-triangle"
            title="This will unpublish your event"
            description="Adding a paid ticket requires business verification. Your event will be moved to draft until verification is approved."
          >
            <template #actions>
              <UButton
                color="orange"
                variant="solid"
                size="sm"
                @click="unpublishConfirmed = true"
              >
                I understand, continue
              </UButton>
            </template>
          </UAlert>

          <div class="flex justify-end gap-3 pt-4">
            <UButton
              color="gray"
              variant="outline"
              @click="showModal = false"
            >
              Cancel
            </UButton>
            <UButton
              type="submit"
              color="primary"
              :loading="isSubmitting"
              :disabled="willUnpublish && !unpublishConfirmed"
            >
              {{ editingTicketType ? 'Save Changes' : 'Create Ticket Type' }}
            </UButton>
          </div>
        </form>
      </UCard>
    </UModal>

    <!-- Price Tier Modal -->
    <UModal v-model="showTierModal">
      <UCard>
        <template #header>
          <div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              {{ editingTier ? 'Edit Price Tier' : 'Create Price Tier' }}
            </h3>
            <p v-if="selectedTicketTypeForTier" class="text-sm text-gray-500 mt-1">
              For: {{ selectedTicketTypeForTier.name }}
            </p>
          </div>
        </template>

        <form @submit.prevent="savePriceTier" class="space-y-4">
          <UFormGroup label="Tier Name" required>
            <UInput
              v-model="tierFormData.name"
              placeholder="e.g., Early Bird, Regular, Last Minute"
              required
            />
          </UFormGroup>

          <UFormGroup label="Price (PHP)" required>
            <UInput
              v-model.number="tierFormData.price"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              required
            />
            <template v-if="selectedTicketTypeForTier" #hint>
              Base price: {{ formatCurrency(selectedTicketTypeForTier.price) }}
            </template>
          </UFormGroup>

          <UFormGroup label="Tier Type" required>
            <USelectMenu
              v-model="tierFormData.tierType"
              :options="[
                { value: 'time', label: 'Time-based', description: 'Active during specific dates' },
                { value: 'quantity', label: 'Quantity-based', description: 'Active until quantity sells out' },
                { value: 'hybrid', label: 'Hybrid', description: 'Both time and quantity constraints' },
              ]"
              value-attribute="value"
              option-attribute="label"
            />
            <template #hint>
              <span v-if="tierFormData.tierType === 'time'">Price is active between start and end dates</span>
              <span v-else-if="tierFormData.tierType === 'quantity'">Price is active until the quantity limit sells out</span>
              <span v-else-if="tierFormData.tierType === 'hybrid'">Price is active within dates AND until quantity sells out</span>
            </template>
          </UFormGroup>

          <!-- Date fields (for time and hybrid tiers) -->
          <div v-if="tierFormData.tierType === 'time' || tierFormData.tierType === 'hybrid'" class="grid grid-cols-2 gap-4">
            <UFormGroup label="Start Date" :required="tierFormData.tierType !== 'quantity'">
              <UInput
                v-model="tierFormData.startDate"
                type="datetime-local"
                :required="tierFormData.tierType !== 'quantity'"
              />
            </UFormGroup>

            <UFormGroup label="End Date" :required="tierFormData.tierType !== 'quantity'">
              <UInput
                v-model="tierFormData.endDate"
                type="datetime-local"
                :required="tierFormData.tierType !== 'quantity'"
              />
            </UFormGroup>
          </div>

          <!-- Quantity limit field (for quantity and hybrid tiers) -->
          <UFormGroup
            v-if="tierFormData.tierType === 'quantity' || tierFormData.tierType === 'hybrid'"
            label="Quantity Limit"
            :required="tierFormData.tierType !== 'time'"
          >
            <UInput
              v-model.number="tierFormData.quantityLimit"
              type="number"
              min="1"
              placeholder="e.g., 50"
              :required="tierFormData.tierType !== 'time'"
            />
            <template #hint>
              Number of tickets available at this tier price
            </template>
          </UFormGroup>

          <UAlert
            color="blue"
            variant="soft"
            icon="i-heroicons-information-circle"
          >
            <template #title>How Price Tiers Work</template>
            <template #description>
              <span v-if="tierFormData.tierType === 'time'">
                When a tier is active (current date is between start and end), its price is used instead of the base price.
                Tiers cannot have overlapping date ranges.
              </span>
              <span v-else-if="tierFormData.tierType === 'quantity'">
                This tier's price is active until its quantity limit sells out.
                Tiers are processed in sort order - when one sells out, the next becomes active.
              </span>
              <span v-else-if="tierFormData.tierType === 'hybrid'">
                Price is active when within the date range AND there's still quantity available.
                Great for "first 50 tickets during early bird period" scenarios.
              </span>
            </template>
          </UAlert>

          <div class="flex justify-end gap-3 pt-4">
            <UButton
              color="gray"
              variant="outline"
              @click="showTierModal = false"
            >
              Cancel
            </UButton>
            <UButton
              type="submit"
              color="primary"
              :loading="isTierSubmitting"
            >
              {{ editingTier ? 'Save Changes' : 'Create Price Tier' }}
            </UButton>
          </div>
        </form>
      </UCard>
    </UModal>
  </div>
</template>
