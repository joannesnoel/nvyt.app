<script setup lang="ts">
export interface OrderItem {
  ticketTypeId: string
  ticketTypeName: string
  quantity: number
  unitPrice: number
  subtotal: number
}

export interface FeeBreakdown {
  subtotal: number
  processingFee: number
  adminFee: number
  totalFees: number
  total: number
}

const props = defineProps<{
  eventTitle: string
  items: OrderItem[]
  feeBreakdown: FeeBreakdown
  orderNumber?: string
}>()

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(amount)
}
</script>

<template>
  <div class="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-6 space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
        Order Summary
      </h3>
      <span
        v-if="orderNumber"
        class="text-xs font-mono text-gray-500 dark:text-gray-400"
      >
        {{ orderNumber }}
      </span>
    </div>

    <!-- Event title -->
    <div class="text-sm text-gray-600 dark:text-gray-300">
      {{ eventTitle }}
    </div>

    <!-- Divider -->
    <hr class="border-gray-200 dark:border-gray-700" />

    <!-- Items -->
    <div class="space-y-3">
      <div
        v-for="item in items"
        :key="item.ticketTypeId"
        class="flex items-start justify-between text-sm"
      >
        <div class="flex-1">
          <div class="font-medium text-gray-900 dark:text-white">
            {{ item.ticketTypeName }}
          </div>
          <div class="text-gray-500 dark:text-gray-400">
            {{ formatCurrency(item.unitPrice) }} x {{ item.quantity }}
          </div>
        </div>
        <div class="font-medium text-gray-900 dark:text-white ml-4">
          {{ formatCurrency(item.subtotal) }}
        </div>
      </div>
    </div>

    <!-- Divider -->
    <hr class="border-gray-200 dark:border-gray-700" />

    <!-- Subtotal -->
    <div class="flex justify-between text-sm">
      <span class="text-gray-600 dark:text-gray-400">Subtotal</span>
      <span class="text-gray-900 dark:text-white">
        {{ formatCurrency(feeBreakdown.subtotal) }}
      </span>
    </div>

    <!-- Platform fee (if present) -->
    <div
      v-if="feeBreakdown.adminFee > 0"
      class="flex justify-between text-sm"
    >
      <span class="text-gray-600 dark:text-gray-400 inline-flex items-center gap-1">
        Platform Fee
        <UPopover :ui="{ width: 'max-w-[250px]' }">
          <UIcon name="i-heroicons-information-circle" class="w-4 h-4 text-gray-400 cursor-pointer" />
          <template #panel>
            <p class="p-2 text-xs text-gray-600 dark:text-gray-300">A service fee for event hosting, ticketing, and order management.</p>
          </template>
        </UPopover>
      </span>
      <span class="text-gray-900 dark:text-white">
        {{ formatCurrency(feeBreakdown.adminFee) }}
      </span>
    </div>

    <!-- Payment fee -->
    <div class="flex justify-between text-sm">
      <span class="text-gray-600 dark:text-gray-400 inline-flex items-center gap-1">
        Payment Fee
        <UPopover :ui="{ width: 'max-w-[250px]' }">
          <UIcon name="i-heroicons-information-circle" class="w-4 h-4 text-gray-400 cursor-pointer" />
          <template #panel>
            <p class="p-2 text-xs text-gray-600 dark:text-gray-300">A fee charged by the payment provider to process your payment.</p>
          </template>
        </UPopover>
      </span>
      <span class="text-gray-900 dark:text-white">
        {{ formatCurrency(feeBreakdown.processingFee) }}
      </span>
    </div>

    <!-- Divider -->
    <hr class="border-gray-200 dark:border-gray-700" />

    <!-- Total -->
    <div class="flex justify-between text-base font-semibold">
      <span class="text-gray-900 dark:text-white">Total</span>
      <span class="text-primary">
        {{ formatCurrency(feeBreakdown.total) }}
      </span>
    </div>
  </div>
</template>
