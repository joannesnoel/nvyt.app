<script setup lang="ts">
import type { RegistrationFieldType, FieldOption, FieldValidation } from '@nvyt/shared'

definePageMeta({
  layout: 'dashboard',
})

const route = useRoute()
const eventId = computed(() => route.params.id as string)
const toast = useToast()

// Fetch event by ID
const { data: eventResponse, pending: eventPending, refresh: refreshEvent } = await useFetch(
  () => `/api/v1/events/by-id/${eventId.value}`,
  { watch: [eventId] }
)
const event = computed(() => eventResponse.value?.data)
useHead(() => ({ title: event.value?.title ? `Registration - ${event.value.title} - NVYT` : 'NVYT' }))

// Fetch registration fields
const { data: fieldsResponse, pending: fieldsPending, refresh: refreshFields } = await useFetch(
  () => `/api/v1/events/${eventId.value}/registration-fields`,
  { watch: [eventId] }
)
const fields = computed(() => fieldsResponse.value?.data ?? [])

// Field types configuration (address removed - now a built-in toggle)
const fieldTypes: { value: RegistrationFieldType; label: string; icon: string; description: string }[] = [
  { value: 'text', label: 'Text', icon: 'i-heroicons-document-text', description: 'Single line text input' },
  { value: 'email', label: 'Email', icon: 'i-heroicons-envelope', description: 'Email address input' },
  { value: 'phone', label: 'Phone', icon: 'i-heroicons-phone', description: 'Phone number input' },
  { value: 'textarea', label: 'Long Text', icon: 'i-heroicons-bars-3-bottom-left', description: 'Multi-line text area' },
  { value: 'select', label: 'Dropdown', icon: 'i-heroicons-chevron-up-down', description: 'Single selection from options' },
  { value: 'radio', label: 'Radio Buttons', icon: 'i-heroicons-radio', description: 'Single choice from options' },
  { value: 'checkbox', label: 'Checkbox', icon: 'i-heroicons-check-circle', description: 'Yes/No toggle' },
  { value: 'date', label: 'Date', icon: 'i-heroicons-calendar', description: 'Date picker' },
  { value: 'number', label: 'Number', icon: 'i-heroicons-hashtag', description: 'Numeric input' },
  { value: 'url', label: 'URL', icon: 'i-heroicons-link', description: 'Website URL input' },
]

// Built-in fields state
const collectAttendeeAddress = ref(false)
const collectAttendeeSex = ref(false)
const sexOptions = ref<{ value: string; label: string }[]>([
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
])

// Initialize built-in fields from event data
watch(event, (e) => {
  if (e) {
    collectAttendeeAddress.value = e.collectAttendeeAddress ?? false
    collectAttendeeSex.value = e.collectAttendeeSex ?? false
    if (e.attendeeSexOptions && e.attendeeSexOptions.length > 0) {
      sexOptions.value = e.attendeeSexOptions
    }
  }
}, { immediate: true })

// Save built-in field settings
const isSavingBuiltIn = ref(false)

async function saveBuiltInSettings() {
  isSavingBuiltIn.value = true
  try {
    await $fetch(`/api/v1/events/${eventId.value}`, {
      method: 'PATCH',
      body: {
        collectAttendeeAddress: collectAttendeeAddress.value,
        collectAttendeeSex: collectAttendeeSex.value,
        attendeeSexOptions: collectAttendeeSex.value ? sexOptions.value.filter(o => o.value && o.label) : undefined,
      },
    })
    toast.add({
      title: 'Settings Saved',
      description: 'Built-in field settings have been updated',
      color: 'green',
    })
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to save settings',
      color: 'red',
    })
  } finally {
    isSavingBuiltIn.value = false
  }
}

function addSexOption() {
  sexOptions.value.push({ value: '', label: '' })
}

function removeSexOption(index: number) {
  if (sexOptions.value.length > 2) {
    sexOptions.value.splice(index, 1)
  }
}

function getTypeInfo(type: string) {
  return fieldTypes.find(t => t.value === type) ?? fieldTypes[0]!
}

