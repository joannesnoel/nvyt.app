<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
})

const route = useRoute()
const toast = useToast()
const eventId = computed(() => route.params.id as string)

useHead({ title: 'Orders - Admin - NVYT' })

// Filters
const statusFilter = ref<string | undefined>(undefined)
const searchQuery = ref('')
const page = ref(1)

// Fetch event title for header
const { data: eventResponse } = await useFetch(
  () => `/api/v1/admin/events/${eventId.value}`,
  { watch: [eventId] },
)
const eventTitle = computed(() => eventResponse.value?.data?.event?.title ?? 'Event')

// Fetch orders
const { data: response, pending, refresh } = await useFetch(
  () => `/api/v1/admin/events/${eventId.value}/orders`,
  {
    query: computed(() => ({
      status: statusFilter.value,
      search: searchQuery.value || undefined,
      page: page.value,
      limit: 20,
    })),
    watch: [statusFilter, page, eventId],
  },
)

const orderRows = computed(() => response.value?.data?.orders ?? [])
const meta = computed(() => response.value?.meta)

// Debounced search reset
let searchTimeout: ReturnType<typeof setTimeout>
watch(searchQuery, () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    page.value = 1
    refresh()
  }, 300)
})

watch(statusFilter, () => {
  page.value = 1
})

const statusOptions = [
  { label: 'All', value: undefined },
  { label: 'Paid', value: 'paid' },
  { label: 'Pending', value: 'pending' },
  { label: 'Refunded', value: 'refunded' },
]

function formatCurrency(amount: number | string) {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num)
}

