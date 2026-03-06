<script setup lang="ts">
definePageMeta({
  layout: 'default',
})

useHead({ title: 'Transactions - NVYT' })

const route = useRoute()
const router = useRouter()

// Filters
const filters = reactive({
  page: parseInt(route.query.page as string) || 1,
  limit: 20,
  type: (route.query.type as string) || '',
  startDate: (route.query.startDate as string) || '',
  endDate: (route.query.endDate as string) || '',
})

// Build query params
const queryParams = computed(() => {
  const params: Record<string, string | number> = {
    page: filters.page,
    limit: filters.limit,
  }
  if (filters.type) params.type = filters.type
  if (filters.startDate) params.startDate = filters.startDate
  if (filters.endDate) params.endDate = filters.endDate
  return params
})

// Fetch transactions
const { data, pending, refresh } = await useFetch('/api/v1/transactions', {
  query: queryParams,
  watch: [queryParams],
})

const transactions = computed(() => data.value?.data?.transactions || [])
const pagination = computed(() => ({
  page: data.value?.meta?.page ?? 1,
  limit: data.value?.meta?.limit ?? 20,
  total: data.value?.meta?.total ?? 0,
  totalPages: data.value?.meta?.totalPages ?? 1,
}))

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
    hour: 'numeric',
    minute: '2-digit',
  })
}

function getTypeLabel(type: string) {
  switch (type) {
    case 'payment_received':
      return 'Payment'
    case 'refund':
      return 'Refund'
    case 'payout':
      return 'Payout'
    case 'platform_fee':
      return 'Fee'
    default:
      return type
  }
}

function getTypeColor(type: string) {
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

const typeOptions = [
  { label: 'All Types', value: '' },
  { label: 'Payment Received', value: 'payment_received' },
  { label: 'Refund', value: 'refund' },
  { label: 'Payout', value: 'payout' },
  { label: 'Platform Fee', value: 'platform_fee' },
]

function applyFilters() {
  filters.page = 1
  router.push({
    query: {
      ...(filters.type && { type: filters.type }),
      ...(filters.startDate && { startDate: filters.startDate }),
      ...(filters.endDate && { endDate: filters.endDate }),
    },
  })
}

function clearFilters() {
  filters.type = ''
  filters.startDate = ''
  filters.endDate = ''
  filters.page = 1
  router.push({ query: {} })
}

function goToPage(page: number) {
  filters.page = page
  router.push({
    query: {
      ...route.query,
      page: page.toString(),
    },
  })
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
            Transactions
          </h1>
          <p class="text-gray-600 dark:text-gray-400 mt-1">
            View all your financial transactions
          </p>
        </div>
      </div>

      <!-- Filters -->
      <UCard class="mb-6">
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <UFormGroup label="Type">
            <USelectMenu
              v-model="filters.type"
              :options="typeOptions"
              value-attribute="value"
              option-attribute="label"
            />
          </UFormGroup>

          <UFormGroup label="Start Date">
            <UInput
              v-model="filters.startDate"
              type="date"
            />
          </UFormGroup>

          <UFormGroup label="End Date">
            <UInput
              v-model="filters.endDate"
              type="date"
            />
          </UFormGroup>

          <div class="flex items-end gap-2">
            <UButton
              color="primary"
              @click="applyFilters"
            >
              Apply
            </UButton>
            <UButton
              color="gray"
              variant="outline"
              @click="clearFilters"
            >
              Clear
            </UButton>
          </div>
        </div>
      </UCard>

      <!-- Transactions Table -->
      <UCard>
        <div v-if="pending" class="space-y-4">
          <USkeleton v-for="i in 5" :key="i" class="h-16" />
        </div>

        <div v-else-if="transactions.length === 0" class="text-center py-12">
          <UIcon name="i-heroicons-document-text" class="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p class="text-gray-500">No transactions found</p>
        </div>

        <div v-else>
          <div class="overflow-x-auto -mx-4 sm:mx-0">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead>
                <tr>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fee
                  </th>
                  <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Net
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                <tr v-for="tx in transactions" :key="tx.id" class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {{ formatDate(tx.createdAt) }}
                  </td>
                  <td class="px-4 py-3 whitespace-nowrap">
                    <UBadge :color="getTypeColor(tx.type)" variant="soft" size="xs">
                      {{ getTypeLabel(tx.type) }}
                    </UBadge>
                  </td>
                  <td class="px-4 py-3">
                    <p class="text-sm text-gray-900 dark:text-white truncate max-w-xs">
                      {{ tx.description || tx.eventTitle || '-' }}
                    </p>
                  </td>
                  <td class="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white">
                    {{ formatCurrency(tx.amount) }}
                  </td>
                  <td class="px-4 py-3 whitespace-nowrap text-sm text-right text-orange-600">
                    {{ parseFloat(tx.fee ?? '0') > 0 ? '-' : '' }}{{ formatCurrency(tx.fee) }}
                  </td>
                  <td
                    class="px-4 py-3 whitespace-nowrap text-sm text-right font-medium"
                    :class="{
                      'text-green-600': parseFloat(tx.netAmount ?? '0') > 0,
                      'text-red-600': parseFloat(tx.netAmount ?? '0') < 0,
                      'text-gray-600': parseFloat(tx.netAmount ?? '0') === 0,
                    }"
                  >
                    {{ parseFloat(tx.netAmount ?? '0') >= 0 ? '+' : '' }}{{ formatCurrency(tx.netAmount) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          <div v-if="pagination.totalPages > 1" class="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700 mt-4">
            <p class="text-sm text-gray-500">
              Showing {{ (pagination.page - 1) * pagination.limit + 1 }} to
              {{ Math.min(pagination.page * pagination.limit, pagination.total) }} of
              {{ pagination.total }}
            </p>
            <div class="flex gap-2">
              <UButton
                color="gray"
                variant="outline"
                size="sm"
                :disabled="pagination.page <= 1"
                @click="goToPage(pagination.page - 1)"
              >
                Previous
              </UButton>
              <UButton
                color="gray"
                variant="outline"
                size="sm"
                :disabled="pagination.page >= pagination.totalPages"
                @click="goToPage(pagination.page + 1)"
              >
                Next
              </UButton>
            </div>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>
