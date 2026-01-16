<script setup lang="ts">
import type { RequirementType } from '@nvyt/shared'

definePageMeta({
  layout: 'default',
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

// Fetch requirements
const { data: requirementsResponse, pending: requirementsPending, refresh: refreshRequirements } = await useFetch(
  () => `/api/v1/events/${eventId.value}/requirements`,
  { watch: [eventId] }
)
const requirements = computed(() => requirementsResponse.value?.data ?? [])

// Requirement types
const requirementTypes: { value: RequirementType; label: string; description: string }[] = [
  { value: 'checkbox', label: 'Checkbox Agreement', description: 'Attendee must check to agree' },
  { value: 'yes_no', label: 'Yes/No Question', description: 'Attendee must answer Yes or No' },
]

function getTypeLabel(type: string) {
  return requirementTypes.find(t => t.value === type)?.label || type
}

// Add requirement modal state
const showAddModal = ref(false)
const addForm = ref({
  type: 'checkbox' as RequirementType,
  text: '',
  description: '',
  requiredAnswer: true, // For yes_no type
})
const isAdding = ref(false)

function openAddModal() {
  addForm.value = {
    type: 'checkbox',
    text: '',
    description: '',
    requiredAnswer: true,
  }
  showAddModal.value = true
}

async function addRequirement() {
  if (!addForm.value.text) return

  isAdding.value = true
  try {
    await $fetch(`/api/v1/events/${eventId.value}/requirements`, {
      method: 'POST',
      body: {
        type: addForm.value.type,
        text: addForm.value.text,
        description: addForm.value.description || undefined,
        requiredAnswer: addForm.value.type === 'yes_no' ? addForm.value.requiredAnswer : undefined,
      },
    })
    toast.add({
      title: 'Requirement Added',
      description: 'The requirement has been added successfully',
      color: 'green',
    })
    showAddModal.value = false
    await refreshRequirements()
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to add requirement',
      color: 'red',
    })
  } finally {
    isAdding.value = false
  }
}

// Edit requirement modal state
const showEditModal = ref(false)
const editingRequirement = ref<any>(null)
const editForm = ref({
  type: 'checkbox' as RequirementType,
  text: '',
  description: '',
  requiredAnswer: true,
})
const isUpdating = ref(false)

function openEditModal(requirement: any) {
  editingRequirement.value = requirement
  editForm.value = {
    type: requirement.type,
    text: requirement.text,
    description: requirement.description || '',
    requiredAnswer: requirement.requiredAnswer ?? true,
  }
  showEditModal.value = true
}

async function updateRequirement() {
  if (!editingRequirement.value || !editForm.value.text) return

  isUpdating.value = true
  try {
    await $fetch(`/api/v1/events/${eventId.value}/requirements/${editingRequirement.value.id}`, {
      method: 'PATCH',
      body: {
        type: editForm.value.type,
        text: editForm.value.text,
        description: editForm.value.description || undefined,
        requiredAnswer: editForm.value.type === 'yes_no' ? editForm.value.requiredAnswer : undefined,
      },
    })
    toast.add({
      title: 'Requirement Updated',
      description: 'The requirement has been updated successfully',
      color: 'green',
    })
    showEditModal.value = false
    await refreshRequirements()
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to update requirement',
      color: 'red',
    })
  } finally {
    isUpdating.value = false
  }
}

// Toggle active status
async function toggleActive(requirement: any) {
  try {
    await $fetch(`/api/v1/events/${eventId.value}/requirements/${requirement.id}`, {
      method: 'PATCH',
      body: { isActive: !requirement.isActive },
    })
    await refreshRequirements()
    toast.add({
      title: requirement.isActive ? 'Requirement Disabled' : 'Requirement Enabled',
      description: requirement.isActive
        ? 'This requirement will no longer be shown during checkout'
        : 'This requirement will now be shown during checkout',
      color: 'green',
    })
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to update requirement',
      color: 'red',
    })
  }
}

// Delete requirement confirmation
const showDeleteModal = ref(false)
const deletingRequirement = ref<any>(null)
const isDeleting = ref(false)

function openDeleteModal(requirement: any) {
  deletingRequirement.value = requirement
  showDeleteModal.value = true
}

