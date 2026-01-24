<script setup lang="ts">
import type { RegistrationFieldType, FieldOption, FieldValidation, AddressData } from '@nvyt/shared'

interface RegistrationField {
  id: string
  label: string
  fieldType: RegistrationFieldType
  placeholder?: string | null
  helpText?: string | null
  isRequired: boolean
  options?: FieldOption[] | null
  validation?: FieldValidation | null
}

interface UserProfile {
  name: string
  email: string
}

interface SexOption {
  value: string
  label: string
}

const props = defineProps<{
  fields: RegistrationField[]
  ticketIndex: number
  totalTickets: number
  ticketTypeName: string
  ticketNumber: string
  userProfile?: UserProfile | null
  isFirstTicket: boolean
  isSingleTicket: boolean
  isLastTicket: boolean
  userHasExistingTicket?: boolean
  loading?: boolean
  // Built-in field settings
  collectAttendeeAddress?: boolean
  collectAttendeeSex?: boolean
  attendeeSexOptions?: SexOption[]
}>()

const emit = defineEmits<{
  submit: [responses: Record<string, string | number | boolean | AddressData>, useUserProfile: boolean, attendeeInfo: { name: string; email: string; birthdate: string; address?: AddressData; sex?: string }]
  skip: []
}>()

// Built-in attendee info (always required)
const attendeeName = ref('')
const attendeeEmail = ref('')
const attendeeBirthdate = ref('')

// Optional built-in fields
const attendeeAddress = ref<AddressData | null>(null)
const attendeeSex = ref('')

// Computed sex options with defaults
const sexOptionsComputed = computed(() => {
  if (props.attendeeSexOptions && props.attendeeSexOptions.length > 0) {
    return props.attendeeSexOptions
  }
  return [
    { value: 'male', label: 'Male' },
    { value: 'female', label: 'Female' },
  ]
})

// Form state
const responses = ref<Record<string, string | number | boolean>>({})
const errors = ref<Record<string, string>>({})
const useMyInfo = ref(false)

// Initialize empty responses
onMounted(() => {
  props.fields.forEach((field) => {
    if (field.fieldType === 'checkbox') {
      responses.value[field.id] = false
    } else if (field.fieldType === 'number') {
      responses.value[field.id] = ''
    } else {
      responses.value[field.id] = ''
    }
  })

  // Auto-check "this ticket is mine" for single ticket purchases
  // Only if user doesn't already have a ticket to this event
  if (props.isSingleTicket && props.userProfile && !props.userHasExistingTicket) {
    useMyInfo.value = true
    prefillFromProfile()
  }
})

// Watch for "This ticket is mine" checkbox
watch(useMyInfo, (checked) => {
  if (checked && props.userProfile) {
    prefillFromProfile()
  } else if (!checked) {
    // Clear built-in attendee fields
    attendeeName.value = ''
    attendeeEmail.value = ''
    attendeeBirthdate.value = ''
    attendeeAddress.value = null
    attendeeSex.value = ''
    // Clear prefilled data
    props.fields.forEach((field) => {
      if (field.fieldType === 'checkbox') {
        responses.value[field.id] = false
      } else {
        responses.value[field.id] = ''
      }
    })
  }
})

function prefillFromProfile() {
  if (!props.userProfile) return

  // Prefill built-in attendee fields
  attendeeName.value = props.userProfile.name || ''
  attendeeEmail.value = props.userProfile.email || ''

  props.fields.forEach((field) => {
    const labelLower = field.label.toLowerCase()

    // Try to match common field names with user profile data
    if (field.fieldType === 'text' && (labelLower.includes('name') || labelLower.includes('full name'))) {
      responses.value[field.id] = props.userProfile?.name || ''
    } else if (field.fieldType === 'email' || labelLower.includes('email')) {
      responses.value[field.id] = props.userProfile?.email || ''
    }
  })
}

