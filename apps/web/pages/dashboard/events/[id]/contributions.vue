<script setup lang="ts">
import type { ContributionCategory } from '@nvyt/shared'

definePageMeta({
  layout: 'dashboard',
})

const route = useRoute()
const eventId = computed(() => route.params.id as string)
const toast = useToast()

// Fetch event by ID
const { data: eventResponse, pending: eventPending } = await useFetch(
  () => `/api/v1/events/by-id/${eventId.value}`,
  { watch: [eventId] }
)
const event = computed(() => eventResponse.value?.data)

// Fetch contributions
const { data: contributionsResponse, pending: contributionsPending, refresh: refreshContributions } = await useFetch(
  () => `/api/v1/events/${eventId.value}/contributions`,
  { watch: [eventId] }
)
const contributions = computed(() => contributionsResponse.value?.data ?? [])

// Categories with colors
type BadgeColor = 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral' | 'red' | 'orange' | 'amber' | 'yellow' | 'lime' | 'green' | 'emerald' | 'teal' | 'cyan' | 'sky' | 'blue' | 'indigo' | 'violet' | 'purple' | 'fuchsia' | 'pink' | 'rose' | 'gray'
const categories: { value: ContributionCategory; label: string; color: BadgeColor }[] = [
  { value: 'food', label: 'Food', color: 'orange' },
  { value: 'drinks', label: 'Drinks', color: 'blue' },
  { value: 'supplies', label: 'Supplies', color: 'green' },
  { value: 'equipment', label: 'Equipment', color: 'purple' },
  { value: 'other', label: 'Other', color: 'gray' },
]

function getCategoryColor(category: string): BadgeColor {
  return categories.find(c => c.value === category)?.color ?? 'gray'
}

function getCategoryLabel(category: string) {
  return categories.find(c => c.value === category)?.label || 'Other'
}

// Add item modal state
const showAddModal = ref(false)
const addForm = ref({
  name: '',
  description: '',
  category: 'other' as ContributionCategory,
  quantityNeeded: 1,
})
const isAdding = ref(false)

function openAddModal() {
  addForm.value = {
    name: '',
    description: '',
    category: 'other',
    quantityNeeded: 1,
  }
  showAddModal.value = true
}

async function addItem() {
  if (!addForm.value.name) return

  isAdding.value = true
  try {
    await $fetch(`/api/v1/events/${eventId.value}/contributions`, {
      method: 'POST',
      body: addForm.value,
    })
    toast.add({
      title: 'Item Added',
      description: `${addForm.value.name} has been added to the contribution list`,
      color: 'green',
    })
    showAddModal.value = false
    await refreshContributions()
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to add item',
      color: 'red',
    })
  } finally {
    isAdding.value = false
  }
}

// Edit item modal state
const showEditModal = ref(false)
const editingItem = ref<any>(null)
const editForm = ref({
  name: '',
  description: '',
  category: 'other' as ContributionCategory,
  quantityNeeded: 1,
})
const isUpdating = ref(false)

function openEditModal(item: any) {
  editingItem.value = item
  editForm.value = {
    name: item.name,
    description: item.description || '',
    category: item.category,
    quantityNeeded: item.quantityNeeded,
  }
  showEditModal.value = true
}

async function updateItem() {
  if (!editingItem.value || !editForm.value.name) return

  isUpdating.value = true
  try {
    await $fetch(`/api/v1/events/${eventId.value}/contributions/${editingItem.value.id}`, {
      method: 'PATCH',
      body: editForm.value,
    })
    toast.add({
      title: 'Item Updated',
      description: 'Contribution item has been updated',
      color: 'green',
    })
    showEditModal.value = false
    await refreshContributions()
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to update item',
      color: 'red',
    })
  } finally {
    isUpdating.value = false
  }
}

// Delete item confirmation
const showDeleteModal = ref(false)
const deletingItem = ref<any>(null)
const isDeleting = ref(false)

function openDeleteModal(item: any) {
  deletingItem.value = item
  showDeleteModal.value = true
}

