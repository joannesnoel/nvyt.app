<script setup lang="ts">
definePageMeta({
  layout: 'default',
})

const route = useRoute()
const eventId = computed(() => route.params.id as string)
const toast = useToast()

// Filters
const statusFilter = ref<string | undefined>(undefined)
const searchQuery = ref('')
const page = ref(1)

// Fetch orders
const { data: response, pending, refresh } = await useFetch(
  () => `/api/v1/events/${eventId.value}/orders`,
  {
    query: computed(() => ({
      status: statusFilter.value,
      search: searchQuery.value || undefined,
      page: page.value,
      limit: 20,
    })),
    watch: [statusFilter, page, eventId],
  }
)

const orders = computed(() => response.value?.data?.orders ?? [])
const stats = computed(() => response.value?.data?.stats ?? {
  totalOrders: 0, paidOrders: 0, pendingOrders: 0, refundedOrders: 0, totalRevenue: 0
})
const meta = computed(() => response.value?.meta)

// Debounced search
let searchTimeout: ReturnType<typeof setTimeout>
watch(searchQuery, () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    page.value = 1
    refresh()
  }, 300)
})

// Refund modal
const showRefundModal = ref(false)
const refundingOrder = ref<any>(null)
const refundReason = ref('')
const isRefunding = ref(false)

function openRefundModal(order: any) {
  refundingOrder.value = order
  refundReason.value = ''
  showRefundModal.value = true
}

async function processRefund() {
  if (!refundingOrder.value) return

  isRefunding.value = true
  try {
    await $fetch(`/api/v1/orders/${refundingOrder.value.orderNumber}/refund`, {
      method: 'POST',
      body: {
        reason: refundReason.value || 'requested_by_customer',
      },
    })
    toast.add({
      title: 'Refund Processed',
      description: `Order ${refundingOrder.value.orderNumber} has been refunded.`,
      color: 'green',
    })
    showRefundModal.value = false
    await refresh()
  } catch (e: any) {
    toast.add({
      title: 'Refund Failed',
      description: e.data?.message || 'Failed to process refund',
      color: 'red',
    })
  } finally {
    isRefunding.value = false
  }
}

// Status helpers
function getStatusColor(status: string) {
  switch (status) {
    case 'paid': return 'green'
    case 'pending': return 'yellow'
    case 'failed': return 'red'
    case 'refunded': return 'gray'
    default: return 'gray'
  }
}

