<script setup lang="ts">
definePageMeta({
  layout: 'dashboard',
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
useHead(() => ({ title: event.value?.title ? `Discounts - ${event.value.title} - NVYT` : 'NVYT' }))

// Fetch ticket types (for restriction multi-select)
const { data: ticketTypesResponse } = await useFetch(
  () => `/api/v1/events/${eventId.value}/ticket-types`,
  { watch: [eventId] }
)
const ticketTypes = computed(() => ticketTypesResponse.value?.data ?? [])

// Fetch discount codes
const { data: discountCodesResponse, pending: codesPending, refresh: refreshCodes } = await useFetch(
  () => `/api/v1/events/${eventId.value}/discount-codes`,
  { watch: [eventId] }
)
const discountCodes = computed(() => discountCodesResponse.value?.data ?? [])

// Modal state
const showModal = ref(false)
const editingCode = ref<any>(null)
const isSubmitting = ref(false)

const formData = ref({
  code: '',
  description: '',
  discountType: 'percentage' as 'percentage' | 'fixed',
  discountValue: 0,
  usageLimit: null as number | null,
  ticketTypeIds: null as string[] | null,
  isActive: true,
})

function openCreateModal() {
  editingCode.value = null
  formData.value = {
    code: '',
    description: '',
    discountType: 'percentage',
    discountValue: 0,
    usageLimit: null,
    ticketTypeIds: null,
    isActive: true,
  }
  showModal.value = true
}

function openEditModal(code: any) {
  editingCode.value = code
  formData.value = {
    code: code.code,
    description: code.description || '',
    discountType: code.discountType,
    discountValue: parseFloat(code.discountValue),
    usageLimit: code.usageLimit,
    ticketTypeIds: code.ticketTypeIds ?? null,
    isActive: code.isActive,
  }
  showModal.value = true
}

async function saveCode() {
  isSubmitting.value = true
  try {
    const payload = {
      ...formData.value,
      usageLimit: formData.value.usageLimit || null,
      ticketTypeIds: formData.value.ticketTypeIds?.length ? formData.value.ticketTypeIds : null,
    }

    if (editingCode.value) {
      await $fetch(`/api/v1/events/${eventId.value}/discount-codes/${editingCode.value.id}`, {
        method: 'PATCH',
        body: payload,
      })
      toast.add({ title: 'Discount Code Updated', color: 'green' })
    } else {
      await $fetch(`/api/v1/events/${eventId.value}/discount-codes`, {
        method: 'POST',
        body: payload,
      })
      toast.add({ title: 'Discount Code Created', color: 'green' })
    }

    showModal.value = false
    await refreshCodes()
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to save discount code',
      color: 'red',
    })
  } finally {
    isSubmitting.value = false
  }
}

async function toggleActive(code: any) {
  try {
    await $fetch(`/api/v1/events/${eventId.value}/discount-codes/${code.id}`, {
      method: 'PATCH',
      body: { isActive: !code.isActive },
    })
    toast.add({
      title: code.isActive ? 'Code Deactivated' : 'Code Activated',
      color: 'green',
    })
    await refreshCodes()
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to update code',
      color: 'red',
    })
  }
}

async function deleteCode(code: any) {
  if (!confirm(`Delete discount code "${code.code}"? This cannot be undone.`)) return

  try {
    await ($fetch as any)(`/api/v1/events/${eventId.value}/discount-codes/${code.id}`, {
      method: 'DELETE',
    })
    toast.add({ title: 'Discount Code Deleted', color: 'green' })
    await refreshCodes()
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to delete code',
      color: 'red',
    })
  }
}

async function copyCode(code: string) {
  await navigator.clipboard.writeText(code)
  toast.add({ title: 'Code Copied', description: code, color: 'green' })
}

function formatDiscount(code: any) {
  if (code.discountType === 'percentage') {
    return `${parseFloat(code.discountValue)}%`
  }
  return formatCurrency(code.discountValue)
}

function formatCurrency(amount: string | number) {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(num)
}

function getTicketTypeName(id: string) {
  return ticketTypes.value.find((tt: any) => tt.id === id)?.name ?? 'Unknown'
}