async function deleteItem() {
  if (!deletingItem.value) return

  isDeleting.value = true
  try {
    await ($fetch as any)(`/api/v1/events/${eventId.value}/contributions/${deletingItem.value.id}`, {
      method: 'DELETE',
    })
    toast.add({
      title: 'Item Deleted',
      description: 'Contribution item has been removed',
      color: 'green',
    })
    showDeleteModal.value = false
    await refreshContributions()
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to delete item',
      color: 'red',
    })
  } finally {
    isDeleting.value = false
  }
}

// View claims modal
const showClaimsModal = ref(false)
const viewingItem = ref<any>(null)

function openClaimsModal(item: any) {
  viewingItem.value = item
  showClaimsModal.value = true
}

// Group contributions by category
const contributionsByCategory = computed(() => {
  const grouped: Record<string, any[]> = {}
  for (const item of contributions.value) {
    if (!grouped[item.category]) {
      grouped[item.category] = []
    }
    grouped[item.category]!.push(item)
  }
  return grouped
})

// Category order for display
const categoryOrder = ['food', 'drinks', 'supplies', 'equipment', 'other']
const sortedCategories = computed(() => {
  return categoryOrder.filter(cat => (contributionsByCategory.value[cat]?.length ?? 0) > 0)
})
</script>

