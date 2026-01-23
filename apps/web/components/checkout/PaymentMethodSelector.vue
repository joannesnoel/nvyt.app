<script setup lang="ts">
import { PAYMENT_METHODS, type PaymentMethodType } from '~/composables/usePayMongo'

const props = defineProps<{
  modelValue: PaymentMethodType | null
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: PaymentMethodType]
}>()

const selectedMethod = computed({
  get: () => props.modelValue,
  set: (value) => {
    if (value) emit('update:modelValue', value)
  },
})
</script>

<template>
  <div class="space-y-3">
    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
      Select Payment Method
    </label>

    <div class="grid gap-3">
      <button
        v-for="method in PAYMENT_METHODS"
        :key="method.type"
        type="button"
        class="relative flex items-center p-4 border-2 rounded-lg transition-all text-left"
        :class="[
          selectedMethod === method.type
            ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
        ]"
        :disabled="disabled"
        @click="selectedMethod = method.type"
      >
        <!-- Radio indicator -->
        <div
          class="flex-shrink-0 w-5 h-5 rounded-full border-2 mr-4 flex items-center justify-center"
          :class="[
            selectedMethod === method.type
              ? 'border-primary'
              : 'border-gray-300 dark:border-gray-600',
          ]"
        >
          <div
            v-if="selectedMethod === method.type"
            class="w-2.5 h-2.5 rounded-full bg-primary"
          />
        </div>

        <!-- Icon -->
        <div
          class="flex-shrink-0 w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center mr-4"
        >
          <UIcon :name="method.icon" class="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </div>

        <!-- Label and description -->
        <div class="flex-1 min-w-0">
          <div class="font-medium text-gray-900 dark:text-white">
            {{ method.label }}
          </div>
          <div class="text-sm text-gray-500 dark:text-gray-400">
            {{ method.description }}
          </div>
        </div>

        <!-- Selected indicator -->
        <div
          v-if="selectedMethod === method.type"
          class="flex-shrink-0 ml-4"
        >
          <UIcon name="i-heroicons-check-circle-solid" class="w-6 h-6 text-primary" />
        </div>
      </button>
    </div>
  </div>
</template>
