<script setup lang="ts">
import type { AddressData } from '@nvyt/shared'

interface Props {
  modelValue?: AddressData | null
  placeholder?: string
  required?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Enter your address...',
  required: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: AddressData | null]
}>()

// Flag to skip watchers during initialization/restoration
const isRestoring = ref(false)

// Field values
const country = ref(props.modelValue?.country || 'Philippines')
const province = ref(props.modelValue?.province || '')
const city = ref(props.modelValue?.city || '')
const barangay = ref(props.modelValue?.barangay || '')
const street = ref(props.modelValue?.street || '')

// Dropdown options
const provinceList = ref<Array<{ id: number; name: string; regionName: string }>>([])
const cityList = ref<Array<{ id: number; name: string; provinceName: string; isCity: boolean }>>([])
const barangayList = ref<Array<{ id: number; code: string; name: string; cityMunName: string }>>([])

// Loading states
const loadingProvinces = ref(false)
const loadingCities = ref(false)
const loadingBarangays = ref(false)

// Check if Philippines is selected (to use PSGC dropdowns)
const isPhilippines = computed(() => country.value === 'Philippines')

// Country options
const countryOptions = ['Philippines', 'Japan', 'Singapore', 'United States', 'Other']

// Computed options for dropdowns
const provinceOptions = computed(() => provinceList.value.map((p) => p.name))
const cityOptions = computed(() => cityList.value.map((c) => ({
  label: c.isCity ? `${c.name} City` : c.name,
  value: c.name,
})))
const barangayOptions = computed(() => barangayList.value.map((b) => b.name))

// Sync with parent model
watch(() => props.modelValue, async (newVal) => {
  if (newVal) {
    // Set flag to prevent watchers from clearing dependent fields
    isRestoring.value = true

    country.value = newVal.country || 'Philippines'
    province.value = newVal.province || ''
    city.value = newVal.city || ''
    barangay.value = newVal.barangay || ''
    street.value = newVal.street || ''

    // Wait for next tick then re-enable watchers
    await nextTick()
    isRestoring.value = false
  }
}, { deep: true })

// Emit changes
function emitUpdate() {
  const addressData: AddressData = {
    formattedAddress: buildFormattedAddress(),
    country: country.value,
    province: province.value || undefined,
    city: city.value || undefined,
    barangay: barangay.value || undefined,
    street: street.value || undefined,
  }
  emit('update:modelValue', addressData)
}

function buildFormattedAddress(): string {
  const parts = [street.value, barangay.value, city.value, province.value, country.value]
    .filter(Boolean)
  return parts.join(', ')
}

// Fetch provinces from API
async function fetchProvinces() {
  loadingProvinces.value = true
  try {
    const response = await $fetch<{ data: { provinces: Array<{ id: number; name: string; regionName: string }> } }>('/api/v1/psgc/provinces')
    if (response?.data?.provinces) {
      provinceList.value = response.data.provinces
    }
  } catch (e) {
    console.error('Failed to fetch provinces:', e)
  } finally {
    loadingProvinces.value = false
  }
}

// Fetch cities/municipalities from API using province name
async function fetchCities() {
  if (!province.value) {
    cityList.value = []
    return
  }

  loadingCities.value = true
  try {
    const response = await $fetch<{ data: { cities: Array<{ id: number; name: string; provinceName: string; isCity: boolean }> } }>('/api/v1/psgc/cities', {
      query: { provinceName: province.value },
    })
    if (response?.data?.cities) {
      cityList.value = response.data.cities
    }
  } catch (e) {
    console.error('Failed to fetch cities:', e)
  } finally {
    loadingCities.value = false
  }
}

// Fetch barangays from API using city/municipality name and province name
async function fetchBarangays() {
  if (!city.value || !province.value) {
    barangayList.value = []
    return
  }

  loadingBarangays.value = true
  try {
    const response = await $fetch<{ data: { barangays: Array<{ id: number; code: string; name: string; cityMunName: string }> } }>('/api/v1/psgc/barangays', {
      query: {
        cityMunName: city.value,
        provinceName: province.value,
      },
    })
    if (response?.data?.barangays) {
      barangayList.value = response.data.barangays
    }
  } catch (e) {
    console.error('Failed to fetch barangays:', e)
  } finally {
    loadingBarangays.value = false
  }
}