<template>
  <div class="sm:py-8">
    <div class="px-4 sm:px-6 lg:px-8">
      <!-- Loading -->
      <div v-if="eventPending || contributionsPending" class="space-y-4">
        <USkeleton class="h-8 w-1/3" />
        <USkeleton class="h-4 w-1/4" />
        <div class="mt-8 space-y-4">
          <USkeleton v-for="i in 3" :key="i" class="h-20" />
        </div>
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
              Contribution List
            </h1>
            <p class="text-gray-600 dark:text-gray-400 mt-1">
              Manage items attendees can bring to {{ event.title }}
            </p>
          </div>

          <UButton
            color="primary"
            icon="i-heroicons-plus"
            @click="openAddModal"
          >
            Add Item
          </UButton>
        </div>

        <!-- Contributions not enabled warning -->
        <UAlert
          v-if="!event.contributionsEnabled"
          color="yellow"
          icon="i-heroicons-exclamation-triangle"
          title="Contributions not enabled"
          class="mb-6"
        >
          <template #description>
            Contributions are not enabled for this event.
            <NuxtLink :to="`/dashboard/events/${eventId}/edit`" class="text-primary hover:underline">
              Edit event settings
            </NuxtLink>
            to enable contributions.
          </template>
        </UAlert>

        <!-- Stats Summary -->
        <div v-if="contributions.length > 0" class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <UCard>
            <div class="text-center">
              <p class="text-2xl font-bold text-gray-900 dark:text-white">
                {{ contributions.length }}
              </p>
              <p class="text-sm text-gray-500">Items</p>
            </div>
          </UCard>
          <UCard>
            <div class="text-center">
              <p class="text-2xl font-bold text-green-600">
                {{ contributions.filter(c => c.isFullyClaimed).length }}
              </p>
              <p class="text-sm text-gray-500">Fully Claimed</p>
            </div>
          </UCard>
          <UCard>
            <div class="text-center">
              <p class="text-2xl font-bold text-yellow-600">
                {{ contributions.filter(c => c.quantityClaimed > 0 && !c.isFullyClaimed).length }}
              </p>
              <p class="text-sm text-gray-500">Partially Claimed</p>
            </div>
          </UCard>
          <UCard>
            <div class="text-center">
              <p class="text-2xl font-bold text-gray-600">
                {{ contributions.filter(c => c.quantityClaimed === 0).length }}
              </p>
              <p class="text-sm text-gray-500">Unclaimed</p>
            </div>
          </UCard>
        </div>

        <!-- Contributions by Category -->
        <div v-if="contributions.length > 0" class="space-y-6">
          <div v-for="category in sortedCategories" :key="category">
            <div class="flex items-center gap-2 mb-3">
              <UBadge :color="getCategoryColor(category) as any" variant="soft">
                {{ getCategoryLabel(category) }}
              </UBadge>
              <span class="text-sm text-gray-500">
                ({{ contributionsByCategory[category]?.length ?? 0 }} items)
              </span>
            </div>

            <div class="space-y-3">
              <UCard
                v-for="item in contributionsByCategory[category]"
                :key="item.id"
                :class="{ 'opacity-75': item.isFullyClaimed }"
              >
                <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div class="flex-1">
                    <div class="flex items-center gap-2 mb-1">
                      <h3 class="font-semibold text-gray-900 dark:text-white">
                        {{ item.name }}
                      </h3>
                      <UBadge
                        v-if="item.isFullyClaimed"
                        color="green"
                        variant="soft"
                        size="xs"
                      >
                        Complete
                      </UBadge>
                    </div>
                    <p v-if="item.description" class="text-sm text-gray-500 mb-2">
                      {{ item.description }}
                    </p>
                    <div class="flex items-center gap-4">
                      <span class="text-sm">
                        <span :class="item.isFullyClaimed ? 'text-green-600' : 'text-gray-600 dark:text-gray-400'">
                          {{ item.quantityClaimed }}
                        </span>
                        <span class="text-gray-400">/{{ item.quantityNeeded }} claimed</span>
                      </span>
                      <button
                        v-if="item.claims?.length > 0"
                        class="text-sm text-primary hover:underline"
                        @click="openClaimsModal(item)"
                      >
                        View {{ item.claims.length }} claim{{ item.claims.length !== 1 ? 's' : '' }}
                      </button>
                    </div>
                  </div>

                  <div class="flex flex-wrap gap-2">
                    <UButton
                      color="gray"
                      variant="outline"
                      size="sm"
                      icon="i-heroicons-pencil"
                      @click="openEditModal(item)"
                    >
                      Edit
                    </UButton>
                    <UButton
                      color="red"
                      variant="outline"
                      size="sm"
                      icon="i-heroicons-trash"
                      @click="openDeleteModal(item)"
                    />
                  </div>
                </div>

                <!-- Progress bar -->
                <UProgress
                  :value="(item.quantityClaimed / item.quantityNeeded) * 100"
                  :color="item.isFullyClaimed ? 'green' : 'primary'"
                  size="sm"
                  class="mt-3"
                />
              </UCard>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <UCard v-else>
          <div class="text-center py-12">
            <UIcon name="i-heroicons-gift" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No contribution items yet</h3>
            <p class="text-gray-500 mb-6">
              Add items that attendees can sign up to bring to your event.
            </p>
            <UButton
              color="primary"
              icon="i-heroicons-plus"
              @click="openAddModal"
            >
              Add First Item
            </UButton>
          </div>
        </UCard>
      </div>

      <!-- Not Found -->
      <div v-else class="text-center py-20">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">Event Not Found</h1>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          This event doesn't exist or you don't have access to it.
        </p>
        <UButton to="/dashboard" color="primary">Back to Dashboard</UButton>
      </div>
    </div>

    <!-- Add Item Modal -->
    <UModal v-model="showAddModal">
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <div class="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
              <UIcon name="i-heroicons-plus" class="w-5 h-5 text-primary" />
            </div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Add Contribution Item
            </h3>
          </div>
        </template>

        <div class="space-y-4">
          <UFormGroup label="Item Name" required>
            <UInput
              v-model="addForm.name"
              placeholder="e.g., Pasta Salad, Plastic Cups"
            />
          </UFormGroup>

          <UFormGroup label="Description">
            <UTextarea
              v-model="addForm.description"
              placeholder="Optional details about what you need"
              :rows="2"
            />
          </UFormGroup>

          <UFormGroup label="Category">
            <USelectMenu
              v-model="addForm.category"
              :options="categories"
              value-attribute="value"
              option-attribute="label"
            />
          </UFormGroup>

          <UFormGroup label="Quantity Needed">
            <UInput
              v-model.number="addForm.quantityNeeded"
              type="number"
              min="1"
            />
          </UFormGroup>
        </div>

        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton
              color="gray"
              variant="outline"
              @click="showAddModal = false"
            >
              Cancel
            </UButton>
            <UButton
              color="primary"
              :loading="isAdding"
              :disabled="!addForm.name"
              @click="addItem"
            >
              Add Item
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Edit Item Modal -->
    <UModal v-model="showEditModal">
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <div class="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
              <UIcon name="i-heroicons-pencil-square" class="w-5 h-5 text-primary" />
            </div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Edit Contribution Item
            </h3>
          </div>
        </template>

        <div class="space-y-4">
          <UFormGroup label="Item Name" required>
            <UInput
              v-model="editForm.name"
              placeholder="e.g., Pasta Salad, Plastic Cups"
            />
          </UFormGroup>

          <UFormGroup label="Description">
            <UTextarea
              v-model="editForm.description"
              placeholder="Optional details about what you need"
              :rows="2"
            />
          </UFormGroup>

          <UFormGroup label="Category">
            <USelectMenu
              v-model="editForm.category"
              :options="categories"
              value-attribute="value"
              option-attribute="label"
            />
          </UFormGroup>

          <UFormGroup label="Quantity Needed">
            <UInput
              v-model.number="editForm.quantityNeeded"
              type="number"
              min="1"
            />
            <template v-if="editingItem?.quantityClaimed > 0" #hint>
              <span class="text-yellow-600">
                {{ editingItem.quantityClaimed }} already claimed - cannot reduce below this
              </span>
            </template>
          </UFormGroup>
        </div>

        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton
              color="gray"
              variant="outline"
              @click="showEditModal = false"
            >
              Cancel
            </UButton>
            <UButton
              color="primary"
              :loading="isUpdating"
              :disabled="!editForm.name"
              @click="updateItem"
            >
              Save Changes
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Delete Confirmation Modal -->
    <UModal v-model="showDeleteModal">
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <div class="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-red-600" />
            </div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Delete Item
            </h3>
          </div>
        </template>

        <div v-if="deletingItem" class="space-y-4">
          <p class="text-gray-600 dark:text-gray-400">
            Are you sure you want to delete <strong>{{ deletingItem.name }}</strong>?
          </p>
          <p v-if="deletingItem.quantityClaimed > 0" class="text-sm text-yellow-600">
            This item has {{ deletingItem.quantityClaimed }} claim(s). They will also be removed.
          </p>
        </div>

        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton
              color="gray"
              variant="outline"
              @click="showDeleteModal = false"
            >
              Cancel
            </UButton>
            <UButton
              color="red"
              :loading="isDeleting"
              @click="deleteItem"
            >
              Delete
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- View Claims Modal -->
    <UModal v-model="showClaimsModal">
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <div class="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
              <UIcon name="i-heroicons-users" class="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                {{ viewingItem?.name }}
              </h3>
              <p class="text-sm text-gray-500">
                {{ viewingItem?.quantityClaimed }}/{{ viewingItem?.quantityNeeded }} claimed
              </p>
            </div>
          </div>
        </template>

        <div v-if="viewingItem?.claims?.length > 0" class="space-y-3">
          <div
            v-for="claim in viewingItem.claims"
            :key="claim.id"
            class="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
          >
            <UAvatar
              :src="claim.user?.avatarUrl"
              :alt="claim.user?.name"
              size="sm"
            />
            <div class="flex-1">
              <div class="flex items-center justify-between">
                <p class="font-medium text-gray-900 dark:text-white">
                  {{ claim.user?.name }}
                </p>
                <UBadge color="green" variant="soft" size="xs">
                  {{ claim.quantity }}x
                </UBadge>
              </div>
              <p class="text-sm text-gray-500">{{ claim.user?.email }}</p>
              <p v-if="claim.notes" class="text-sm text-gray-600 dark:text-gray-400 mt-1 italic">
                "{{ claim.notes }}"
              </p>
            </div>
          </div>
        </div>

        <div v-else class="text-center py-8 text-gray-500">
          No claims yet
        </div>

        <template #footer>
          <div class="flex justify-end">
            <UButton
              color="gray"
              variant="outline"
              @click="showClaimsModal = false"
            >
              Close
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
