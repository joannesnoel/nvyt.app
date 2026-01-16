<script setup lang="ts">
definePageMeta({
  layout: 'default',
})

const { data: summaryData, pending: summaryPending, refresh: refreshSummary } = await useFetch('/api/v1/wallet/summary')

const wallet = computed(() => summaryData.value?.data?.wallet)
const totals = computed(() => summaryData.value?.data?.totals)
const earningsByEvent = computed(() => summaryData.value?.data?.earningsByEvent || [])
const recentTransactions = computed(() => summaryData.value?.data?.recentTransactions || [])

function formatCurrency(amount: number | string | null | undefined) {
  const num = typeof amount === 'string' ? parseFloat(amount) : (amount ?? 0)
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function getTransactionIcon(type: string) {
  switch (type) {
    case 'payment_received':
      return 'i-heroicons-arrow-down-circle'
    case 'refund':
      return 'i-heroicons-arrow-uturn-left'
    case 'payout':
      return 'i-heroicons-banknotes'
    case 'platform_fee':
      return 'i-heroicons-receipt-percent'
    default:
      return 'i-heroicons-currency-dollar'
  }
}

function getTransactionColor(type: string) {
  switch (type) {
    case 'payment_received':
      return 'green'
    case 'refund':
      return 'red'
    case 'payout':
      return 'blue'
    case 'platform_fee':
      return 'orange'
    default:
      return 'gray'
  }
}

function getTransactionTypeLabel(type: string) {
  switch (type) {
    case 'payment_received':
      return 'Payment'
    case 'refund':
      return 'Refund'
    case 'payout':
      return 'Payout'
    case 'platform_fee':
      return 'Platform Fee'
    default:
      return type
  }
}
</script>

<template>
  <div class="py-8">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
        <div>
          <NuxtLink
            to="/dashboard"
            class="text-gray-600 dark:text-gray-400 hover:text-primary flex items-center gap-1 mb-2"
          >
            <UIcon name="i-heroicons-arrow-left" class="w-4 h-4" />
            Back to Dashboard
          </NuxtLink>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
            Earnings
          </h1>
          <p class="text-gray-600 dark:text-gray-400 mt-1">
            Track your revenue and manage payouts
          </p>
        </div>
        <div class="flex gap-3">
          <UButton
            to="/dashboard/transactions"
            color="gray"
            variant="outline"
            icon="i-heroicons-list-bullet"
          >
            Transactions
          </UButton>
          <UButton
            to="/dashboard/payouts"
            color="primary"
            icon="i-heroicons-banknotes"
          >
            Request Payout
          </UButton>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="summaryPending" class="space-y-6">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <USkeleton v-for="i in 4" :key="i" class="h-28" />
        </div>
        <USkeleton class="h-64" />
      </div>

      <template v-else>
        <!-- Balance Cards -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <UCard>
            <div class="flex items-center gap-3">
              <div class="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <UIcon name="i-heroicons-currency-dollar" class="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p class="text-2xl font-bold text-green-600">
                  {{ formatCurrency(wallet?.availableBalance) }}
                </p>
                <p class="text-sm text-gray-500">Available</p>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center gap-3">
              <div class="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                <UIcon name="i-heroicons-clock" class="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p class="text-2xl font-bold text-yellow-600">
                  {{ formatCurrency(wallet?.pendingBalance) }}
                </p>
                <p class="text-sm text-gray-500">Pending</p>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center gap-3">
              <div class="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                <UIcon name="i-heroicons-chart-bar" class="w-5 h-5 text-primary" />
              </div>
              <div>
                <p class="text-2xl font-bold text-gray-900 dark:text-white">
                  {{ formatCurrency(wallet?.totalEarnings) }}
                </p>
                <p class="text-sm text-gray-500">Total Earnings</p>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center gap-3">
              <div class="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                <UIcon name="i-heroicons-receipt-percent" class="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p class="text-2xl font-bold text-orange-600">
                  {{ formatCurrency(totals?.platformFees) }}
                </p>
                <p class="text-sm text-gray-500">Platform Fees</p>
              </div>
            </div>
          </UCard>
        </div>

        <!-- Main Content -->
        <div class="grid md:grid-cols-3 gap-8">
          <!-- Earnings by Event -->
          <div class="md:col-span-2">
            <UCard>
              <template #header>
                <div class="flex items-center justify-between">
                  <h2 class="font-semibold text-gray-900 dark:text-white">Earnings by Event</h2>
                  <UButton
                    to="/dashboard/reports"
                    color="gray"
                    variant="ghost"
                    size="sm"
                    icon="i-heroicons-document-chart-bar"
                  >
                    Reports
                  </UButton>
                </div>
              </template>

              <div v-if="earningsByEvent.length === 0" class="text-center py-8">
                <UIcon name="i-heroicons-currency-dollar" class="w-10 h-10 text-gray-400 mx-auto mb-2" />
                <p class="text-gray-500">No earnings yet</p>
                <p class="text-sm text-gray-400">Revenue from ticket sales will appear here</p>
              </div>

              <div v-else class="overflow-x-auto -mx-4 sm:mx-0">
                <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead>
                    <tr>
                      <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Event
                      </th>
                      <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Gross
                      </th>
                      <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Fees
                      </th>
                      <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Net
                      </th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                    <tr v-for="eventRow in earningsByEvent" :key="eventRow.eventId ?? ''">
                      <td class="px-4 py-3">
                        <p class="font-medium text-gray-900 dark:text-white truncate max-w-xs">
                          {{ eventRow.eventTitle }}
                        </p>
                        <p class="text-xs text-gray-500">{{ formatDate(eventRow.eventDate) }}</p>
                      </td>
                      <td class="px-4 py-3 text-right text-sm text-gray-900 dark:text-white">
                        {{ formatCurrency(eventRow.grossAmount) }}
                      </td>
                      <td class="px-4 py-3 text-right text-sm text-orange-600">
                        -{{ formatCurrency(eventRow.platformFees) }}
                      </td>
                      <td class="px-4 py-3 text-right text-sm font-medium text-green-600">
                        {{ formatCurrency(eventRow.netEarnings) }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </UCard>
          </div>

          <!-- Recent Transactions -->
          <div>
            <UCard>
              <template #header>
                <div class="flex items-center justify-between">
                  <h2 class="font-semibold text-gray-900 dark:text-white">Recent Activity</h2>
                  <UButton
                    to="/dashboard/transactions"
                    color="gray"
                    variant="ghost"
                    size="sm"
                  >
                    View All
                  </UButton>
                </div>
              </template>

              <div v-if="recentTransactions.length === 0" class="text-center py-8">
                <UIcon name="i-heroicons-clock" class="w-10 h-10 text-gray-400 mx-auto mb-2" />
                <p class="text-gray-500">No transactions yet</p>
              </div>

              <div v-else class="space-y-4">
                <div
                  v-for="tx in recentTransactions"
                  :key="tx.id"
                  class="flex items-center gap-3"
                >
                  <div
                    class="p-2 rounded-lg"
                    :class="{
                      'bg-green-100 dark:bg-green-900/30': tx.type === 'payment_received',
                      'bg-red-100 dark:bg-red-900/30': tx.type === 'refund',
                      'bg-blue-100 dark:bg-blue-900/30': tx.type === 'payout',
                      'bg-orange-100 dark:bg-orange-900/30': tx.type === 'platform_fee',
                    }"
                  >
                    <UIcon
                      :name="getTransactionIcon(tx.type)"
                      class="w-4 h-4"
                      :class="{
                        'text-green-600': tx.type === 'payment_received',
                        'text-red-600': tx.type === 'refund',
                        'text-blue-600': tx.type === 'payout',
                        'text-orange-600': tx.type === 'platform_fee',
                      }"
                    />
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {{ getTransactionTypeLabel(tx.type) }}
                    </p>
                    <p class="text-xs text-gray-500 truncate">
                      {{ tx.eventTitle || tx.description || 'Transaction' }}
                    </p>
                  </div>
                  <div class="text-right">
                    <p
                      class="text-sm font-medium"
                      :class="{
                        'text-green-600': parseFloat(tx.netAmount) > 0,
                        'text-red-600': parseFloat(tx.netAmount) < 0,
                        'text-gray-600': parseFloat(tx.netAmount) === 0,
                      }"
                    >
                      {{ parseFloat(tx.netAmount) >= 0 ? '+' : '' }}{{ formatCurrency(tx.netAmount) }}
                    </p>
                    <p class="text-xs text-gray-400">{{ formatDate(tx.createdAt) }}</p>
                  </div>
                </div>
              </div>
            </UCard>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
