<script setup lang="ts">
import { createEventSchema, type CreateEventInput, type LocationDetails } from '@nvyt/shared'

definePageMeta({
  layout: 'dashboard',
})

const form = reactive<Partial<CreateEventInput>>({
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

const loading = ref(false)
const error = ref('')
const errorAlert = ref<HTMLElement | null>(null)
const toast = useToast()

// Scroll to error alert when error occurs
function scrollToError() {
  nextTick(() => {
    errorAlert.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
}

// Convert datetime-local string to ISO string preserving local time intent
function toISOString(datetimeLocal: string): string {
  if (!datetimeLocal) return ''
  // datetime-local gives us "YYYY-MM-DDTHH:mm" without timezone
  // new Date() in browser interprets this as local time
  // toISOString() converts to UTC ISO format
  return new Date(datetimeLocal).toISOString()
}

async function handleSubmit() {
  // Validate
  const result = createEventSchema.safeParse(form)
  if (!result.success) {
    error.value = result.error.errors[0]?.message || 'Validation failed'
    scrollToError()
    return
  }

  loading.value = true
  error.value = ''

  try {
    // Convert dates to ISO strings to preserve timezone
    const payload = {
      ...form,
      startDate: toISOString(form.startDate || ''),
      endDate: form.endDate ? toISOString(form.endDate) : undefined,
    }

    const response = await $fetch('/api/v1/events', {
      method: 'POST',
      body: payload,
    })

    if (response.success && response.data) {
      if (form.registrationMode === 'tickets') {
        // Ticket-based events need ticket types first
        toast.add({
          title: 'Event created!',
          description: 'Now add ticket types for your event.',
          color: 'green',
        })
        await navigateTo(`/dashboard/events/${response.data.id}/tickets`)
      } else {
        // Other events go to preview for customization
        toast.add({
          title: 'Event created!',
          description: 'Customize how your event page looks.',
          color: 'green',
        })
        await navigateTo(`/dashboard/events/${response.data.id}/preview`)
      }
    }
  } catch (e: any) {
    error.value = e.data?.message || 'Failed to create event'
    scrollToError()
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="py-12">
    <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="mb-8">
        <NuxtLink to="/dashboard" class="text-gray-600 dark:text-gray-400 hover:text-primary flex items-center gap-1 mb-4">
          <UIcon name="i-heroicons-arrow-left" class="w-4 h-4" />
          Back to Dashboard
        </NuxtLink>
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
          Create Event
        </h1>
      </div>

      <UCard>
        <form @submit.prevent="handleSubmit" class="space-y-6">
          <div v-if="error" ref="errorAlert">
            <UAlert color="red" :title="error" />
          </div>

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
              <RichTextEditor
                v-model="form.description"
                placeholder="Tell people about your event..."
                :max-length="5000"
              />
            </UFormGroup>

            <UFormGroup label="Visibility" name="visibility">
              <URadioGroup
                v-model="form.visibility"
                :options="[
                  { value: 'public', label: 'Public - Anyone can find and join' },
                  { value: 'private', label: 'Private - Invite only' },
                ]"
              />
            </UFormGroup>

            <UFormGroup label="Thumbnail Image" name="thumbnailImage" hint="Optional - displayed on event cards">
              <ImageUpload
                v-model="form.thumbnailImage"
                folder="events"
                placeholder="Click or drag to upload a thumbnail image"
                cropper-title="Adjust Thumbnail"
                :aspect-ratio="16 / 9"
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

          <!-- Contact & Social -->
          <div class="space-y-4">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white">
              Contact & Social
            </h3>

            <div class="grid md:grid-cols-2 gap-4">
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

            <div class="grid md:grid-cols-3 gap-4">
              <UFormGroup label="Facebook" name="facebookUrl" hint="Optional">
                <UInput
                  v-model="form.facebookUrl"
                  placeholder="Facebook URL or username"
                />
              </UFormGroup>

              <UFormGroup label="Instagram" name="instagramUrl" hint="Optional">
                <UInput
                  v-model="form.instagramUrl"
                  placeholder="Instagram URL or username"
                />
              </UFormGroup>

              <UFormGroup label="X.com" name="xUrl" hint="Optional">
                <UInput
                  v-model="form.xUrl"
                  placeholder="X URL or username"
                />
              </UFormGroup>
            </div>
          </div>

          <UDivider />

          <!-- Settings -->
          <div class="space-y-4">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white">
              Settings
            </h3>

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

            <!-- Capacity (for RSVP and Tickets modes) -->
            <template v-if="form.registrationMode === 'rsvp' || form.registrationMode === 'tickets'">
              <UFormGroup label="Capacity" name="maxAttendees" hint="Leave empty for unlimited">
                <UInput
                  v-model.number="form.maxAttendees"
                  type="number"
                  placeholder="Maximum attendees"
                  min="1"
                />
              </UFormGroup>
            </template>

            <!-- RSVP-specific options -->
            <template v-if="form.registrationMode === 'rsvp'">
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
                title="Ticket types"
                description="You can add ticket types (free or paid) after creating the event."
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
            <UButton to="/dashboard" color="gray" variant="ghost">
              Cancel
            </UButton>
            <UButton
              type="submit"
              color="primary"
              :loading="loading"
            >
              Create Event
            </UButton>
          </div>
        </form>
      </UCard>
    </div>
  </div>
</template>
