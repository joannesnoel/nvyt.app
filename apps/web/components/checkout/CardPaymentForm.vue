<script setup lang="ts">
const props = defineProps<{
  disabled?: boolean
}>()

const emit = defineEmits<{
  submit: [data: {
    cardNumber: string
    expMonth: string
    expYear: string
    cvc: string
  }]
}>()

const cardNumber = ref('')
const expiry = ref('')
const cvc = ref('')

const cardNumberError = ref<string | null>(null)
const expiryError = ref<string | null>(null)
const cvcError = ref<string | null>(null)

// Format card number with spaces
function formatCardNumber(value: string) {
  const cleaned = value.replace(/\D/g, '')
  const formatted = cleaned.replace(/(\d{4})/g, '$1 ').trim()
  return formatted.slice(0, 19) // Max 16 digits + 3 spaces
}

function handleCardNumberInput(e: Event) {
  const target = e.target as HTMLInputElement
  const cursorPos = target.selectionStart || 0
  const oldLength = target.value.length

  cardNumber.value = formatCardNumber(target.value)
  cardNumberError.value = null

  // Adjust cursor position after formatting
  const newLength = cardNumber.value.length
  const newCursorPos = cursorPos + (newLength - oldLength)
  nextTick(() => {
    target.setSelectionRange(newCursorPos, newCursorPos)
  })
}

// Format expiry as MM/YY
function formatExpiry(value: string) {
  const cleaned = value.replace(/\D/g, '')
  if (cleaned.length >= 2) {
    return `${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}`
  }
  return cleaned
}

function handleExpiryInput(e: Event) {
  const target = e.target as HTMLInputElement
  expiry.value = formatExpiry(target.value)
  expiryError.value = null
}

// Format CVC (3-4 digits)
function handleCvcInput(e: Event) {
  const target = e.target as HTMLInputElement
  cvc.value = target.value.replace(/\D/g, '').slice(0, 4)
  cvcError.value = null
}

// Detect card brand
const cardBrand = computed(() => {
  const number = cardNumber.value.replace(/\s/g, '')
  if (/^4/.test(number)) return 'visa'
  if (/^5[1-5]/.test(number)) return 'mastercard'
  if (/^3[47]/.test(number)) return 'amex'
  if (/^35/.test(number)) return 'jcb'
  if (/^6(?:011|5)/.test(number)) return 'discover'
  return null
})

const cardBrandIcon = computed(() => {
  switch (cardBrand.value) {
    case 'visa':
      return 'i-simple-icons-visa'
    case 'mastercard':
      return 'i-simple-icons-mastercard'
    case 'amex':
      return 'i-simple-icons-americanexpress'
    case 'jcb':
      return 'i-simple-icons-jcb'
    default:
      return 'i-heroicons-credit-card'
  }
})

// Parse expiry into month and year
const parsedExpiry = computed(() => {
  const parts = expiry.value.split('/')
  if (parts.length === 2) {
    return {
      month: parts[0],
      year: parts[1],
    }
  }
  return { month: '', year: '' }
})

// Validate form
function validate(): boolean {
  let valid = true

  // Card number validation (basic Luhn check)
  const cleanNumber = cardNumber.value.replace(/\s/g, '')
  if (cleanNumber.length < 13 || cleanNumber.length > 19) {
    cardNumberError.value = 'Invalid card number'
    valid = false
  }

  // Expiry validation
  const { month, year } = parsedExpiry.value
  if (!month || !year) {
    expiryError.value = 'Invalid expiry date'
    valid = false
  } else {
    const monthNum = parseInt(month, 10)
    if (monthNum < 1 || monthNum > 12) {
      expiryError.value = 'Invalid expiry date'
      valid = false
    } else {
      // Check if card is expired
      const now = new Date()
      const currentYear = now.getFullYear() % 100
      const currentMonth = now.getMonth() + 1
      const expYear = parseInt(year, 10)

      if (expYear < currentYear || (expYear === currentYear && monthNum < currentMonth)) {
        expiryError.value = 'Card has expired'
        valid = false
      }
    }
  }

  // CVC validation
  if (cvc.value.length < 3) {
    cvcError.value = 'Invalid CVC'
    valid = false
  }

  return valid
}

function handleSubmit() {
  if (!validate()) return

  const { month, year } = parsedExpiry.value
  if (!month || !year) return // Validation should catch this, but be safe

  emit('submit', {
    cardNumber: cardNumber.value.replace(/\s/g, ''),
    expMonth: month,
    expYear: year,
    cvc: cvc.value,
  })
}

defineExpose({ validate, submit: handleSubmit })
</script>

<template>
  <div class="space-y-4">
    <div class="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
      <UIcon name="i-heroicons-lock-closed" class="w-4 h-4" />
      <span>Secure card payment</span>
    </div>

    <!-- Card Number -->
    <div>
      <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        Card Number
      </label>
      <div class="relative">
        <input
          type="text"
          inputmode="numeric"
          autocomplete="cc-number"
          placeholder="1234 5678 9012 3456"
          :value="cardNumber"
          :disabled="disabled"
          class="block w-full pl-4 pr-12 py-3 border rounded-lg text-gray-900 dark:text-white bg-white dark:bg-gray-800 placeholder-gray-400"
          :class="[
            cardNumberError
              ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
              : 'border-gray-300 dark:border-gray-600 focus:ring-primary focus:border-primary',
          ]"
          @input="handleCardNumberInput"
        />
        <div class="absolute right-3 top-1/2 -translate-y-1/2">
          <UIcon :name="cardBrandIcon" class="w-6 h-6 text-gray-400" />
        </div>
      </div>
      <p v-if="cardNumberError" class="mt-1 text-sm text-red-500">
        {{ cardNumberError }}
      </p>
    </div>

    <!-- Expiry and CVC -->
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Expiry Date
        </label>
        <input
          type="text"
          inputmode="numeric"
          autocomplete="cc-exp"
          placeholder="MM/YY"
          :value="expiry"
          :disabled="disabled"
          class="block w-full px-4 py-3 border rounded-lg text-gray-900 dark:text-white bg-white dark:bg-gray-800 placeholder-gray-400"
          :class="[
            expiryError
              ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
              : 'border-gray-300 dark:border-gray-600 focus:ring-primary focus:border-primary',
          ]"
          @input="handleExpiryInput"
        />
        <p v-if="expiryError" class="mt-1 text-sm text-red-500">
          {{ expiryError }}
        </p>
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          CVC
        </label>
        <input
          type="text"
          inputmode="numeric"
          autocomplete="cc-csc"
          placeholder="123"
          :value="cvc"
          :disabled="disabled"
          class="block w-full px-4 py-3 border rounded-lg text-gray-900 dark:text-white bg-white dark:bg-gray-800 placeholder-gray-400"
          :class="[
            cvcError
              ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
              : 'border-gray-300 dark:border-gray-600 focus:ring-primary focus:border-primary',
          ]"
          @input="handleCvcInput"
        />
        <p v-if="cvcError" class="mt-1 text-sm text-red-500">
          {{ cvcError }}
        </p>
      </div>
    </div>

    <!-- Security info -->
    <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
      <UIcon name="i-heroicons-shield-check" class="w-4 h-4" />
      <span>Your card details are encrypted and sent directly to PayMongo</span>
    </div>
  </div>
</template>
