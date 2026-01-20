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

const props = defineProps<{
  field: RegistrationField
  modelValue?: string | number | boolean | AddressData | null
  error?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | number | boolean | AddressData | null]
}>()

// String value for text-based inputs
const stringValue = computed({
  get: () => String(props.modelValue ?? ''),
  set: (val: string) => emit('update:modelValue', val),
})

// Number value for number inputs
const numberValue = computed({
  get: () => typeof props.modelValue === 'number' ? props.modelValue : (props.modelValue ? Number(props.modelValue) : undefined),
  set: (val: number | undefined) => emit('update:modelValue', val ?? ''),
})

// Convert options for USelectMenu/URadioGroup
const selectOptions = computed(() => {
  return props.field.options?.map(o => ({
    value: o.value,
    label: o.label,
  })) || []
})

// Get validation attributes for text/textarea inputs
const textValidation = computed(() => {
  const v = props.field.validation || {}
  return {
    minlength: v.minLength,
    maxlength: v.maxLength,
    pattern: v.pattern,
  }
})

// Get validation attributes for number inputs
const numberValidation = computed(() => {
  const v = props.field.validation || {}
  return {
    min: v.min,
    max: v.max,
  }
})

// Track checkbox state
const checkboxValue = computed({
  get: () => Boolean(props.modelValue),
  set: (val: boolean) => emit('update:modelValue', val),
})

// Address value for address inputs
const addressValue = computed({
  get: () => {
    if (props.modelValue && typeof props.modelValue === 'object' && 'formattedAddress' in props.modelValue) {
      return props.modelValue as AddressData
    }
    return null
  },
  set: (val: AddressData | null) => emit('update:modelValue', val),
})

// Convert null to undefined for component compatibility
const placeholder = computed(() => props.field.placeholder ?? undefined)
const helpText = computed(() => props.field.helpText ?? undefined)
</script>

<template>
  <UFormGroup
    :label="field.label"
    :required="field.isRequired"
    :hint="helpText"
    :error="error"
  >
    <!-- Text Input -->
    <UInput
      v-if="field.fieldType === 'text'"
      v-model="stringValue"
      :placeholder="placeholder"
      v-bind="textValidation"
    />

    <!-- Email Input -->
    <UInput
      v-else-if="field.fieldType === 'email'"
      v-model="stringValue"
      type="email"
      :placeholder="placeholder || 'email@example.com'"
    />

    <!-- Phone Input -->
    <UInput
      v-else-if="field.fieldType === 'phone'"
      v-model="stringValue"
      type="tel"
      :placeholder="placeholder || '+63 XXX XXX XXXX'"
    />

    <!-- URL Input -->
    <UInput
      v-else-if="field.fieldType === 'url'"
      v-model="stringValue"
      type="url"
      :placeholder="placeholder || 'https://'"
    />

    <!-- Number Input -->
    <UInput
      v-else-if="field.fieldType === 'number'"
      v-model="numberValue"
      type="number"
      :placeholder="placeholder"
      v-bind="numberValidation"
    />

    <!-- Date Input -->
    <UInput
      v-else-if="field.fieldType === 'date'"
      v-model="stringValue"
      type="date"
    />

    <!-- Textarea -->
    <UTextarea
      v-else-if="field.fieldType === 'textarea'"
      v-model="stringValue"
      :placeholder="placeholder"
      :rows="3"
      v-bind="textValidation"
    />

    <!-- Select Dropdown -->
    <USelectMenu
      v-else-if="field.fieldType === 'select'"
      v-model="stringValue"
      :options="selectOptions"
      :placeholder="placeholder || 'Select an option'"
      value-attribute="value"
      option-attribute="label"
    />

    <!-- Radio Buttons -->
    <URadioGroup
      v-else-if="field.fieldType === 'radio'"
      v-model="stringValue"
      :options="selectOptions"
    />

    <!-- Checkbox -->
    <UCheckbox
      v-else-if="field.fieldType === 'checkbox'"
      v-model="checkboxValue"
      :label="placeholder || 'Yes'"
    />

    <!-- Address Autocomplete -->
    <RegistrationAddressAutocomplete
      v-else-if="field.fieldType === 'address'"
      v-model="addressValue"
      :placeholder="placeholder || 'Search for your address...'"
      :required="field.isRequired"
    />
  </UFormGroup>
</template>
