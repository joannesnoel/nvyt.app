<script setup lang="ts">
definePageMeta({
  layout: 'default',
})

// Date range filter
const dateRange = reactive({
  startDate: '',
  endDate: '',
})

// Group by
const groupBy = ref<'day' | 'week' | 'month' | 'event'>('day')

const groupByOptions = [
  { label: 'Day', value: 'day' },
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' },
  { label: 'Event', value: 'event' },
]

// Build query params
const queryParams = computed(() => {
  const params: Record<string, string> = {
    groupBy: groupBy.value,
  }
  if (dateRange.startDate) params.startDate = dateRange.startDate
  if (dateRange.endDate) params.endDate = dateRange.endDate
  return params
})

// Fetch report data
const { data, pending, refresh } = await useFetch('/api/v1/reports/earnings', {
  query: queryParams,
  watch: [queryParams],
})

const summary = computed(() => data.value?.data?.summary || {
  grossRevenue: 0,
  platformFees: 0,
  refunds: 0,
  payouts: 0,
  netEarnings: 0,
  transactionCount: 0,
})

const breakdown = computed(() => data.value?.data?.breakdown || [])

function formatCurrency(amount: number | string | null | undefined) {
  const num = typeof amount === 'string' ? parseFloat(amount) : (amount ?? 0)
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

function formatPeriod(period: string | undefined) {
  if (!period) return '-'

  if (period.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return new Date(period).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } else if (period.match(/^\d{4}-\d{2}$/)) {
    const [year, month] = period.split('-')
    return new Date(parseInt(year ?? '0'), parseInt(month ?? '1') - 1).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    })
  }

  return period
}

// Export URL
const exportUrl = computed(() => {
  const params = new URLSearchParams()
  if (dateRange.startDate) params.set('startDate', dateRange.startDate)
  if (dateRange.endDate) params.set('endDate', dateRange.endDate)
  params.set('format', 'csv')
  return `/api/v1/reports/earnings/export?${params.toString()}`
})

// Set quick date ranges
function setDateRange(range: 'week' | 'month' | 'quarter' | 'year' | 'all') {
  const now = new Date()
  const end = now.toISOString().split('T')[0] ?? ''

  switch (range) {
    case 'week':
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      dateRange.startDate = weekAgo.toISOString().split('T')[0] ?? ''
      dateRange.endDate = end
      break
    case 'month':
      const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
      dateRange.startDate = monthAgo.toISOString().split('T')[0] ?? ''
      dateRange.endDate = end
      break
    case 'quarter':
      const quarterAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())
      dateRange.startDate = quarterAgo.toISOString().split('T')[0] ?? ''
      dateRange.endDate = end
      break
    case 'year':
      const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
      dateRange.startDate = yearAgo.toISOString().split('T')[0] ?? ''
      dateRange.endDate = end
      break
    case 'all':
      dateRange.startDate = ''
      dateRange.endDate = ''
      break
  }
}
</script>

