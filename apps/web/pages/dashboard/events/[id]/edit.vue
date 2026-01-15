<script setup lang="ts">
import { updateEventSchema, type UpdateEventInput, type LocationDetails } from '@nvyt/shared'

definePageMeta({
  layout: 'default',
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

// Form state - initialized from event data
const form = reactive<Partial<UpdateEventInput>>({
  title: '',
  description: '',
  coverImage: '',
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
    form.coverImage = newEvent.coverImage || ''
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

async function handleSubmit() {
  // Validate
  const result = updateEventSchema.safeParse(form)
  if (!result.success) {
    error.value = result.error.errors[0]?.message || 'Validation failed'
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
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="py-12">
    <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
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
          <NuxtLink
            :to="`/dashboard/events/${eventId}`"
            class="text-gray-600 dark:text-gray-400 hover:text-primary flex items-center gap-1 mb-4"
          >
            <UIcon name="i-heroicons-arrow-left" class="w-4 h-4" />
            Back to Event
          </NuxtLink>
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
            Edit Event
          </h1>
          <p class="text-gray-600 dark:text-gray-400 mt-1">
            {{ event.title }}
          </p>
        </div>

        <UCard>
          <form @submit.prevent="handleSubmit" class="space-y-6">
            <UAlert v-if="error" color="red" :title="error" />

            <!-- Basic Info -->
            <div class="space-y-4">
              <h3 class="text-lg font-medium text-gray-900 dark:text-white">
                Basic Information
              </h3>

              <UFormGroup label="Event Title" name="title" required>
                <UInput
                  v-model="form.title"
                  placeholder="Give your event a name"
                  size="lg"
                />
              </UFormGroup>

              <UFormGroup label="Description" name="description">
                <UTextarea
                  v-model="form.description"
                  placeholder="Tell people about your event..."
                  :rows="4"
                />
              </UFormGroup>

              <UFormGroup label="Cover Image" name="coverImage">
                <ImageUpload
                  v-model="form.coverImage"
                  folder="events"
                  placeholder="Click or drag to upload a cover image"
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

            <UDivider />

            <!-- Date & Time -->
            <div class="space-y-4">
              <h3 class="text-lg font-medium text-gray-900 dark:text-white">
                Date & Time
              </h3>

              <div class="grid md:grid-cols-2 gap-4">
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
            </div>

            <UDivider />

            <!-- Location -->
            <div class="space-y-4">
              <h3 class="text-lg font-medium text-gray-900 dark:text-white">
                Location
              </h3>

              <UFormGroup label="Location" name="location">
                <LocationAutocomplete
                  v-model="form.location"
                  :location-details="form.locationDetails"
                  placeholder="Search for a venue or address..."
                  @update:location-details="updateLocationDetails"
                />
              </UFormGroup>
            </div>

            <UDivider />

            <!-- Settings -->
            <div class="space-y-4">
              <h3 class="text-lg font-medium text-gray-900 dark:text-white">
                Settings
              </h3>

              <UFormGroup label="Visibility" name="visibility">
                <URadioGroup
                  v-model="form.visibility"
                  :options="[
                    { value: 'public', label: 'Public - Anyone can find and join' },
                    { value: 'private', label: 'Private - Invite only' },
                  ]"
                />
              </UFormGroup>

              <UFormGroup label="Registration Mode" name="registrationMode">
                <div class="space-y-3">
                  <div
                    v-for="option in registrationModeOptions"
                    :key="option.value"
                    class="relative flex items-start p-4 border rounded-lg cursor-pointer transition-colors"
                    :class="form.registrationMode === option.value
                      ? 'border-primary bg-primary-50 dark:bg-primary-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'"
                    @click="form.registrationMode = option.value as 'rsvp' | 'tickets' | 'open'"
                  >
                    <div class="flex items-center h-5">
                      <input
                        type="radio"
                        :checked="form.registrationMode === option.value"
                        class="h-4 w-4 text-primary border-gray-300 focus:ring-primary"
                      >
                    </div>
                    <div class="ml-3">
                      <span class="block text-sm font-medium text-gray-900 dark:text-white">
                        {{ option.label }}
                      </span>
                      <span class="block text-sm text-gray-500">
                        {{ option.description }}
                      </span>
                    </div>
                  </div>
                </div>
              </UFormGroup>

              <!-- RSVP-specific options -->
              <template v-if="form.registrationMode === 'rsvp'">
                <UFormGroup label="Capacity" name="maxAttendees" hint="Leave empty for unlimited">
                  <UInput
                    v-model.number="form.maxAttendees"
                    type="number"
                    placeholder="Maximum attendees"
                    min="1"
                  />
                </UFormGroup>

                <UCheckbox
                  v-model="form.requiresApproval"
                  label="Require approval"
                  help="Manually approve each RSVP before confirming"
                />
              </template>

              <!-- Tickets-specific options -->
              <template v-if="form.registrationMode === 'tickets'">
                <UAlert
                  color="blue"
                  icon="i-heroicons-information-circle"
                  title="Manage ticket types"
                  description="Go to the Tickets tab to add or edit ticket types for this event."
                />
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

              <UCheckbox
                v-if="form.registrationMode === 'rsvp'"
                v-model="form.contributionsEnabled"
                label="Enable contribution list"
                help="Let attendees sign up to bring items"
              />
            </div>

            <UDivider />

            <div class="flex justify-end gap-3">
              <UButton
                :to="`/dashboard/events/${eventId}`"
                color="gray"
                variant="ghost"
              >
                Cancel
              </UButton>
              <UButton
                type="submit"
                color="primary"
                :loading="saving"
              >
                Save Changes
              </UButton>
            </div>
          </form>
        </UCard>
      </div>
    </div>
  </div>
</template>