// Form state
interface FieldForm {
  fieldType: RegistrationFieldType
  label: string
  placeholder: string
  helpText: string
  isRequired: boolean
  options: FieldOption[]
  validation: FieldValidation
}

const defaultFieldForm = (): FieldForm => ({
  fieldType: 'text',
  label: '',
  placeholder: '',
  helpText: '',
  isRequired: true,
  options: [{ value: '', label: '' }],
  validation: {},
})

// Add field modal state
const showAddModal = ref(false)
const addForm = ref<FieldForm>(defaultFieldForm())
const isAdding = ref(false)

function openAddModal() {
  addForm.value = defaultFieldForm()
  showAddModal.value = true
}

function addOptionToAddForm() {
  addForm.value.options.push({ value: '', label: '' })
}

function removeOptionFromAddForm(index: number) {
  if (addForm.value.options.length > 1) {
    addForm.value.options.splice(index, 1)
  }
}

function addOptionToEditForm() {
  editForm.value.options.push({ value: '', label: '' })
}

function removeOptionFromEditForm(index: number) {
  if (editForm.value.options.length > 1) {
    editForm.value.options.splice(index, 1)
  }
}

async function addField() {
  if (!addForm.value.label) return

  // Validate options for select/radio types
  if ((addForm.value.fieldType === 'select' || addForm.value.fieldType === 'radio')) {
    const validOptions = addForm.value.options.filter(o => o.value && o.label)
    if (validOptions.length === 0) {
      toast.add({
        title: 'Validation Error',
        description: 'Please add at least one option with both value and label',
        color: 'red',
      })
      return
    }
    addForm.value.options = validOptions
  }

  isAdding.value = true
  try {
    await $fetch(`/api/v1/events/${eventId.value}/registration-fields`, {
      method: 'POST',
      body: {
        fieldType: addForm.value.fieldType,
        label: addForm.value.label,
        placeholder: addForm.value.placeholder || undefined,
        helpText: addForm.value.helpText || undefined,
        isRequired: addForm.value.isRequired,
        options: (addForm.value.fieldType === 'select' || addForm.value.fieldType === 'radio')
          ? addForm.value.options.filter(o => o.value && o.label)
          : undefined,
        validation: Object.keys(addForm.value.validation).length > 0
          ? addForm.value.validation
          : undefined,
      },
    })
    toast.add({
      title: 'Field Added',
      description: 'The registration field has been added successfully',
      color: 'green',
    })
    showAddModal.value = false
    await refreshFields()
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to add field',
      color: 'red',
    })
  } finally {
    isAdding.value = false
  }
}

// Edit field modal state
const showEditModal = ref(false)
const editingField = ref<any>(null)
const editForm = ref<FieldForm>(defaultFieldForm())
const isUpdating = ref(false)

function openEditModal(field: any) {
  editingField.value = field
  editForm.value = {
    fieldType: field.fieldType,
    label: field.label,
    placeholder: field.placeholder || '',
    helpText: field.helpText || '',
    isRequired: field.isRequired,
    options: field.options?.length > 0 ? [...field.options] : [{ value: '', label: '' }],
    validation: field.validation || {},
  }
  showEditModal.value = true
}

async function updateField() {
  if (!editingField.value || !editForm.value.label) return

  // Validate options for select/radio types
  if ((editForm.value.fieldType === 'select' || editForm.value.fieldType === 'radio')) {
    const validOptions = editForm.value.options.filter(o => o.value && o.label)
    if (validOptions.length === 0) {
      toast.add({
        title: 'Validation Error',
        description: 'Please add at least one option with both value and label',
        color: 'red',
      })
      return
    }
    editForm.value.options = validOptions
  }

  isUpdating.value = true
  try {
    await $fetch(`/api/v1/events/${eventId.value}/registration-fields/${editingField.value.id}`, {
      method: 'PATCH',
      body: {
        fieldType: editForm.value.fieldType,
        label: editForm.value.label,
        placeholder: editForm.value.placeholder || undefined,
        helpText: editForm.value.helpText || undefined,
        isRequired: editForm.value.isRequired,
        options: (editForm.value.fieldType === 'select' || editForm.value.fieldType === 'radio')
          ? editForm.value.options.filter(o => o.value && o.label)
          : undefined,
        validation: Object.keys(editForm.value.validation).length > 0
          ? editForm.value.validation
          : undefined,
      },
    })
    toast.add({
      title: 'Field Updated',
      description: 'The registration field has been updated successfully',
      color: 'green',
    })
    showEditModal.value = false
    await refreshFields()
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to update field',
      color: 'red',
    })
  } finally {
    isUpdating.value = false
  }
}