// Ticket type options for the multi-select
const ticketTypeOptions = computed(() =>
  ticketTypes.value.map((tt: any) => ({ label: tt.name, value: tt.id }))
)
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
              Discount Codes
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
            Add Discount Code
          </UButton>
        </div>

        <!-- Codes List -->
        <div v-if="codesPending" class="space-y-4">
          <USkeleton v-for="i in 3" :key="i" class="h-24" />
        </div>

        <div v-else-if="discountCodes.length === 0" class="text-center py-16">
          <UIcon name="i-heroicons-tag" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            No Discount Codes Yet
          </h2>
          <p class="text-gray-600 dark:text-gray-400 mb-6">
            Create promo codes to offer discounts on your tickets.
          </p>
          <UButton color="primary" @click="openCreateModal">
            Create First Code
          </UButton>
        </div>

        <div v-else class="space-y-4">
          <UCard v-for="code in discountCodes" :key="code.id">
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div class="flex-1">
                <div class="flex items-center gap-3 mb-2">
                  <span class="font-mono text-lg font-bold text-gray-900 dark:text-white">
                    {{ code.code }}
                  </span>
                  <UBadge :color="code.isActive ? 'green' : 'gray'" variant="soft">
                    {{ code.isActive ? 'Active' : 'Inactive' }}
                  </UBadge>
                  <UBadge color="primary" variant="soft">
                    {{ formatDiscount(code) }} off
                  </UBadge>
                </div>
                <p v-if="code.description" class="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  {{ code.description }}
                </p>
                <div class="flex flex-wrap gap-4 text-sm text-gray-500">
                  <span>
                    Used: {{ code.usageCount }} ticket{{ code.usageCount !== 1 ? 's' : '' }}{{ code.usageLimit ? ` / ${code.usageLimit}` : '' }}
                  </span>
                  <span v-if="code.ticketTypeIds?.length">
                    Applies to: {{ (code.ticketTypeIds as string[]).map(id => getTicketTypeName(id)).join(', ') }}
                  </span>
                  <span v-else>
                    Applies to: All tickets
                  </span>
                </div>
              </div>

              <div class="flex items-center gap-2">
                <UButton
                  color="gray"
                  variant="ghost"
                  icon="i-heroicons-clipboard-document"
                  @click="copyCode(code.code)"
                />
                <UButton
                  color="gray"
                  variant="ghost"
                  icon="i-heroicons-pencil"
                  @click="openEditModal(code)"
                />
                <UButton
                  :color="code.isActive ? 'yellow' : 'green'"
                  variant="ghost"
                  :icon="code.isActive ? 'i-heroicons-pause' : 'i-heroicons-play'"
                  @click="toggleActive(code)"
                />
                <UButton
                  v-if="code.usageCount === 0"
                  color="red"
                  variant="ghost"
                  icon="i-heroicons-trash"
                  @click="deleteCode(code)"
                />
              </div>
            </div>

            <!-- Usage progress bar if limited -->
            <div v-if="code.usageLimit" class="mt-4">
              <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  class="bg-primary rounded-full h-2 transition-all"
                  :style="{ width: `${Math.min(100, (code.usageCount / code.usageLimit) * 100)}%` }"
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
            {{ editingCode ? 'Edit Discount Code' : 'Create Discount Code' }}
          </h3>
        </template>

        <form @submit.prevent="saveCode" class="space-y-4">
          <UFormGroup label="Code" required>
            <UInput
              v-model="formData.code"
              placeholder="e.g., EARLYBIRD"
              class="uppercase"
              required
            />
            <template #hint>Will be auto-uppercased</template>
          </UFormGroup>

          <UFormGroup label="Description">
            <UTextarea
              v-model="formData.description"
              placeholder="Internal note (not shown to buyers)"
              :rows="2"
            />
          </UFormGroup>

          <div class="grid grid-cols-2 gap-4">
            <UFormGroup label="Discount Type" required>
              <USelectMenu
                v-model="formData.discountType"
                :options="[
                  { value: 'percentage', label: 'Percentage (%)' },
                  { value: 'fixed', label: 'Fixed Amount (PHP)' },
                ]"
                value-attribute="value"
                option-attribute="label"
              />
            </UFormGroup>

            <UFormGroup :label="formData.discountType === 'percentage' ? 'Discount (%)' : 'Discount (PHP)'" required>
              <UInput
                v-model.number="formData.discountValue"
                type="number"
                min="0"
                :max="formData.discountType === 'percentage' ? 100 : undefined"
                step="0.01"
                required
              />
            </UFormGroup>
          </div>

          <UFormGroup label="Usage Limit">
            <UInput
              v-model.number="formData.usageLimit"
              type="number"
              min="1"
              placeholder="Unlimited"
            />
            <template #hint>Leave empty for unlimited uses</template>
          </UFormGroup>

          <UFormGroup label="Ticket Type Restrictions">
            <USelectMenu
              v-model="formData.ticketTypeIds"
              :options="ticketTypeOptions"
              value-attribute="value"
              option-attribute="label"
              multiple
              placeholder="All ticket types"
            />
            <template #hint>Leave empty to apply to all ticket types</template>
          </UFormGroup>

          <div class="flex items-center gap-3">
            <UCheckbox v-model="formData.isActive" />
            <span class="text-sm text-gray-900 dark:text-white">Active</span>
          </div>

          <div class="flex justify-end gap-3 pt-4">
            <UButton color="gray" variant="outline" @click="showModal = false">
              Cancel
            </UButton>
            <UButton type="submit" color="primary" :loading="isSubmitting">
              {{ editingCode ? 'Save Changes' : 'Create Code' }}
            </UButton>
          </div>
        </form>
      </UCard>
    </UModal>
  </div>
</template>
