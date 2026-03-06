<script setup lang="ts">
import { updateEventSchema, type UpdateEventInput, type LocationDetails } from '@nvyt/shared'

definePageMeta({
  layout: 'dashboard',
})

const route = useRoute()
const eventId = computed(() => route.params.id as string)
const toast = useToast()

// Fetch existing event data
const { data: eventResponse, pending: loading } = await useFetch(
  () => `/api/v1/events/by-id/${eventId.value}`,
  { watch: [eventId] }
)

const event = computed(() => eventResponse.value?.data)
useHead(() => ({ title: event.value?.title ? `Edit ${event.value.title} - NVYT` : 'NVYT' }))

// Fetch requirements (for tickets mode)
const { data: requirementsResponse, refresh: refreshRequirements } = await useFetch(
  () => `/api/v1/events/${eventId.value}/requirements`,
  { watch: [eventId] }
)
const requirements = computed(() => requirementsResponse.value?.data ?? [])

// Form state - initialized from event data
const form = reactive<Partial<UpdateEventInput>>({
  title: '',
  description: '',
  thumbnailImage: '',
  organizationName: '',
  startDate: '',
  endDate: '',
  location: '',
  locationDetails: undefined,
  visibility: 'public',
  registrationMode: 'rsvp',
  maxAttendees: undefined,
  requiresApproval: false,
  contributionsEnabled: false,
  phone: '',
  email: '',
  website: '',
  facebookUrl: '',
  instagramUrl: '',
  xUrl: '',
})

const registrationModeOptions = [
  {
    value: 'rsvp',
    label: 'RSVP',
    description: 'Free event with optional approval and waitlist. Best for small gatherings and meetups.',
  },
  {
    value: 'tickets',
    label: 'Tickets',
    description: 'Registration via tickets (free or paid). Best for conferences, workshops, and large events.',
  },
  {
    value: 'open',
    label: 'Open',
    description: 'No registration needed - just show up. Best for casual public events.',
  },
]


function updateLocationDetails(details: LocationDetails | undefined) {
  form.locationDetails = details
}

// Watch for event data and populate form
watch(event, (newEvent) => {
  if (newEvent) {
    form.title = newEvent.title || ''
    form.description = newEvent.description || ''
    form.thumbnailImage = newEvent.thumbnailImage || ''
    form.organizationName = newEvent.organizationName || ''
    form.startDate = formatDateTimeLocal(newEvent.startDate)
    form.endDate = newEvent.endDate ? formatDateTimeLocal(newEvent.endDate) : ''
    form.location = newEvent.location || ''
    form.locationDetails = newEvent.locationDetails || undefined
    form.visibility = newEvent.visibility || 'public'
    form.registrationMode = newEvent.registrationMode || 'rsvp'
    form.maxAttendees = newEvent.maxAttendees || undefined
    form.requiresApproval = newEvent.requiresApproval || false
    form.contributionsEnabled = newEvent.contributionsEnabled || false
    form.phone = newEvent.phone || ''
    form.email = newEvent.email || ''
    form.website = newEvent.website || ''
    form.facebookUrl = newEvent.facebookUrl || ''
    form.instagramUrl = newEvent.instagramUrl || ''
    form.xUrl = newEvent.xUrl || ''
  }
}, { immediate: true })

function formatDateTimeLocal(dateStr: string) {
  const date = new Date(dateStr)
  // Format as YYYY-MM-DDTHH:mm for datetime-local input
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
  // datetime-local gives us "YYYY-MM-DDTHH:mm" without timezone
  // new Date() in browser interprets this as local time
  // toISOString() converts to UTC ISO format
  return new Date(datetimeLocal).toISOString()
}

const saving = ref(false)
const error = ref('')
const errorAlert = ref<HTMLElement | null>(null)

// Scroll to error alert when error occurs
function scrollToError() {
  nextTick(() => {
    errorAlert.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
}

// Requirements state and functions
const showRequirementModal = ref(false)
const editingRequirement = ref<any>(null)
const requirementForm = ref({
  text: '',
})
const savingRequirement = ref(false)

function openAddRequirementModal() {
  editingRequirement.value = null
  requirementForm.value = { text: '' }
  showRequirementModal.value = true
}

function openEditRequirementModal(requirement: any) {
  editingRequirement.value = requirement
  requirementForm.value = { text: requirement.text }
  showRequirementModal.value = true
}

async function saveRequirement() {
  if (!requirementForm.value.text) return

  savingRequirement.value = true
  try {
    const body = {
      type: 'checkbox' as const,
      text: requirementForm.value.text,
    }

    if (editingRequirement.value) {
      await $fetch(`/api/v1/events/${eventId.value}/requirements/${editingRequirement.value.id}`, {
        method: 'PATCH',
        body,
      })
      toast.add({ title: 'Requirement Updated', color: 'green' })
    } else {
      await $fetch(`/api/v1/events/${eventId.value}/requirements`, {
        method: 'POST',
        body,
      })
      toast.add({ title: 'Requirement Added', color: 'green' })
    }
    showRequirementModal.value = false
    await refreshRequirements()
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to save requirement',
      color: 'red',
    })
  } finally {
    savingRequirement.value = false
  }
}