// Toggle active status
async function toggleActive(field: any) {
  try {
    await $fetch(`/api/v1/events/${eventId.value}/registration-fields/${field.id}`, {
      method: 'PATCH',
      body: { isActive: !field.isActive },
    })
    await refreshFields()
    toast.add({
      title: field.isActive ? 'Field Disabled' : 'Field Enabled',
      description: field.isActive
        ? 'This field will no longer be shown during registration'
        : 'This field will now be shown during registration',
      color: 'green',
    })
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to update field',
      color: 'red',
    })
  }
}

// Delete field confirmation
const showDeleteModal = ref(false)
const deletingField = ref<any>(null)
const isDeleting = ref(false)

function openDeleteModal(field: any) {
  deletingField.value = field
  showDeleteModal.value = true
}

async function deleteField() {
  if (!deletingField.value) return

  isDeleting.value = true
  try {
    await ($fetch as any)(`/api/v1/events/${eventId.value}/registration-fields/${deletingField.value.id}`, {
      method: 'DELETE',
    })
    toast.add({
      title: 'Field Deleted',
      description: 'The registration field has been removed',
      color: 'green',
    })
    showDeleteModal.value = false
    await refreshFields()
  } catch (e: any) {
    // Close the modal first so the toast is visible
    showDeleteModal.value = false

    // Check error message (could be in e.data.message or e.message)
    const errorMessage = e.data?.message || e.message || ''
    const hasSubmittedData = errorMessage.includes('submitted registration data')

    if (hasSubmittedData) {
      // Offer to disable instead
      toast.add({
        title: 'Cannot Delete Field',
        description: 'This field has submitted data. Would you like to disable it instead?',
        color: 'yellow',
        timeout: 10000,
        actions: [{
          label: 'Disable Field',
          click: async () => {
            await toggleActive(deletingField.value)
          },
        }],
      })
    } else {
      toast.add({
        title: 'Error',
        description: errorMessage || 'Failed to delete field',
        color: 'red',
      })
    }
  } finally {
    isDeleting.value = false
  }
}

// Check if event is in tickets mode
const isTicketsMode = computed(() => event.value?.registrationMode === 'tickets')

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

  const fieldIds = [...fields.value].map(f => f.id)
  const [movedId] = fieldIds.splice(draggedIndex.value!, 1)
  if (movedId) {
    fieldIds.splice(targetIndex, 0, movedId)
  }

  try {
    await $fetch(`/api/v1/events/${eventId.value}/registration-fields/reorder`, {
      method: 'PATCH',
      body: { fieldIds },
    })
    await refreshFields()
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to reorder fields',
      color: 'red',
    })
  }
}

// Field type requires options
function needsOptions(type: string) {
  return type === 'select' || type === 'radio'
}

// Field type supports placeholder (not radio, checkbox, or date)
function supportsPlaceholder(type: string) {
  return ['text', 'email', 'phone', 'textarea', 'select', 'number', 'url'].includes(type)
}

// Field type supports validation
function supportsValidation(type: string) {
  return ['text', 'textarea', 'number'].includes(type)
}
</script>