function formatCurrency(amount: string | number) {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  if (num === 0) return 'Free'
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(num)
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const statusOptions = [
  { label: 'All', value: undefined },
  { label: 'Paid', value: 'paid' },
  { label: 'Pending', value: 'pending' },
  { label: 'Failed', value: 'failed' },
  { label: 'Refunded', value: 'refunded' },
]
</script>

<template>
  <div class="py-8">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <div class="flex items-center justify-between mb-8">
        <div>
          <NuxtLink
            :to="`/dashboard/events/${eventId}`"
            class="text-gray-600 dark:text-gray-400 hover:text-primary flex items-center gap-1 mb-2"
          >
            <UIcon name="i-heroicons-arrow-left" class="w-4 h-4" />
            Back to Event
          </NuxtLink>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Orders</h1>
        </div>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <UCard class="text-center">
          <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ stats.totalOrders }}</p>
          <p class="text-sm text-gray-500">Total Orders</p>
        </UCard>
        <UCard class="text-center">
          <p class="text-2xl font-bold text-green-600">{{ stats.paidOrders }}</p>
          <p class="text-sm text-gray-500">Paid</p>
        </UCard>
        <UCard class="text-center">
          <p class="text-2xl font-bold text-yellow-600">{{ stats.pendingOrders }}</p>
          <p class="text-sm text-gray-500">Pending</p>
        </UCard>
        <UCard class="text-center">
          <p class="text-2xl font-bold text-gray-600">{{ stats.refundedOrders }}</p>
          <p class="text-sm text-gray-500">Refunded</p>
        </UCard>
        <UCard class="text-center">
          <p class="text-2xl font-bold text-primary">{{ formatCurrency(stats.totalRevenue) }}</p>
          <p class="text-sm text-gray-500">Revenue</p>
        </UCard>
      </div>

      <!-- Filters -->
      <div class="flex flex-col md:flex-row gap-4 mb-6">
        <UInput
          v-model="searchQuery"
          placeholder="Search by order number, name or email..."
          icon="i-heroicons-magnifying-glass"
          class="md:w-80"
        />

        <USelectMenu
          v-model="statusFilter"
          :options="statusOptions"
          value-attribute="value"
          option-attribute="label"
          placeholder="Filter by status"
          class="w-40"
        />
      </div>

      <!-- Orders Table -->
      <UCard>
        <div v-if="pending" class="space-y-4">
          <USkeleton v-for="i in 5" :key="i" class="h-16 w-full" />
        </div>

        <div v-else-if="orders.length === 0" class="text-center py-12">
          <UIcon name="i-heroicons-shopping-cart" class="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p class="text-gray-600 dark:text-gray-400">No orders found</p>
        </div>

        <!-- Mobile Card View -->
        <div v-else class="md:hidden space-y-4">
          <div
            v-for="order in orders"
            :key="order.id"
            class="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
          >
            <div class="flex items-start justify-between mb-3">
              <div>
                <p class="font-mono text-sm font-medium text-gray-900 dark:text-white">
                  {{ order.orderNumber }}
                </p>
                <p class="text-xs text-gray-500 mt-1">{{ formatDate(order.createdAt) }}</p>
              </div>
              <UBadge :color="getStatusColor(order.paymentStatus)" variant="soft">
                {{ order.paymentStatus }}
              </UBadge>
            </div>

            <div class="space-y-2 mb-3">
              <div class="flex justify-between">
                <span class="text-sm text-gray-500">Customer</span>
                <span class="text-sm font-medium text-gray-900 dark:text-white">{{ order.customer?.name }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-sm text-gray-500">Email</span>
                <span class="text-sm text-gray-600 dark:text-gray-400 truncate ml-2 max-w-[180px]">{{ order.customer?.email }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-sm text-gray-500">Tickets</span>
                <span class="text-sm text-gray-900 dark:text-white">{{ order.ticketCount }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-sm text-gray-500">Amount</span>
                <span class="text-sm font-medium text-primary">{{ formatCurrency(order.totalAmount) }}</span>
              </div>
            </div>

            <div class="flex flex-wrap gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
              <UButton
                color="gray"
                variant="outline"
                size="sm"
                @click="navigateTo(`/orders/${order.orderNumber}`)"
              >
                View Details
              </UButton>
              <UButton
                v-if="order.paymentStatus === 'paid'"
                color="red"
                variant="outline"
                size="sm"
                @click="openRefundModal(order)"
              >
                Refund
              </UButton>
            </div>
          </div>
        </div>

        <!-- Desktop Table View -->
        <div class="hidden md:block overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="border-b border-gray-200 dark:border-gray-700">
                <th class="py-3 px-4 text-left text-sm font-medium text-gray-500">Order</th>
                <th class="py-3 px-4 text-left text-sm font-medium text-gray-500">Customer</th>
                <th class="py-3 px-4 text-left text-sm font-medium text-gray-500">Tickets</th>
                <th class="py-3 px-4 text-left text-sm font-medium text-gray-500">Amount</th>
                <th class="py-3 px-4 text-left text-sm font-medium text-gray-500">Status</th>
                <th class="py-3 px-4 text-left text-sm font-medium text-gray-500">Date</th>
                <th class="py-3 px-4 text-right text-sm font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="order in orders"
                :key="order.id"
                class="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
              >
                <td class="py-3 px-4">
                  <p class="font-mono text-sm font-medium text-gray-900 dark:text-white">
                    {{ order.orderNumber }}
                  </p>
                </td>
                <td class="py-3 px-4">
                  <div>
                    <p class="font-medium text-gray-900 dark:text-white">
                      {{ order.customer?.name }}
                    </p>
                    <p class="text-sm text-gray-500">{{ order.customer?.email }}</p>
                  </div>
                </td>
                <td class="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                  {{ order.ticketCount }} ticket{{ order.ticketCount !== 1 ? 's' : '' }}
                </td>
                <td class="py-3 px-4">
                  <span class="font-medium text-gray-900 dark:text-white">
                    {{ formatCurrency(order.totalAmount) }}
                  </span>
                </td>
                <td class="py-3 px-4">
                  <UBadge :color="getStatusColor(order.paymentStatus)" variant="soft">
                    {{ order.paymentStatus }}
                  </UBadge>
                </td>
                <td class="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                  {{ formatDate(order.createdAt) }}
                </td>
                <td class="py-3 px-4 text-right">
                  <UDropdown
                    :items="[[
                      {
                        label: 'View Details',
                        icon: 'i-heroicons-eye',
                        click: () => navigateTo(`/orders/${order.orderNumber}`)
                      },
                      {
                        label: 'Refund',
                        icon: 'i-heroicons-arrow-uturn-left',
                        disabled: order.paymentStatus !== 'paid',
                        click: () => openRefundModal(order)
                      },
                    ]]"
                  >
                    <UButton
                      color="gray"
                      variant="ghost"
                      icon="i-heroicons-ellipsis-vertical"
                    />
                  </UDropdown>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div v-if="meta && meta.totalPages > 1" class="flex justify-center mt-6">
          <UPagination
            v-model="page"
            :page-count="meta.limit"
            :total="meta.total"
          />
        </div>
      </UCard>
    </div>

    <!-- Refund Modal -->
    <UModal v-model="showRefundModal">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
            Process Refund
          </h3>
        </template>

        <div v-if="refundingOrder" class="space-y-4">
          <UAlert
            color="yellow"
            icon="i-heroicons-exclamation-triangle"
            title="This action cannot be undone"
            description="The customer will be refunded to their original payment method."
          />

          <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
            <div class="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p class="text-gray-500">Order Number</p>
                <p class="font-mono font-medium text-gray-900 dark:text-white">
                  {{ refundingOrder.orderNumber }}
                </p>
              </div>
              <div>
                <p class="text-gray-500">Amount</p>
                <p class="font-medium text-gray-900 dark:text-white">
                  {{ formatCurrency(refundingOrder.totalAmount) }}
                </p>
              </div>
              <div>
                <p class="text-gray-500">Customer</p>
                <p class="font-medium text-gray-900 dark:text-white">
                  {{ refundingOrder.customer?.name }}
                </p>
              </div>
              <div>
                <p class="text-gray-500">Tickets</p>
                <p class="font-medium text-gray-900 dark:text-white">
                  {{ refundingOrder.ticketCount }} ticket{{ refundingOrder.ticketCount !== 1 ? 's' : '' }}
                </p>
              </div>
            </div>
          </div>

          <UFormGroup label="Reason (optional)">
            <UTextarea
              v-model="refundReason"
              placeholder="Enter a reason for the refund..."
              :rows="2"
            />
          </UFormGroup>
        </div>

        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton
              color="gray"
              variant="outline"
              @click="showRefundModal = false"
            >
              Cancel
            </UButton>
            <UButton
              color="red"
              :loading="isRefunding"
              @click="processRefund"
            >
              Process Refund
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
