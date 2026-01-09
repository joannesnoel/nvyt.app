<script setup lang="ts">
import type { LocationDetails } from '@nvyt/shared'

interface Props {
  modelValue?: string
  locationDetails?: LocationDetails
  placeholder?: string
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  placeholder: 'Search for a location...',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:locationDetails': [value: LocationDetails | undefined]
}>()

const config = useRuntimeConfig()
const inputRef = ref<HTMLInputElement | null>()
const autocomplete = ref<google.maps.places.Autocomplete | null>(null)
const isLoaded = ref(false)
const isOnline = ref(false)

const localValue = ref(props.modelValue)

// Sync with parent
watch(() => props.modelValue, (newVal) => {
  localValue.value = newVal
})

// Load Google Maps script
async function loadGoogleMaps(): Promise<void> {
  if (window.google?.maps?.places) {
    isLoaded.value = true
    return
  }

  const apiKey = config.public.googleMapsApiKey
  if (!apiKey) {
    console.warn('Google Maps API key not configured')
    return
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`
    script.async = true
    script.defer = true
    script.onload = () => {
      isLoaded.value = true
      resolve()
    }
    script.onerror = reject
    document.head.appendChild(script)
  })
}

// Initialize autocomplete
function initAutocomplete() {
  if (!inputRef.value || !window.google?.maps?.places) return

  autocomplete.value = new google.maps.places.Autocomplete(inputRef.value, {
    types: ['establishment', 'geocode'],
    fields: ['name', 'formatted_address', 'geometry', 'address_components', 'place_id'],
  })

  autocomplete.value.addListener('place_changed', handlePlaceSelect)
}

function handlePlaceSelect() {
  const place = autocomplete.value?.getPlace()
  if (!place) return

  // Build display value
  const displayValue = place.name && place.formatted_address
    ? `${place.name}, ${place.formatted_address}`
    : place.formatted_address || place.name || ''

  localValue.value = displayValue
  emit('update:modelValue', displayValue)

  // Extract location details
  const locationDetails: LocationDetails = {
    type: isOnline.value ? 'online' : 'physical',
    address: place.formatted_address,
  }

  // Extract city and country from address components
  if (place.address_components) {
    for (const component of place.address_components) {
      if (component.types.includes('locality')) {
        locationDetails.city = component.long_name
      }
      if (component.types.includes('country')) {
        locationDetails.country = component.long_name
      }
    }
  }

  // Add coordinates
  if (place.geometry?.location) {
    locationDetails.coordinates = {
      lat: place.geometry.location.lat(),
      lng: place.geometry.location.lng(),
    }
  }

  emit('update:locationDetails', locationDetails)
}

function handleInput(event: Event) {
  const value = (event.target as HTMLInputElement).value
  localValue.value = value
  emit('update:modelValue', value)

  // Clear location details when typing manually
  if (!value) {
    emit('update:locationDetails', undefined)
  }
}

function toggleOnline() {
  isOnline.value = !isOnline.value
  if (isOnline.value) {
    localValue.value = ''
    emit('update:modelValue', '')
    emit('update:locationDetails', {
      type: 'online',
    })
  } else {
    emit('update:locationDetails', undefined)
  }
}

function setInputRef(el: any) {
  // Handle Nuxt UI UInput component - get the actual input element
  if (el?.$el) {
    inputRef.value = el.$el.querySelector('input')
  } else {
    inputRef.value = el
  }
}

onMounted(async () => {
  await loadGoogleMaps()
  await nextTick()
  initAutocomplete()
})

// Re-initialize if input ref changes
watch(inputRef, () => {
  if (isLoaded.value && inputRef.value) {
    initAutocomplete()
  }
})
</script>

<template>
  <div class="space-y-2">
    <div class="flex gap-2">
      <UInput
        :ref="setInputRef"
        :model-value="localValue"
        :placeholder="isOnline ? 'Add meeting URL (optional)' : placeholder"
        :icon="isOnline ? 'i-heroicons-video-camera' : 'i-heroicons-map-pin'"
        :disabled="isOnline && !localValue.includes('http')"
        class="flex-1"
        autocomplete="off"
        @input="handleInput"
      />
      <UButton
        :color="isOnline ? 'primary' : 'gray'"
        :variant="isOnline ? 'solid' : 'outline'"
        icon="i-heroicons-video-camera"
        @click="toggleOnline"
      >
        Online
      </UButton>
    </div>
    <p v-if="!isLoaded && !isOnline" class="text-xs text-gray-500">
      Loading location search...
    </p>
    <p v-if="isOnline" class="text-xs text-gray-500">
      This is an online event. You can optionally add a meeting URL.
    </p>
  </div>
</template>