// Watch for country changes
watch(country, async (newCountry) => {
  // Skip clearing if we're restoring saved data
  if (!isRestoring.value) {
    province.value = ''
    city.value = ''
    barangay.value = ''
    provinceList.value = []
    cityList.value = []
    barangayList.value = []
  }

  if (newCountry === 'Philippines') {
    await fetchProvinces()
  }
  if (!isRestoring.value) {
    emitUpdate()
  }
})

// Watch for cascading changes
watch(province, async (newProvince) => {
  // Skip clearing if we're restoring saved data
  if (!isRestoring.value) {
    city.value = ''
    barangay.value = ''
    barangayList.value = []
  }

  if (newProvince && isPhilippines.value) {
    await fetchCities()
  } else if (!isRestoring.value) {
    cityList.value = []
  }
  if (!isRestoring.value) {
    emitUpdate()
  }
})

watch(city, async (newCity) => {
  // Skip clearing if we're restoring saved data
  if (!isRestoring.value) {
    barangay.value = ''
  }

  if (newCity && province.value && isPhilippines.value) {
    await fetchBarangays()
  } else if (!isRestoring.value) {
    barangayList.value = []
  }
  if (!isRestoring.value) {
    emitUpdate()
  }
})

watch(barangay, () => {
  emitUpdate()
})

watch(street, () => {
  emitUpdate()
})

onMounted(async () => {
  // Set restoring flag if we have initial data
  const hasInitialData = props.modelValue?.province || props.modelValue?.city || props.modelValue?.barangay
  if (hasInitialData) {
    isRestoring.value = true
  }

  if (isPhilippines.value) {
    await fetchProvinces()

    // Restore selections if editing existing data
    if (province.value) {
      await fetchCities()

      if (city.value) {
        await fetchBarangays()
      }
    }
  }

  // Re-enable watchers after initialization
  if (hasInitialData) {
    await nextTick()
    isRestoring.value = false
  }
})
</script>

<template>
  <div class="space-y-3">
    <!-- Country -->
    <UFormGroup label="Country" size="sm">
      <USelectMenu
        v-model="country"
        :options="countryOptions"
        placeholder="Select country"
        searchable
      />
    </UFormGroup>

    <!-- Philippines: Use PSGC dropdowns -->
    <template v-if="isPhilippines">
      <!-- Province/Region -->
      <UFormGroup label="Province" size="sm">
        <USelectMenu
          v-model="province"
          :options="provinceOptions"
          :loading="loadingProvinces"
          searchable
          searchable-placeholder="Search province..."
          placeholder="Select province"
        />
      </UFormGroup>

      <!-- City/Municipality -->
      <UFormGroup label="City/Municipality" size="sm">
        <USelectMenu
          v-model="city"
          :options="cityOptions"
          :loading="loadingCities"
          option-attribute="label"
          value-attribute="value"
          searchable
          creatable
          searchable-placeholder="Search city/municipality..."
          placeholder="Select or type city/municipality"
          :disabled="!province"
        />
      </UFormGroup>

      <!-- Barangay -->
      <UFormGroup label="Barangay" size="sm">
        <USelectMenu
          v-model="barangay"
          :options="barangayOptions"
          :loading="loadingBarangays"
          searchable
          creatable
          searchable-placeholder="Search barangay..."
          placeholder="Select or type barangay"
          :disabled="!city"
        />
      </UFormGroup>
    </template>

    <!-- Other countries: Use text fields -->
    <template v-else>
      <!-- State/Province/Region -->
      <UFormGroup label="State/Province/Region" size="sm">
        <UInput
          v-model="province"
          placeholder="Enter state, province, or region"
        />
      </UFormGroup>

      <!-- City -->
      <UFormGroup label="City" size="sm">
        <UInput
          v-model="city"
          placeholder="Enter city"
        />
      </UFormGroup>

      <!-- District/Area (optional, replaces Barangay) -->
      <UFormGroup label="District/Area" size="sm">
        <UInput
          v-model="barangay"
          placeholder="Enter district or area (optional)"
        />
      </UFormGroup>
    </template>

    <!-- Street Address -->
    <UFormGroup label="Street Address" size="sm">
      <UInput
        v-model="street"
        :placeholder="placeholder"
      />
    </UFormGroup>
  </div>
</template>