async function deleteRequirement() {
  if (!deletingRequirement.value) return

  isDeleting.value = true
  try {
    await ($fetch as any)(`/api/v1/events/${eventId.value}/requirements/${deletingRequirement.value.id}`, {
      method: 'DELETE',
    })
    toast.add({
      title: 'Requirement Deleted',
      description: 'The requirement has been removed',
      color: 'green',
    })
    showDeleteModal.value = false
    await refreshRequirements()
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to delete requirement',
      color: 'red',
    })
  } finally {
    isDeleting.value = false
  }
}

// Check if event is in tickets mode
const isTicketsMode = computed(() => event.value?.registrationMode === 'tickets')
</script>

<template>
  <div class="py-8">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Loading -->
      <div v-if="eventPending || requirementsPending" class="space-y-4">
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
              Purchase Requirements
            </h1>
            <p class="text-gray-600 dark:text-gray-400 mt-1">
              Requirements attendees must agree to before purchasing tickets
            </p>
          </div>

          <UButton
            color="primary"
            icon="i-heroicons-plus"
            :disabled="!isTicketsMode"
            @click="openAddModal"
          >
            Add Requirement
          </UButton>
        </div>

        <!-- Not tickets mode warning -->
        <UAlert
          v-if="!isTicketsMode"
          color="yellow"
          icon="i-heroicons-exclamation-triangle"
          title="Tickets mode required"
          class="mb-6"
        >
          <template #description>
            Purchase requirements are only available for events using ticket registration.
            Your event is currently using <strong>{{ event.registrationMode }}</strong> mode.
            <NuxtLink :to="`/dashboard/events/${eventId}/edit`" class="text-primary hover:underline">
              Edit event settings
            </NuxtLink>
            to change the registration mode.
          </template>
        </UAlert>

        <!-- Info about requirements -->
        <UAlert
          v-if="isTicketsMode && requirements.length === 0"
          color="blue"
          icon="i-heroicons-information-circle"
          title="About Purchase Requirements"
          class="mb-6"
        >
          <template #description>
            Add requirements that attendees must agree to before completing their ticket purchase.
            This is useful for terms and conditions, age restrictions, waivers, or any other agreements.
          </template>
        </UAlert>

        <!-- Requirements List -->
        <div v-if="requirements.length > 0" class="space-y-4">
          <UCard
            v-for="(requirement, index) in requirements"
            :key="requirement.id"
            :class="{ 'opacity-60': !requirement.isActive }"
          >
            <div class="flex flex-col md:flex-row md:items-start justify-between gap-4">
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-2">
                  <span class="text-sm text-gray-500 font-medium">
                    #{{ index + 1 }}
                  </span>
                  <UBadge
                    :color="requirement.type === 'checkbox' ? 'blue' : 'purple'"
                    variant="soft"
                    size="xs"
                  >
                    {{ getTypeLabel(requirement.type) }}
                  </UBadge>
                  <UBadge
                    v-if="!requirement.isActive"
                    color="gray"
                    variant="soft"
                    size="xs"
                  >
                    Disabled
                  </UBadge>
                </div>

                <p class="font-medium text-gray-900 dark:text-white">
                  {{ requirement.text }}
                </p>

                <p v-if="requirement.description" class="text-sm text-gray-500 mt-1">
                  {{ requirement.description }}
                </p>

                <p v-if="requirement.type === 'yes_no'" class="text-sm text-gray-500 mt-2">
                  Required answer:
                  <UBadge
                    :color="requirement.requiredAnswer ? 'green' : 'red'"
                    variant="soft"
                    size="xs"
                  >
                    {{ requirement.requiredAnswer ? 'Yes' : 'No' }}
                  </UBadge>
                </p>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <UToggle
                  :model-value="requirement.isActive"
                  @update:model-value="toggleActive(requirement)"
                />
                <UButton
                  color="gray"
                  variant="outline"
                  size="sm"
                  icon="i-heroicons-pencil"
                  @click="openEditModal(requirement)"
                >
                  Edit
                </UButton>
                <UButton
                  color="red"
                  variant="outline"
                  size="sm"
                  icon="i-heroicons-trash"
                  @click="openDeleteModal(requirement)"
                />
              </div>
            </div>
          </UCard>
        </div>

        <!-- Empty State -->
        <UCard v-else-if="isTicketsMode">
          <div class="text-center py-12">
            <UIcon name="i-heroicons-clipboard-document-check" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No requirements yet</h3>
            <p class="text-gray-500 mb-6">
              Add requirements that ticket buyers must agree to before checkout.
            </p>
            <UButton
              color="primary"
              icon="i-heroicons-plus"
              @click="openAddModal"
            >
              Add First Requirement
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

    <!-- Add Requirement Modal -->
    <UModal v-model="showAddModal">
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <div class="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
              <UIcon name="i-heroicons-plus" class="w-5 h-5 text-primary" />
            </div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Add Requirement
            </h3>
          </div>
        </template>

        <div class="space-y-4">
          <UFormGroup label="Requirement Type" required>
            <URadioGroup
              v-model="addForm.type"
              :options="requirementTypes.map(t => ({ value: t.value, label: t.label }))"
            />
            <template #hint>
              <span v-if="addForm.type === 'checkbox'">
                Displays a checkbox that must be checked to proceed
              </span>
              <span v-else>
                Displays a Yes/No question that must be answered correctly
              </span>
            </template>
          </UFormGroup>

          <UFormGroup :label="addForm.type === 'checkbox' ? 'Agreement Text' : 'Question'" required>
            <UTextarea
              v-model="addForm.text"
              :placeholder="addForm.type === 'checkbox'
                ? 'e.g., I agree to the event terms and conditions'
                : 'e.g., Are you 18 years or older?'"
              :rows="2"
            />
          </UFormGroup>

          <UFormGroup label="Additional Description">
            <UTextarea
              v-model="addForm.description"
              placeholder="Optional additional context or explanation"
              :rows="2"
            />
          </UFormGroup>

          <UFormGroup v-if="addForm.type === 'yes_no'" label="Required Answer" required>
            <URadioGroup
              v-model="addForm.requiredAnswer"
              :options="[
                { value: true, label: 'Yes' },
                { value: false, label: 'No' },
              ]"
              :ui="{ fieldset: 'flex gap-4' }"
            />
            <template #hint>
              The answer attendees must select to proceed with checkout
            </template>
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
              :disabled="!addForm.text"
              @click="addRequirement"
            >
              Add Requirement
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Edit Requirement Modal -->
    <UModal v-model="showEditModal">
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <div class="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
              <UIcon name="i-heroicons-pencil-square" class="w-5 h-5 text-primary" />
            </div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Edit Requirement
            </h3>
          </div>
        </template>

        <div class="space-y-4">
          <UFormGroup label="Requirement Type" required>
            <URadioGroup
              v-model="editForm.type"
              :options="requirementTypes.map(t => ({ value: t.value, label: t.label }))"
            />
          </UFormGroup>

          <UFormGroup :label="editForm.type === 'checkbox' ? 'Agreement Text' : 'Question'" required>
            <UTextarea
              v-model="editForm.text"
              :rows="2"
            />
          </UFormGroup>

          <UFormGroup label="Additional Description">
            <UTextarea
              v-model="editForm.description"
              placeholder="Optional additional context or explanation"
              :rows="2"
            />
          </UFormGroup>

          <UFormGroup v-if="editForm.type === 'yes_no'" label="Required Answer" required>
            <URadioGroup
              v-model="editForm.requiredAnswer"
              :options="[
                { value: true, label: 'Yes' },
                { value: false, label: 'No' },
              ]"
              :ui="{ fieldset: 'flex gap-4' }"
            />
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
              :disabled="!editForm.text"
              @click="updateRequirement"
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
              Delete Requirement
            </h3>
          </div>
        </template>

        <div v-if="deletingRequirement" class="space-y-4">
          <p class="text-gray-600 dark:text-gray-400">
            Are you sure you want to delete this requirement?
          </p>
          <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p class="font-medium text-gray-900 dark:text-white">
              {{ deletingRequirement.text }}
            </p>
          </div>
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
              @click="deleteRequirement"
            >
              Delete
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