function formatDate(date: string | Date) {
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function getPaymentStatusColor(status: string) {
  switch (status) {
    case 'paid': return 'green'
    case 'pending': return 'yellow'
    case 'refunded': return 'gray'
    default: return 'gray'
  }
}

// ---------- Refund flow (mirrors index.vue) ----------
type OrderRow = {
  id: string
  orderNumber: string
  customerName: string
  customerEmail: string
  subtotalAmount: number
  adminFee: number
  processingFee: number
  totalFees: number
  totalAmount: number
  paymentStatus: string
  paymentMethod: string | null
  paymentProvider: string | null
  refundedAmount: number | null
  ticketCount: number
  createdAt: string | Date
}

const showRefundModal = ref(false)
const refundOrder = ref<OrderRow | null>(null)
const refundAmountChoice = ref<'subtotal' | 'subtotal_admin' | 'total'>('subtotal')
const refundReason = ref('')
const isRefunding = ref(false)

const refundOptions = computed(() => {
  const o = refundOrder.value
  if (!o) return [] as { key: 'subtotal' | 'subtotal_admin' | 'total'; label: string; amount: number; description: string }[]
  const opts: { key: 'subtotal' | 'subtotal_admin' | 'total'; label: string; amount: number; description: string }[] = [
    {
      key: 'subtotal',
      label: `Refund subtotal — ${formatCurrency(o.subtotalAmount)}`,
      amount: o.subtotalAmount,
      description: `Keep processor fee + admin fee (${formatCurrency(o.processingFee + o.adminFee)})`,
    },
  ]
  if (o.adminFee > 0) {
    opts.push({
      key: 'subtotal_admin',
      label: `Refund subtotal + admin fee — ${formatCurrency(o.subtotalAmount + o.adminFee)}`,
      amount: o.subtotalAmount + o.adminFee,
      description: `Keep processor fee only (${formatCurrency(o.processingFee)})`,
    })
  }
  opts.push({
    key: 'total',
    label: `Refund full total — ${formatCurrency(o.totalAmount)}`,
    amount: o.totalAmount,
    description: 'Keep nothing — buyer gets everything back',
  })
  return opts
})

const selectedRefundAmount = computed(() => {
  const opt = refundOptions.value.find(o => o.key === refundAmountChoice.value)
  return opt?.amount ?? 0
})

function canRefundOrder(o: OrderRow): boolean {
  return (
    o.paymentStatus === 'paid' &&
    Number(o.totalAmount) > 0 &&
    o.paymentMethod !== 'external'
  )
}

function openRefundModal(o: OrderRow) {
  refundOrder.value = o
  refundAmountChoice.value = 'subtotal'
  refundReason.value = ''
  showRefundModal.value = true
}

function closeRefundModal() {
  showRefundModal.value = false
  refundOrder.value = null
  refundReason.value = ''
}

async function submitRefund() {
  const o = refundOrder.value
  if (!o) return
  isRefunding.value = true
  try {
    await $fetch(`/api/v1/admin/orders/${o.orderNumber}/refund`, {
      method: 'POST',
      body: {
        amount: selectedRefundAmount.value,
        reason: refundReason.value || undefined,
      },
    })
    toast.add({
      title: 'Refund processed',
      description: `${formatCurrency(selectedRefundAmount.value)} returned to buyer.`,
      color: 'green',
    })
    closeRefundModal()
    await refresh()
  } catch (err: any) {
    toast.add({
      title: 'Refund failed',
      description: err?.data?.message || err?.message || 'Could not process refund',
      color: 'red',
    })
  } finally {
    isRefunding.value = false
  }
}
</script>

<template>
  <div>
    <!-- Header -->
    <div class="mb-6">
      <NuxtLink :to="`/admin/events/${eventId}`" class="text-sm text-gray-500 hover:text-primary inline-flex items-center gap-1">
        <UIcon name="i-heroicons-chevron-left" class="w-4 h-4" />
        Back to event
      </NuxtLink>
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white mt-2">Orders</h1>
      <p class="text-sm text-gray-500">{{ eventTitle }}</p>
    </div>

    <!-- Filters -->
    <UCard class="mb-6">
      <div class="flex flex-col sm:flex-row gap-3">
        <UInput
          v-model="searchQuery"
          icon="i-heroicons-magnifying-glass"
          placeholder="Search by order #, name, or email"
          class="flex-1"
        />
        <USelectMenu
          v-model="statusFilter"
          :options="statusOptions"
          value-attribute="value"
          option-attribute="label"
          placeholder="All statuses"
          class="sm:w-48"
        />
      </div>
    </UCard>

    <!-- Table -->
    <UCard>
      <div v-if="pending" class="py-12 text-center text-sm text-gray-500">Loading orders…</div>

      <div v-else-if="orderRows.length === 0" class="py-12 text-center">
        <UIcon name="i-heroicons-ticket" class="w-10 h-10 text-gray-400 mx-auto mb-2" />
        <p class="text-sm text-gray-500">No orders found</p>
      </div>

      <div v-else class="overflow-x-auto -mx-4 sm:mx-0">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead>
            <tr>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Order #</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th class="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Tickets</th>
              <th class="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
            <tr v-for="order in orderRows" :key="order.id" class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <td class="px-4 py-2 text-sm font-mono text-gray-900 dark:text-white">{{ order.orderNumber }}</td>
              <td class="px-4 py-2">
                <p class="text-sm font-medium text-gray-900 dark:text-white">{{ order.customerName }}</p>
                <p class="text-xs text-gray-500">{{ order.customerEmail }}</p>
              </td>
              <td class="px-4 py-2 text-sm text-right text-gray-900 dark:text-white">
                {{ formatCurrency(order.totalAmount) }}
              </td>
              <td class="px-4 py-2 text-sm text-center text-gray-900 dark:text-white">{{ order.ticketCount }}</td>
              <td class="px-4 py-2 text-center">
                <UBadge :color="getPaymentStatusColor(order.paymentStatus)" variant="soft" size="xs">
                  {{ order.paymentStatus }}
                </UBadge>
              </td>
              <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-500">{{ formatDate(order.createdAt) }}</td>
              <td class="px-4 py-2 text-right">
                <UButton
                  v-if="canRefundOrder(order)"
                  size="xs"
                  color="red"
                  variant="ghost"
                  icon="i-heroicons-arrow-uturn-left"
                  @click="openRefundModal(order)"
                >
                  Refund
                </UButton>
                <span v-else-if="order.paymentStatus === 'refunded' && order.refundedAmount != null" class="text-xs text-gray-500">
                  {{ formatCurrency(order.refundedAmount) }} refunded
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <template v-if="meta && meta.totalPages > 1" #footer>
        <div class="flex items-center justify-between">
          <p class="text-xs text-gray-500">
            Page {{ meta.page }} of {{ meta.totalPages }} · {{ meta.total }} orders
          </p>
          <div class="flex gap-2">
            <UButton size="xs" color="gray" variant="ghost" :disabled="meta.page <= 1" @click="page = page - 1">Prev</UButton>
            <UButton size="xs" color="gray" variant="ghost" :disabled="meta.page >= meta.totalPages" @click="page = page + 1">Next</UButton>
          </div>
        </div>
      </template>
    </UCard>

    <!-- Refund Modal -->
    <UModal v-model="showRefundModal" :ui="{ width: 'sm:max-w-lg' }">
      <UCard v-if="refundOrder">
        <template #header>
          <div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Refund order</h3>
            <p class="text-sm text-gray-500 mt-1 font-mono">{{ refundOrder.orderNumber }}</p>
          </div>
        </template>

        <div class="space-y-4">
          <div class="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3 text-sm space-y-1">
            <div class="flex justify-between">
              <span class="text-gray-500">Customer</span>
              <span class="text-gray-900 dark:text-white">{{ refundOrder.customerName }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500">Subtotal</span>
              <span class="text-gray-900 dark:text-white">{{ formatCurrency(refundOrder.subtotalAmount) }}</span>
            </div>
            <div v-if="refundOrder.adminFee > 0" class="flex justify-between">
              <span class="text-gray-500">Admin fee</span>
              <span class="text-gray-900 dark:text-white">{{ formatCurrency(refundOrder.adminFee) }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500">Processor fee</span>
              <span class="text-gray-900 dark:text-white">{{ formatCurrency(refundOrder.processingFee) }}</span>
            </div>
            <div class="flex justify-between font-semibold pt-1 border-t border-gray-200 dark:border-gray-700">
              <span>Total paid</span>
              <span>{{ formatCurrency(refundOrder.totalAmount) }}</span>
            </div>
            <div class="flex justify-between text-xs text-gray-500 pt-1">
              <span>Provider</span>
              <span>{{ refundOrder.paymentProvider || refundOrder.paymentMethod || '—' }}</span>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-900 dark:text-white mb-2">Refund amount</label>
            <div class="space-y-2">
              <label
                v-for="opt in refundOptions"
                :key="opt.key"
                class="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors"
                :class="refundAmountChoice === opt.key
                  ? 'border-primary bg-primary-50 dark:bg-primary-900/10'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'"
              >
                <input v-model="refundAmountChoice" type="radio" :value="opt.key" class="mt-1">
                <div class="flex-1">
                  <p class="text-sm font-medium text-gray-900 dark:text-white">{{ opt.label }}</p>
                  <p class="text-xs text-gray-500 mt-0.5">{{ opt.description }}</p>
                </div>
              </label>
            </div>
          </div>

          <UFormGroup label="Reason (optional)">
            <UTextarea v-model="refundReason" :rows="2" placeholder="Why is this refund being issued?" />
          </UFormGroup>

          <p class="text-xs text-gray-500">
            This will call {{ refundOrder.paymentProvider === 'paypal' ? 'PayPal' : 'PayMongo' }}, mark all tickets refunded,
            release ticket inventory, and debit the organizer wallet by {{ formatCurrency(refundOrder.subtotalAmount) }}.
          </p>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="ghost" :disabled="isRefunding" @click="closeRefundModal">
              Cancel
            </UButton>
            <UButton color="red" :loading="isRefunding" @click="submitRefund">
              Refund {{ formatCurrency(selectedRefundAmount) }}
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