<template>
  <div class="sm:py-8">
    <div class="px-4 sm:px-6 lg:px-8">
      <!-- Loading -->
      <div v-if="eventPending || fieldsPending" class="space-y-4">
        <USkeleton class="h-8 w-1/3" />
        <USkeleton class="h-4 w-1/4" />
        <div class="mt-8 space-y-4">
          <USkeleton v-for="i in 3" :key="i" class="h-24" />
        </div>
      </div>

      <!-- Content -->
      <div v-else-if="event">
        <!-- Header -->
        <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
              Registration Form
            </h1>
            <p class="text-gray-600 dark:text-gray-400 mt-1">
              Collect attendee information after ticket purchase
            </p>
          </div>

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
            Registration forms are only available for events using ticket registration.
            Your event is currently using <strong>{{ event.registrationMode }}</strong> mode.
            <NuxtLink :to="`/dashboard/events/${eventId}/edit`" class="text-primary hover:underline">
              Edit event settings
            </NuxtLink>
            to change the registration mode.
          </template>
        </UAlert>

        <!-- Info about registration forms -->
        <UAlert
          v-if="isTicketsMode && fields.length === 0"
          color="blue"
          icon="i-heroicons-information-circle"
          title="About Registration Forms"
          class="mb-6"
        >
          <template #description>
            Add custom fields to collect attendee information after they complete their ticket purchase.
            Each ticket holder will fill out the form separately. This is useful for collecting dietary
            preferences, t-shirt sizes, emergency contacts, or any other attendee-specific information.
          </template>
        </UAlert>

        <!-- Built-in Fields Section -->
        <UCard v-if="isTicketsMode" class="mb-6">
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-user-circle" class="w-5 h-5 text-primary" />
              <h3 class="font-medium text-gray-900 dark:text-white">Built-in Attendee Fields</h3>
            </div>
            <p class="text-sm text-gray-500 mt-1">
              Toggle additional attendee information fields. Name, Email, and Birthdate are always collected.
            </p>
          </template>

          <div class="space-y-6">
            <!-- Attendee's Address Toggle -->
            <div class="flex items-start gap-4">
              <div class="flex-1">
                <div class="flex items-center gap-3">
                  <UToggle v-model="collectAttendeeAddress" />
                  <div>
                    <p class="font-medium text-gray-900 dark:text-white">Attendee's Address</p>
                    <p class="text-sm text-gray-500">
                      Collect the attendee's physical address with city/province selection
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Attendee's Sex Toggle -->
            <div class="space-y-4">
              <div class="flex items-start gap-4">
                <div class="flex-1">
                  <div class="flex items-center gap-3">
                    <UToggle v-model="collectAttendeeSex" />
                    <div>
                      <p class="font-medium text-gray-900 dark:text-white">Attendee's Sex</p>
                      <p class="text-sm text-gray-500">
                        Collect the attendee's sex. Default options: Male, Female
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Sex Options -->
              <div v-if="collectAttendeeSex" class="ml-12 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Options</p>
                <div class="space-y-2">
                  <div
                    v-for="(option, index) in sexOptions"
                    :key="index"
                    class="flex items-center gap-2"
                  >
                    <UInput
                      v-model="option.value"
                      placeholder="Value (stored)"
                      class="flex-1"
                      size="sm"
                      :disabled="index < 2"
                    />
                    <UInput
                      v-model="option.label"
                      placeholder="Label (displayed)"
                      class="flex-1"
                      size="sm"
                      :disabled="index < 2"
                    />
                    <UButton
                      v-if="index >= 2"
                      color="red"
                      variant="ghost"
                      size="xs"
                      icon="i-heroicons-x-mark"
                      @click="removeSexOption(index)"
                    />
                    <div v-else class="w-6" />
                  </div>
                </div>
                <UButton
                  color="gray"
                  variant="outline"
                  size="xs"
                  icon="i-heroicons-plus"
                  class="mt-3"
                  @click="addSexOption()"
                >
                  Add Option
                </UButton>
                <p class="text-xs text-gray-500 mt-2">
                  Male and Female are required. Add additional options for non-binary attendees if needed.
                </p>
              </div>
            </div>
          </div>

          <template #footer>
            <div class="flex justify-end">
              <UButton
                color="primary"
                :loading="isSavingBuiltIn"
                @click="saveBuiltInSettings"
              >
                Save Settings
              </UButton>
            </div>
          </template>
        </UCard>

        <!-- Custom Fields Section Header -->
        <div v-if="isTicketsMode" class="flex items-center gap-2 mb-4">
          <UIcon name="i-heroicons-clipboard-document-list" class="w-5 h-5 text-gray-500" />
          <h3 class="font-medium text-gray-900 dark:text-white">Custom Fields</h3>
        </div>

        <!-- Fields List -->
        <div v-if="fields.length > 0" class="space-y-4">
          <div
            v-for="(field, index) in fields"
            :key="field.id"
            draggable="true"
            @dragstart="handleDragStart(index)"
            @dragend="handleDragEnd"
            @drop.prevent="handleDrop(index)"
            @dragover.prevent
          >
            <UCard :class="{ 'opacity-60': !field.isActive }">
              <div class="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div class="flex items-start gap-3 flex-1">
                  <!-- Drag handle -->
                  <div class="cursor-move text-gray-400 hover:text-gray-600 mt-1">
                    <UIcon name="i-heroicons-bars-3" class="w-5 h-5" />
                  </div>

                  <div class="flex-1">
                    <div class="flex items-center gap-2 mb-2">
                      <span class="text-sm text-gray-500 font-medium">
                        #{{ index + 1 }}
                      </span>
                      <UBadge
                        color="gray"
                        variant="soft"
                        size="xs"
                      >
                        <UIcon :name="getTypeInfo(field.fieldType).icon" class="w-3 h-3 mr-1" />
                        {{ getTypeInfo(field.fieldType).label }}
                      </UBadge>
                      <UBadge
                        v-if="field.isRequired"
                        color="red"
                        variant="soft"
                        size="xs"
                      >
                        Required
                      </UBadge>
                      <UBadge
                        v-if="!field.isActive"
                        color="gray"
                        variant="soft"
                        size="xs"
                      >
                        Disabled
                      </UBadge>
                    </div>

                    <p class="font-medium text-gray-900 dark:text-white">
                      {{ field.label }}
                    </p>

                    <p v-if="field.placeholder" class="text-sm text-gray-500 mt-1">
                      Placeholder: {{ field.placeholder }}
                    </p>

                    <p v-if="field.helpText" class="text-sm text-gray-500 mt-1">
                      Help: {{ field.helpText }}
                    </p>

                    <!-- Show options for select/radio -->
                    <div v-if="field.options && field.options.length > 0" class="mt-2">
                      <p class="text-xs text-gray-500 uppercase tracking-wide mb-1">Options:</p>
                      <div class="flex flex-wrap gap-1">
                        <UBadge
                          v-for="option in field.options"
                          :key="option.value"
                          color="gray"
                          variant="soft"
                          size="xs"
                        >
                          {{ option.label }}
                        </UBadge>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="flex flex-wrap items-center gap-2">
                  <UToggle
                    :model-value="field.isActive"
                    @update:model-value="toggleActive(field)"
                  />
                  <UButton
                    color="gray"
                    variant="outline"
                    size="sm"
                    icon="i-heroicons-pencil"
                    @click="openEditModal(field)"
                  >
                    Edit
                  </UButton>
                  <UButton
                    color="red"
                    variant="outline"
                    size="sm"
                    icon="i-heroicons-trash"
                    @click="openDeleteModal(field)"
                  />
                </div>
              </div>
            </UCard>
          </div>
        </div>

        <!-- Empty State -->
        <UCard v-else-if="isTicketsMode">
          <div class="text-center py-12">
            <UIcon name="i-heroicons-clipboard-document-list" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No registration fields yet</h3>
            <p class="text-gray-500 mb-6">
              Add custom fields to collect information from ticket holders after purchase.
            </p>
            <UButton
              color="primary"
              icon="i-heroicons-plus"
              @click="openAddModal"
            >
              Add First Field
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

    <!-- Add Field Modal -->
    <UModal v-model="showAddModal" :ui="{ width: 'sm:max-w-xl' }">
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <div class="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
              <UIcon name="i-heroicons-plus" class="w-5 h-5 text-primary" />
            </div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Add Registration Field
            </h3>
          </div>
        </template>

        <div class="space-y-4">
          <UFormGroup label="Field Type" required>
            <USelectMenu
              v-model="addForm.fieldType"
              :options="fieldTypes"
              value-attribute="value"
              option-attribute="label"
            >
              <template #option="{ option }">
                <div class="flex items-center gap-2">
                  <UIcon :name="option.icon" class="w-4 h-4 text-gray-500" />
                  <div>
                    <div class="font-medium">{{ option.label }}</div>
                    <div class="text-xs text-gray-500">{{ option.description }}</div>
                  </div>
                </div>
              </template>
            </USelectMenu>
          </UFormGroup>

          <UFormGroup label="Field Label" required>
            <UInput
              v-model="addForm.label"
              placeholder="e.g., Full Name, T-Shirt Size, Dietary Restrictions"
            />
          </UFormGroup>

          <UFormGroup v-if="supportsPlaceholder(addForm.fieldType)" label="Placeholder Text">
            <UInput
              v-model="addForm.placeholder"
              placeholder="e.g., Enter your full name"
            />
          </UFormGroup>

          <UFormGroup label="Help Text">
            <UInput
              v-model="addForm.helpText"
              placeholder="Additional instructions for the attendee"
            />
          </UFormGroup>

          <UFormGroup>
            <UCheckbox
              v-model="addForm.isRequired"
              label="This field is required"
            />
          </UFormGroup>

          <!-- Options for select/radio -->
          <UFormGroup v-if="needsOptions(addForm.fieldType)" label="Options" required>
            <div class="space-y-2">
              <div
                v-for="(option, index) in addForm.options"
                :key="index"
                class="flex items-center gap-2"
              >
                <UInput
                  v-model="option.value"
                  placeholder="Value (stored)"
                  class="flex-1"
                  size="sm"
                />
                <UInput
                  v-model="option.label"
                  placeholder="Label (displayed)"
                  class="flex-1"
                  size="sm"
                />
                <UButton
                  v-if="addForm.options.length > 1"
                  color="red"
                  variant="ghost"
                  size="xs"
                  icon="i-heroicons-x-mark"
                  @click="removeOptionFromAddForm(index)"
                />
              </div>
              <UButton
                color="gray"
                variant="outline"
                size="xs"
                icon="i-heroicons-plus"
                @click="addOptionToAddForm()"
              >
                Add Option
              </UButton>
            </div>
          </UFormGroup>

          <!-- Validation for text/textarea/number -->
          <UFormGroup v-if="supportsValidation(addForm.fieldType)" label="Validation (Optional)">
            <div class="grid grid-cols-2 gap-3">
              <UFormGroup v-if="addForm.fieldType !== 'number'" label="Min Length" size="sm">
                <UInput
                  v-model.number="addForm.validation.minLength"
                  type="number"
                  :min="0"
                  placeholder="0"
                  size="sm"
                />
              </UFormGroup>
              <UFormGroup v-if="addForm.fieldType !== 'number'" label="Max Length" size="sm">
                <UInput
                  v-model.number="addForm.validation.maxLength"
                  type="number"
                  :min="1"
                  placeholder="No limit"
                  size="sm"
                />
              </UFormGroup>
              <UFormGroup v-if="addForm.fieldType === 'number'" label="Min Value" size="sm">
                <UInput
                  v-model.number="addForm.validation.min"
                  type="number"
                  placeholder="No min"
                  size="sm"
                />
              </UFormGroup>
              <UFormGroup v-if="addForm.fieldType === 'number'" label="Max Value" size="sm">
                <UInput
                  v-model.number="addForm.validation.max"
                  type="number"
                  placeholder="No max"
                  size="sm"
                />
              </UFormGroup>
            </div>
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
              :disabled="!addForm.label"
              @click="addField"
            >
              Add Field
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Edit Field Modal -->
    <UModal v-model="showEditModal" :ui="{ width: 'sm:max-w-xl' }">
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <div class="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
              <UIcon name="i-heroicons-pencil-square" class="w-5 h-5 text-primary" />
            </div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Edit Registration Field
            </h3>
          </div>
        </template>

        <div class="space-y-4">
          <UFormGroup label="Field Type" required>
            <USelectMenu
              v-model="editForm.fieldType"
              :options="fieldTypes"
              value-attribute="value"
              option-attribute="label"
            >
              <template #option="{ option }">
                <div class="flex items-center gap-2">
                  <UIcon :name="option.icon" class="w-4 h-4 text-gray-500" />
                  <div>
                    <div class="font-medium">{{ option.label }}</div>
                    <div class="text-xs text-gray-500">{{ option.description }}</div>
                  </div>
                </div>
              </template>
            </USelectMenu>
          </UFormGroup>

          <UFormGroup label="Field Label" required>
            <UInput v-model="editForm.label" />
          </UFormGroup>

          <UFormGroup v-if="supportsPlaceholder(editForm.fieldType)" label="Placeholder Text">
            <UInput v-model="editForm.placeholder" />
          </UFormGroup>

          <UFormGroup label="Help Text">
            <UInput v-model="editForm.helpText" />
          </UFormGroup>

          <UFormGroup>
            <UCheckbox
              v-model="editForm.isRequired"
              label="This field is required"
            />
          </UFormGroup>

          <!-- Options for select/radio -->
          <UFormGroup v-if="needsOptions(editForm.fieldType)" label="Options" required>
            <div class="space-y-2">
              <div
                v-for="(option, index) in editForm.options"
                :key="index"
                class="flex items-center gap-2"
              >
                <UInput
                  v-model="option.value"
                  placeholder="Value"
                  class="flex-1"
                  size="sm"
                />
                <UInput
                  v-model="option.label"
                  placeholder="Label"
                  class="flex-1"
                  size="sm"
                />
                <UButton
                  v-if="editForm.options.length > 1"
                  color="red"
                  variant="ghost"
                  size="xs"
                  icon="i-heroicons-x-mark"
                  @click="removeOptionFromEditForm(index)"
                />
              </div>
              <UButton
                color="gray"
                variant="outline"
                size="xs"
                icon="i-heroicons-plus"
                @click="addOptionToEditForm()"
              >
                Add Option
              </UButton>
            </div>
          </UFormGroup>

          <!-- Validation for text/textarea/number -->
          <UFormGroup v-if="supportsValidation(editForm.fieldType)" label="Validation (Optional)">
            <div class="grid grid-cols-2 gap-3">
              <UFormGroup v-if="editForm.fieldType !== 'number'" label="Min Length" size="sm">
                <UInput
                  v-model.number="editForm.validation.minLength"
                  type="number"
                  :min="0"
                  size="sm"
                />
              </UFormGroup>
              <UFormGroup v-if="editForm.fieldType !== 'number'" label="Max Length" size="sm">
                <UInput
                  v-model.number="editForm.validation.maxLength"
                  type="number"
                  :min="1"
                  size="sm"
                />
              </UFormGroup>
              <UFormGroup v-if="editForm.fieldType === 'number'" label="Min Value" size="sm">
                <UInput
                  v-model.number="editForm.validation.min"
                  type="number"
                  size="sm"
                />
              </UFormGroup>
              <UFormGroup v-if="editForm.fieldType === 'number'" label="Max Value" size="sm">
                <UInput
                  v-model.number="editForm.validation.max"
                  type="number"
                  size="sm"
                />
              </UFormGroup>
            </div>
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
              :disabled="!editForm.label"
              @click="updateField"
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
              Delete Registration Field
            </h3>
          </div>
        </template>

        <div v-if="deletingField" class="space-y-4">
          <p class="text-gray-600 dark:text-gray-400">
            Are you sure you want to delete this registration field?
          </p>
          <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div class="flex items-center gap-2">
              <UIcon :name="getTypeInfo(deletingField.fieldType).icon" class="w-4 h-4 text-gray-500" />
              <p class="font-medium text-gray-900 dark:text-white">
                {{ deletingField.label }}
              </p>
            </div>
          </div>
          <UAlert
            color="blue"
            icon="i-heroicons-information-circle"
            class="text-sm"
          >
            <template #description>
              If this field has submitted data, you won't be able to delete it.
              Use the toggle to disable it instead - this hides it from future registrations while preserving existing data.
            </template>
          </UAlert>
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
              @click="deleteField"
            >
              Delete
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
