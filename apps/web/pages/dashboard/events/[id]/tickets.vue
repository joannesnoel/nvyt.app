<script setup lang="ts">
definePageMeta({
  layout: 'default',
})

const route = useRoute()
const eventId = computed(() => route.params.id as string)
const toast = useToast()

// Fetch event details
const { data: eventResponse, pending: eventPending } = await useFetch(
  () => `/api/v1/events/by-id/${eventId.value}`,
  { watch: [eventId] }
)
const event = computed(() => eventResponse.value?.data)

// Fetch ticket types
const { data: ticketTypesResponse, pending: ticketsPending, refresh: refreshTicketTypes } = await useFetch(
  () => `/api/v1/events/${eventId.value}/ticket-types`,
  { watch: [eventId] }
)
const ticketTypes = computed(() => ticketTypesResponse.value?.data ?? [])

// Modal state
const showModal = ref(false)
const editingTicketType = ref<any>(null)
const isSubmitting = ref(false)

// Form data
const formData = ref({
  name: '',
  description: '',
  price: 0,
  quantity: null as number | null,
  salesStart: '',
  salesEnd: '',
  maxPerOrder: 10,
  minPerOrder: 1,
})

function openCreateModal() {
  editingTicketType.value = null
  formData.value = {
    name: '',
    description: '',
    price: 0,
    quantity: null,
    salesStart: '',
    salesEnd: '',
    maxPerOrder: 10,
    minPerOrder: 1,
  }
  showModal.value = true
}

function openEditModal(ticketType: any) {
  editingTicketType.value = ticketType
  formData.value = {
    name: ticketType.name,
    description: ticketType.description || '',
    price: parseFloat(ticketType.price),
    quantity: ticketType.quantity,
    salesStart: ticketType.salesStart ? formatDateTimeLocal(ticketType.salesStart) : '',
    salesEnd: ticketType.salesEnd ? formatDateTimeLocal(ticketType.salesEnd) : '',
    maxPerOrder: ticketType.maxPerOrder,
    minPerOrder: ticketType.minPerOrder,
  }
  showModal.value = true
}

function formatDateTimeLocal(dateStr: string) {
  const date = new Date(dateStr)
  return date.toISOString().slice(0, 16)
}

async function saveTicketType() {
  isSubmitting.value = true
  try {
    const payload = {
      ...formData.value,
      quantity: formData.value.quantity || undefined,
      salesStart: formData.value.salesStart || undefined,
      salesEnd: formData.value.salesEnd || undefined,
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

    showModal.value = false
    await refreshTicketTypes()
  } catch (e: any) {
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
    await $fetch(`/api/v1/events/${eventId.value}/ticket-types/${ticketType.id}`, {
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
</script>

<template>
  <div class="py-8">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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
            <NuxtLink
              :to="`/dashboard/events/${eventId}`"
              class="text-gray-600 dark:text-gray-400 hover:text-primary flex items-center gap-1 mb-2"
            >
              <UIcon name="i-heroicons-arrow-left" class="w-4 h-4" />
              Back to Event
            </NuxtLink>
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
          <UCard v-for="tt in ticketTypes" :key="tt.id">
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
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
                <p v-if="tt.description" class="text-gray-600 dark:text-gray-400 mb-2">
                  {{ tt.description }}
                </p>
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
          </UCard>
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
          <UFormGroup label="Name" required>
            <UInput
              v-model="formData.name"
              placeholder="e.g., General Admission, VIP"
              required
            />
          </UFormGroup>

          <UFormGroup label="Description">
            <UTextarea
              v-model="formData.description"
              placeholder="What's included with this ticket?"
              :rows="2"
            />
          </UFormGroup>

          <div class="grid grid-cols-2 gap-4">
            <UFormGroup label="Price (PHP)" required>
              <UInput
                v-model.number="formData.price"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                required
              />
            </UFormGroup>

            <UFormGroup label="Quantity">
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
            <UFormGroup label="Min per Order">
              <UInput
                v-model.number="formData.minPerOrder"
                type="number"
                min="1"
                required
              />
            </UFormGroup>

            <UFormGroup label="Max per Order">
              <UInput
                v-model.number="formData.maxPerOrder"
                type="number"
                min="1"
                required
              />
            </UFormGroup>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <UFormGroup label="Sales Start">
              <UInput
                v-model="formData.salesStart"
                type="datetime-local"
              />
            </UFormGroup>

            <UFormGroup label="Sales End">
              <UInput
                v-model="formData.salesEnd"
                type="datetime-local"
              />
            </UFormGroup>
          </div>

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
            >
              {{ editingTicketType ? 'Save Changes' : 'Create Ticket Type' }}
            </UButton>
          </div>
        </form>
      </UCard>
    </UModal>
  </div>
</template>