<template>
  <div class="py-8">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
        <div>
          <NuxtLink
            to="/dashboard/earnings"
            class="text-gray-600 dark:text-gray-400 hover:text-primary flex items-center gap-1 mb-2"
          >
            <UIcon name="i-heroicons-arrow-left" class="w-4 h-4" />
            Back to Earnings
          </NuxtLink>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
            Reports
          </h1>
          <p class="text-gray-600 dark:text-gray-400 mt-1">
            Analyze your earnings and export data
          </p>
        </div>
        <UButton
          :to="exportUrl"
          color="primary"
          icon="i-heroicons-arrow-down-tray"
          download
        >
          Export CSV
        </UButton>
      </div>

      <!-- Filters -->
      <UCard class="mb-6">
        <div class="flex flex-wrap gap-4 items-end">
          <!-- Quick date ranges -->
          <div>
            <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Quick Range</p>
            <div class="flex gap-1">
              <UButton
                color="gray"
                variant="soft"
                size="xs"
                @click="setDateRange('week')"
              >
                7 days
              </UButton>
              <UButton
                color="gray"
                variant="soft"
                size="xs"
                @click="setDateRange('month')"
              >
                30 days
              </UButton>
              <UButton
                color="gray"
                variant="soft"
                size="xs"
                @click="setDateRange('quarter')"
              >
                90 days
              </UButton>
              <UButton
                color="gray"
                variant="soft"
                size="xs"
                @click="setDateRange('year')"
              >
                1 year
              </UButton>
              <UButton
                color="gray"
                variant="soft"
                size="xs"
                @click="setDateRange('all')"
              >
                All time
              </UButton>
            </div>
          </div>

          <UFormGroup label="Start Date">
            <UInput
              v-model="dateRange.startDate"
              type="date"
              size="sm"
            />
          </UFormGroup>

          <UFormGroup label="End Date">
            <UInput
              v-model="dateRange.endDate"
              type="date"
              size="sm"
            />
          </UFormGroup>

          <UFormGroup label="Group By">
            <USelectMenu
              v-model="groupBy"
              :options="groupByOptions"
              value-attribute="value"
              option-attribute="label"
              size="sm"
            />
          </UFormGroup>
        </div>
      </UCard>

      <!-- Summary Cards -->
      <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <UCard>
          <div>
            <p class="text-xs text-gray-500 mb-1">Gross Revenue</p>
            <p class="text-xl font-bold text-gray-900 dark:text-white">{{ formatCurrency(summary.grossRevenue) }}</p>
          </div>
        </UCard>

        <UCard>
          <div>
            <p class="text-xs text-gray-500 mb-1">Platform Fees</p>
            <p class="text-xl font-bold text-orange-600">-{{ formatCurrency(summary.platformFees) }}</p>
          </div>
        </UCard>

        <UCard>
          <div>
            <p class="text-xs text-gray-500 mb-1">Refunds</p>
            <p class="text-xl font-bold text-red-600">-{{ formatCurrency(summary.refunds) }}</p>
          </div>
        </UCard>

        <UCard>
          <div>
            <p class="text-xs text-gray-500 mb-1">Net Earnings</p>
            <p class="text-xl font-bold text-green-600">{{ formatCurrency(summary.netEarnings) }}</p>
          </div>
        </UCard>

        <UCard>
          <div>
            <p class="text-xs text-gray-500 mb-1">Transactions</p>
            <p class="text-xl font-bold text-gray-900 dark:text-white">{{ summary.transactionCount }}</p>
          </div>
        </UCard>
      </div>

      <!-- Breakdown Table -->
      <UCard>
        <template #header>
          <h2 class="font-semibold text-gray-900 dark:text-white">
            {{ groupBy === 'event' ? 'Breakdown by Event' : 'Breakdown by Period' }}
          </h2>
        </template>

        <div v-if="pending" class="space-y-4">
          <USkeleton v-for="i in 5" :key="i" class="h-12" />
        </div>

        <div v-else-if="breakdown.length === 0" class="text-center py-12">
          <UIcon name="i-heroicons-chart-bar" class="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p class="text-gray-500">No data for the selected period</p>
        </div>

        <div v-else class="overflow-x-auto -mx-4 sm:mx-0">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead>
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {{ groupBy === 'event' ? 'Event' : 'Period' }}
                </th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Gross
                </th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fees
                </th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Refunds
                </th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Net
                </th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Txns
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
              <tr v-for="(row, index) in breakdown" :key="index" class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td class="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                  {{ groupBy === 'event' ? row.eventTitle : formatPeriod(row.period) }}
                </td>
                <td class="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">
                  {{ formatCurrency(row.grossRevenue) }}
                </td>
                <td class="px-4 py-3 text-sm text-right text-orange-600">
                  -{{ formatCurrency(row.platformFees) }}
                </td>
                <td class="px-4 py-3 text-sm text-right text-red-600">
                  {{ row.refunds > 0 ? '-' : '' }}{{ formatCurrency(row.refunds) }}
                </td>
                <td class="px-4 py-3 text-sm text-right font-medium text-green-600">
                  {{ formatCurrency(row.netEarnings) }}
                </td>
                <td class="px-4 py-3 text-sm text-right text-gray-500">
                  {{ row.transactionCount }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>
    </div>
  </div>
</template>