function validate(): boolean {
  errors.value = {}
  let isValid = true

  // Validate built-in attendee fields (always required)
  if (!attendeeName.value.trim()) {
    errors.value['_attendeeName'] = 'Attendee name is required'
    isValid = false
  }

  if (!attendeeEmail.value.trim()) {
    errors.value['_attendeeEmail'] = 'Attendee email is required'
    isValid = false
  } else {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(attendeeEmail.value)) {
      errors.value['_attendeeEmail'] = 'Please enter a valid email address'
      isValid = false
    }
  }

  if (!attendeeBirthdate.value) {
    errors.value['_attendeeBirthdate'] = 'Birthdate is required'
    isValid = false
  }

  // Validate optional built-in fields
  if (props.collectAttendeeAddress && !attendeeAddress.value?.formattedAddress) {
    errors.value['_attendeeAddress'] = 'Address is required'
    isValid = false
  }

  if (props.collectAttendeeSex && !attendeeSex.value) {
    errors.value['_attendeeSex'] = 'Sex is required'
    isValid = false
  }

  props.fields.forEach((field) => {
    const value = responses.value[field.id]

    // Required field check
    if (field.isRequired) {
      if (value === undefined || value === null || value === '' ||
          (field.fieldType === 'checkbox' && value !== true)) {
        errors.value[field.id] = `${field.label} is required`
        isValid = false
        return
      }
    }

    // Skip further validation for empty optional fields
    if (value === undefined || value === null || value === '') return

    // Type-specific validation
    switch (field.fieldType) {
      case 'email': {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (typeof value === 'string' && !emailRegex.test(value)) {
          errors.value[field.id] = 'Please enter a valid email address'
          isValid = false
        }
        break
      }

      case 'phone': {
        const phoneRegex = /^[+]?[\d\s\-()]{7,20}$/
        if (typeof value === 'string' && !phoneRegex.test(value)) {
          errors.value[field.id] = 'Please enter a valid phone number'
          isValid = false
        }
        break
      }

      case 'url': {
        try {
          new URL(value as string)
        } catch {
          errors.value[field.id] = 'Please enter a valid URL'
          isValid = false
        }
        break
      }

      case 'number': {
        const numValue = typeof value === 'string' ? parseFloat(value) : value
        if (typeof numValue === 'number' && !isNaN(numValue) && field.validation) {
          if (field.validation.min !== undefined && numValue < field.validation.min) {
            errors.value[field.id] = `Value must be at least ${field.validation.min}`
            isValid = false
          }
          if (field.validation.max !== undefined && numValue > field.validation.max) {
            errors.value[field.id] = `Value must be at most ${field.validation.max}`
            isValid = false
          }
        }
        break
      }

      case 'text':
      case 'textarea': {
        const strValue = String(value)
        if (field.validation) {
          if (field.validation.minLength !== undefined && strValue.length < field.validation.minLength) {
            errors.value[field.id] = `Must be at least ${field.validation.minLength} characters`
            isValid = false
          }
          if (field.validation.maxLength !== undefined && strValue.length > field.validation.maxLength) {
            errors.value[field.id] = `Must be at most ${field.validation.maxLength} characters`
            isValid = false
          }
          if (field.validation.pattern) {
            const regex = new RegExp(field.validation.pattern)
            if (!regex.test(strValue)) {
              errors.value[field.id] = 'Invalid format'
              isValid = false
            }
          }
        }
        break
      }

      case 'select':
      case 'radio': {
        const validValues = field.options?.map((o) => o.value) || []
        if (!validValues.includes(value as string)) {
          errors.value[field.id] = 'Please select a valid option'
          isValid = false
        }
        break
      }
    }
  })

  return isValid
}