async function toggleRequirementActive(requirement: any) {
  try {
    await $fetch(`/api/v1/events/${eventId.value}/requirements/${requirement.id}`, {
      method: 'PATCH',
      body: { isActive: !requirement.isActive },
    })
    await refreshRequirements()
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to update requirement',
      color: 'red',
    })
  }
}

async function deleteRequirement(requirement: any) {
  if (!confirm('Are you sure you want to delete this requirement?')) return

  try {
    await $fetch(`/api/v1/events/${eventId.value}/requirements/${requirement.id}`, {
      method: 'DELETE',
    })
    toast.add({ title: 'Requirement Deleted', color: 'green' })
    await refreshRequirements()
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to delete requirement',
      color: 'red',
    })
  }
}

async function handleSubmit() {
  // Validate
  const result = updateEventSchema.safeParse(form)
  if (!result.success) {
    error.value = result.error.errors[0]?.message || 'Validation failed'
    scrollToError()
    return
  }

  saving.value = true
  error.value = ''

  try {
    // Convert dates to ISO strings to preserve timezone
    const payload = {
      ...form,
      startDate: form.startDate ? toISOString(form.startDate) : undefined,
      endDate: form.endDate ? toISOString(form.endDate) : undefined,
    }

    await $fetch(`/api/v1/events/${eventId.value}`, {
      method: 'PATCH',
      body: payload,
    })

    toast.add({
      title: 'Event Updated',
      description: 'Your changes have been saved.',
      color: 'green',
    })

    await navigateTo(`/dashboard/events/${eventId.value}`)
  } catch (e: any) {
    error.value = e.data?.message || 'Failed to update event'
    scrollToError()
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="sm:py-8">
    <div class="px-4 sm:px-6 lg:px-8">
      <!-- Loading -->
      <div v-if="loading" class="space-y-4">
        <USkeleton class="h-8 w-1/3" />
        <USkeleton class="h-4 w-1/4" />
        <USkeleton class="h-64 w-full" />
      </div>

      <!-- Not Found -->
      <div v-else-if="!event" class="text-center py-20">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">Event Not Found</h1>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          This event doesn't exist or you don't have access to it.
        </p>
        <UButton to="/dashboard" color="primary">Back to Dashboard</UButton>
      </div>

      <!-- Edit Form -->
      <div v-else>
        <div class="mb-8">
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
            Event Info
          </h1>
          <p class="text-gray-600 dark:text-gray-400 mt-1">
            Update your event details
          </p>
        </div>

        <form @submit.prevent="handleSubmit">
          <div v-if="error" ref="errorAlert" class="mb-6">
            <UAlert color="red" :title="error" />
          </div>

          <!-- 2-Column Layout -->
          <div class="grid lg:grid-cols-3 gap-6">
            <!-- Left Column - Main Content -->
            <div class="lg:col-span-2 space-y-6">
              <!-- Basic Info -->
              <UCard>
                <template #header>
                  <h3 class="font-semibold text-gray-900 dark:text-white">
                    Basic Information
                  </h3>
                </template>

                <div class="space-y-4">
                  <UFormGroup label="Event Title" name="title" required>
                    <UInput
                      v-model="form.title"
                      placeholder="Give your event a name"
                      size="lg"
                    />
                  </UFormGroup>

                  <UFormGroup label="Description" name="description">
                    <RichTextEditor
                      v-model="form.description"
                      placeholder="Tell people about your event..."
                      :max-length="5000"
                    />
                  </UFormGroup>

                  <UFormGroup label="Organization Name" name="organizationName" hint="Optional - overrides your name as organizer">
                    <UInput
                      v-model="form.organizationName"
                      placeholder="e.g., Tech Meetup PH, Company Name"
                      icon="i-heroicons-building-office"
                    />
                  </UFormGroup>
                </div>
              </UCard>

              <!-- Date, Time & Location -->
              <UCard>
                <template #header>
                  <h3 class="font-semibold text-gray-900 dark:text-white">
                    Date, Time & Location
                  </h3>
                </template>

                <div class="space-y-4">
                  <div class="grid sm:grid-cols-2 gap-4">
                    <UFormGroup label="Start Date & Time" name="startDate" required>
                      <UInput
                        v-model="form.startDate"
                        type="datetime-local"
                      />
                    </UFormGroup>

                    <UFormGroup label="End Date & Time" name="endDate">
                      <UInput
                        v-model="form.endDate"
                        type="datetime-local"
                      />
                    </UFormGroup>
                  </div>

                  <UFormGroup label="Location" name="location">
                    <LocationAutocomplete
                      v-model="form.location"
                      :location-details="form.locationDetails"
                      placeholder="Search for a venue or address..."
                      @update:location-details="updateLocationDetails"
                    />
                  </UFormGroup>
                </div>
              </UCard>

              <!-- Contact & Social -->
              <UCard>
                <template #header>
                  <h3 class="font-semibold text-gray-900 dark:text-white">
                    Contact & Social
                  </h3>
                </template>

                <div class="space-y-4">
                  <div class="grid sm:grid-cols-2 gap-4">
                    <UFormGroup label="Phone" name="phone" required>
                      <UInput
                        v-model="form.phone"
                        placeholder="e.g., +63 912 345 6789"
                        icon="i-heroicons-phone"
                      />
                    </UFormGroup>

                    <UFormGroup label="Email" name="email" required>
                      <UInput
                        v-model="form.email"
                        type="email"
                        placeholder="e.g., hello@example.com"
                        icon="i-heroicons-envelope"
                      />
                    </UFormGroup>
                  </div>

                  <UFormGroup label="Website" name="website" hint="Optional">
                    <UInput
                      v-model="form.website"
                      type="url"
                      placeholder="https://example.com"
                      icon="i-heroicons-globe-alt"
                    />
                  </UFormGroup>

                  <div class="grid sm:grid-cols-3 gap-4">
                    <UFormGroup label="Facebook" name="facebookUrl">
                      <UInput
                        v-model="form.facebookUrl"
                        placeholder="URL or username"
                      />
                    </UFormGroup>

                    <UFormGroup label="Instagram" name="instagramUrl">
                      <UInput
                        v-model="form.instagramUrl"
                        placeholder="URL or username"
                      />
                    </UFormGroup>

                    <UFormGroup label="X.com" name="xUrl">
                      <UInput
                        v-model="form.xUrl"
                        placeholder="URL or username"
                      />
                    </UFormGroup>
                  </div>
                </div>
              </UCard>

              <!-- Settings -->
              <UCard>
                <template #header>
                  <h3 class="font-semibold text-gray-900 dark:text-white">
                    Registration Settings
                  </h3>
                </template>

                <div class="space-y-4">
                  <UFormGroup label="Registration Mode" name="registrationMode">
                    <div class="grid sm:grid-cols-3 gap-3">
                      <div
                        v-for="option in registrationModeOptions"
                        :key="option.value"
                        class="relative flex flex-col p-4 border rounded-lg cursor-pointer transition-colors"
                        :class="form.registrationMode === option.value
                          ? 'border-primary bg-primary-50 dark:bg-primary-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'"
                        @click="form.registrationMode = option.value as 'rsvp' | 'tickets' | 'open'"
                      >
                        <div class="flex items-center gap-2 mb-1">
                          <input
                            type="radio"
                            :checked="form.registrationMode === option.value"
                            class="h-4 w-4 text-primary border-gray-300 focus:ring-primary"
                          >
                          <span class="text-sm font-medium text-gray-900 dark:text-white">
                            {{ option.label }}
                          </span>
                        </div>
                        <span class="text-xs text-gray-500 leading-tight">
                          {{ option.description }}
                        </span>
                      </div>
                    </div>
                  </UFormGroup>

                  <!-- Capacity (for RSVP and Tickets modes) -->
                  <div v-if="form.registrationMode === 'rsvp' || form.registrationMode === 'tickets'" class="grid sm:grid-cols-2 gap-4">
                    <UFormGroup label="Capacity" name="maxAttendees" hint="Leave empty for unlimited">
                      <UInput
                        v-model.number="form.maxAttendees"
                        type="number"
                        placeholder="Maximum attendees"
                        min="1"
                      />
                    </UFormGroup>
                  </div>

                  <!-- RSVP-specific options -->
                  <template v-if="form.registrationMode === 'rsvp'">
                    <div class="flex flex-wrap gap-6">
                      <UCheckbox
                        v-model="form.requiresApproval"
                        label="Require approval"
                        help="Manually approve each RSVP before confirming"
                      />
                      <UCheckbox
                        v-model="form.contributionsEnabled"
                        label="Enable contribution list"
                        help="Let attendees sign up to bring items"
                      />
                    </div>
                  </template>

                  <!-- Tickets-specific options -->
                  <template v-if="form.registrationMode === 'tickets'">
                    <UAlert
                      color="blue"
                      icon="i-heroicons-information-circle"
                      title="Manage ticket types"
                      description="Go to the Tickets tab to add or edit ticket types for this event."
                    />

                    <!-- Purchase Requirements -->
                    <div class="space-y-3">
                      <div class="flex items-center justify-between">
                        <div>
                          <h4 class="text-sm font-medium text-gray-900 dark:text-white">Purchase Requirements</h4>
                          <p class="text-xs text-gray-500">Terms attendees must agree to before checkout</p>
                        </div>
                        <UButton
                          size="xs"
                          color="gray"
                          variant="outline"
                          icon="i-heroicons-plus"
                          @click="openAddRequirementModal"
                        >
                          Add
                        </UButton>
                      </div>

                      <div v-if="requirements.length > 0" class="space-y-2">
                        <div
                          v-for="requirement in requirements"
                          :key="requirement.id"
                          class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                          :class="{ 'opacity-50': !requirement.isActive }"
                        >
                          <UIcon name="i-heroicons-check-circle" class="w-5 h-5 text-primary flex-shrink-0" />
                          <p class="flex-1 text-sm text-gray-900 dark:text-white">
                            {{ requirement.text }}
                          </p>
                          <div class="flex items-center gap-1">
                            <UToggle
                              :model-value="requirement.isActive"
                              size="xs"
                              @update:model-value="toggleRequirementActive(requirement)"
                            />
                            <UButton
                              size="xs"
                              color="gray"
                              variant="ghost"
                              icon="i-heroicons-pencil"
                              @click="openEditRequirementModal(requirement)"
                            />
                            <UButton
                              size="xs"
                              color="red"
                              variant="ghost"
                              icon="i-heroicons-trash"
                              @click="deleteRequirement(requirement)"
                            />
                          </div>
                        </div>
                      </div>

                      <p v-else class="text-sm text-gray-500 italic">
                        No requirements yet. Add terms or agreements that buyers must accept.
                      </p>
                    </div>
                  </template>

                  <!-- Open mode info -->
                  <template v-if="form.registrationMode === 'open'">
                    <UAlert
                      color="yellow"
                      icon="i-heroicons-exclamation-triangle"
                      title="No registration"
                      description="Attendees won't need to register. You won't be able to track who's coming or send them notifications."
                    />
                  </template>
                </div>
              </UCard>
            </div>

            <!-- Right Column - Sidebar (Sticky) -->
            <div class="space-y-6 lg:sticky lg:top-20 lg:self-start">
              <!-- Thumbnail -->
              <UCard>
                <template #header>
                  <h3 class="font-semibold text-gray-900 dark:text-white">
                    Thumbnail
                  </h3>
                </template>

                <UFormGroup name="thumbnailImage" hint="Displayed on event cards">
                  <ImageUpload
                    v-model="form.thumbnailImage"
                    folder="events"
                    placeholder="Click or drag to upload"
                    cropper-title="Adjust Thumbnail"
                    :aspect-ratio="16 / 9"
                    :max-width="737"
                    :max-height="414"
                  />
                </UFormGroup>
              </UCard>

              <!-- Visibility -->
              <UCard>
                <template #header>
                  <h3 class="font-semibold text-gray-900 dark:text-white">
                    Visibility
                  </h3>
                </template>

                <URadioGroup
                  v-model="form.visibility"
                  :options="[
                    { value: 'public', label: 'Public', description: 'Anyone can find and join' },
                    { value: 'private', label: 'Private', description: 'Invite only' },
                  ]"
                />
              </UCard>

              <!-- Actions -->
              <UCard>
                <div class="flex flex-col gap-3">
                  <UButton
                    type="submit"
                    color="primary"
                    :loading="saving"
                    block
                  >
                    Save Changes
                  </UButton>
                  <UButton
                    :to="`/dashboard/events/${eventId}`"
                    color="gray"
                    variant="ghost"
                    block
                  >
                    Cancel
                  </UButton>
                </div>
              </UCard>
            </div>
          </div>
        </form>
      </div>
    </div>

    <!-- Requirement Modal -->
    <UModal v-model="showRequirementModal">
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <div class="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
              <UIcon :name="editingRequirement ? 'i-heroicons-pencil-square' : 'i-heroicons-plus'" class="w-5 h-5 text-primary" />
            </div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              {{ editingRequirement ? 'Edit Requirement' : 'Add Requirement' }}
            </h3>
          </div>
        </template>

        <div class="space-y-4">
          <UFormGroup label="Requirement Text" required hint="Buyers must check a box to agree to this">
            <UTextarea
              v-model="requirementForm.text"
              placeholder="e.g., I agree to the event terms and conditions"
              :rows="2"
            />
          </UFormGroup>

          <div class="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <UCheckbox disabled :model-value="false" />
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {{ requirementForm.text || 'Preview will appear here...' }}
            </p>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton color="gray" variant="outline" @click="showRequirementModal = false">
              Cancel
            </UButton>
            <UButton
              color="primary"
              :loading="savingRequirement"
              :disabled="!requirementForm.text"
              @click="saveRequirement"
            >
              {{ editingRequirement ? 'Save Changes' : 'Add Requirement' }}
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