function handleSubmit() {
  if (!validate()) return

  // Clean up responses - only send non-empty values
  const cleanResponses: Record<string, string | number | boolean | AddressData> = {}
  Object.entries(responses.value).forEach(([key, val]) => {
    if (val !== '' && val !== undefined && val !== null) {
      cleanResponses[key] = val
    }
  })

  const attendeeInfo: { name: string; email: string; birthdate: string; address?: AddressData; sex?: string } = {
    name: attendeeName.value.trim(),
    email: attendeeEmail.value.trim(),
    birthdate: attendeeBirthdate.value,
  }

  if (props.collectAttendeeAddress && attendeeAddress.value) {
    attendeeInfo.address = attendeeAddress.value
  }

  if (props.collectAttendeeSex && attendeeSex.value) {
    attendeeInfo.sex = attendeeSex.value
  }

  emit('submit', cleanResponses, useMyInfo.value, attendeeInfo)
}
</script>

<template>
  <div>
    <!-- Ticket header -->
    <div class="mb-6">
      <div class="flex items-center gap-2 text-sm text-gray-500 mb-1">
        <span>Ticket {{ ticketIndex + 1 }} of {{ totalTickets }}</span>
        <span>&middot;</span>
        <span class="text-gray-700 dark:text-gray-300 font-medium">{{ ticketTypeName }}</span>
      </div>
      <p class="text-xs text-gray-400 font-mono">{{ ticketNumber }}</p>
    </div>

    <!-- "This ticket is mine" checkbox (only for first ticket when user doesn't have existing ticket) -->
    <div
      v-if="isFirstTicket && userProfile && !userHasExistingTicket"
      class="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg"
    >
      <div class="flex items-center gap-3">
        <UCheckbox
          v-model="useMyInfo"
          :label="isSingleTicket ? 'Pre-fill with my information' : 'This ticket is for me'"
        />
      </div>
      <p v-if="useMyInfo" class="text-sm text-blue-600 dark:text-blue-400 mt-2 ml-6">
        We'll use your account information ({{ userProfile.name }}, {{ userProfile.email }}) for matching fields.
      </p>
    </div>

    <!-- Built-in attendee fields (always required) -->
    <div class="space-y-4 mb-6">
      <UFormGroup label="Attendee Name" required :error="errors['_attendeeName']">
        <UInput
          v-model="attendeeName"
          placeholder="Full name of ticket holder"
          :disabled="loading"
        />
      </UFormGroup>

      <UFormGroup label="Attendee Email" required :error="errors['_attendeeEmail']">
        <UInput
          v-model="attendeeEmail"
          type="email"
          placeholder="Email address of ticket holder"
          :disabled="loading"
        />
      </UFormGroup>

      <UFormGroup label="Birthdate" required :error="errors['_attendeeBirthdate']" help="Used for identity verification at the venue">
        <UInput
          v-model="attendeeBirthdate"
          type="date"
          :disabled="loading"
        />
      </UFormGroup>

      <!-- Sex Field (optional built-in) -->
      <UFormGroup
        v-if="collectAttendeeSex"
        label="Sex"
        required
        :error="errors['_attendeeSex']"
      >
        <URadioGroup
          v-model="attendeeSex"
          :options="sexOptionsComputed"
          :disabled="loading"
        />
      </UFormGroup>

      <!-- Address Field (optional built-in) -->
      <UFormGroup
        v-if="collectAttendeeAddress"
        label="Address"
        required
        :error="errors['_attendeeAddress']"
      >
        <RegistrationAddressAutocomplete
          v-model="attendeeAddress"
          placeholder="Search for your address..."
          :disabled="loading"
        />
      </UFormGroup>
    </div>

    <!-- Additional registration fields -->
    <div v-if="fields.length > 0" class="space-y-4">
      <RegistrationFieldRenderer
        v-for="field in fields"
        :key="field.id"
        :field="field"
        v-model="responses[field.id]"
        :error="errors[field.id]"
      />
    </div>

    <!-- Submit button -->
    <div class="mt-8 flex gap-3">
      <UButton
        color="primary"
        size="lg"
        :loading="loading"
        @click="handleSubmit"
      >
        {{ isLastTicket ? 'Complete Registration' : 'Save & Continue' }}
        <template #trailing>
          <UIcon :name="isLastTicket ? 'i-heroicons-check' : 'i-heroicons-arrow-right'" class="w-5 h-5" />
        </template>
      </UButton>
    </div>
  </div>
</template>
