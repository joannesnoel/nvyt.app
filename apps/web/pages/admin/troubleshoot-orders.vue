<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
})

useHead({ title: 'Troubleshoot Orders - Admin - NVYT' })

interface FailedOrder {
  orderNumber: string
  paymentIntentId: string
  totalAmount: string
  customerName: string
  customerEmail: string
  paymentMethod: string | null
  createdAt: string
  updatedAt: string
  eventTitle: string
  eventSlug: string
}

interface CheckResult {
  paymentIntentExists: boolean
  paymentIntentStatus: string | null
  paymentIntentAmount: number | null
  payments: Array<{ id: string; status: string; amount: number; sourceType: string | null }>
  orderStatus: string
}

interface MarkPaidResult {
  alreadyPaid: boolean
  walletRecorded: boolean
  emailSent: boolean
  warnings: string[]
  paymentIntentStatus: string | null
}

const today = new Date().toISOString().slice(0, 10)
const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

const from = ref<string>(ninetyDaysAgo)
const to = ref<string>(today)
const search = ref<string>('')
const loading = ref(false)
const orders = ref<FailedOrder[]>([])
const note = ref<string | null>(null)
const error = ref<string | null>(null)
const hasLoaded = ref(false)

const checks = ref<Record<string, { loading: boolean; result?: CheckResult; error?: string }>>({})
const marks = ref<Record<string, { loading: boolean; result?: MarkPaidResult; error?: string }>>({})

async function load() {
  loading.value = true
  error.value = null
  note.value = null
  checks.value = {}
  marks.value = {}

  try {
    const res = await $fetch('/api/v1/admin/troubleshoot/failed-orders', {
      query: {
        ...(from.value ? { from: from.value } : {}),
        ...(to.value ? { to: to.value } : {}),
        ...(search.value.trim() ? { search: search.value.trim() } : {}),
      },
    })
    const data = (res as any).data
    orders.value = data.orders
    note.value = data.note
    hasLoaded.value = true
  } catch (err: any) {
    error.value = err.data?.message || err.message || 'Failed to load orders'
  } finally {
    loading.value = false
  }
}

// Debounced auto-refresh when the user types in the search box (only after
// the first manual load so we don't auto-trigger a wide scan on page open).
let searchTimeout: ReturnType<typeof setTimeout> | null = null
watch(search, () => {
  if (!hasLoaded.value) return
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    load()
  }, 300)
})

async function check(orderNumber: string) {
  checks.value[orderNumber] = { loading: true }
  try {
    const res = await $fetch('/api/v1/admin/troubleshoot/check-intent', {
      method: 'POST',
      body: { orderNumber },
    })
    checks.value[orderNumber] = { loading: false, result: (res as any).data }
  } catch (err: any) {
    checks.value[orderNumber] = {
      loading: false,
      error: err.data?.message || err.message || 'Check failed',
    }
  }
}

async function markPaid(orderNumber: string, force = false) {
  if (!force) {
    const ok = window.confirm(
      `Mark order ${orderNumber} as paid? This will:\n` +
        `• flip the order status to paid\n` +
        `• confirm its tickets\n` +
        `• record an organizer wallet transaction (idempotent)\n` +
        `• send a payment confirmation email`
    )
    if (!ok) return
  }
  marks.value[orderNumber] = { loading: true }
  try {
    const res = await $fetch('/api/v1/admin/troubleshoot/mark-paid', {
      method: 'POST',
      body: { orderNumber, force },
    })
    marks.value[orderNumber] = { loading: false, result: (res as any).data }
    // Remove the row on success
    const idx = orders.value.findIndex((o) => o.orderNumber === orderNumber)
    if (idx >= 0) orders.value.splice(idx, 1)
  } catch (err: any) {
    marks.value[orderNumber] = {
      loading: false,
      error: err.data?.message || err.message || 'Mark-paid failed',
    }
  }
}

function formatCurrency(amount: string | number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(Number(amount))
}

function formatDate(d: string) {
  return new Date(d).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function intentStatusColor(status: string | null | undefined) {
  switch (status) {
    case 'succeeded':
      return 'green'
    case 'failed':
      return 'red'
    case 'processing':
    case 'awaiting_next_action':
    case 'awaiting_payment_method':
      return 'amber'
    default:
      return 'gray'
  }
}
</script>

<template>
  <div class="max-w-6xl">
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Troubleshoot Failed Orders</h1>
      <p class="text-gray-600 dark:text-gray-400 mt-1">
        Find PayMongo orders marked <strong>failed</strong> in our DB that may have actually succeeded on PayMongo's side
        (webhook race / WAF block / browser closed before return). Check the live PayMongo state and mark them paid when appropriate.
      </p>
    </div>

    <UCard class="mb-6">
      <div class="flex flex-wrap gap-4 items-end">
        <div>
          <label class="block text-xs text-gray-600 dark:text-gray-400 mb-1">From (created_at)</label>
          <UInput v-model="from" type="date" />
        </div>
        <div>
          <label class="block text-xs text-gray-600 dark:text-gray-400 mb-1">To</label>
          <UInput v-model="to" type="date" />
        </div>
        <div class="flex-1 min-w-[16rem]">
          <label class="block text-xs text-gray-600 dark:text-gray-400 mb-1">
            Search (order #, name, email, event, pi_*)
          </label>
          <UInput
            v-model="search"
            placeholder="Search…"
            icon="i-heroicons-magnifying-glass"
          />
        </div>
        <UButton color="primary" :loading="loading" :disabled="loading" @click="load">
          {{ loading ? 'Loading...' : 'Load Failed Orders' }}
        </UButton>
      </div>
      <p v-if="hasLoaded" class="text-xs text-gray-500 dark:text-gray-400 mt-3">
        Search updates results live. Date changes apply on the next Load.
      </p>
    </UCard>

    <UCard v-if="error" class="mb-6 border-red-200 dark:border-red-800">
      <p class="text-red-600 dark:text-red-400 text-sm">{{ error }}</p>
    </UCard>

    <UCard v-if="note" class="mb-6">
      <p class="text-amber-600 dark:text-amber-400 text-sm">{{ note }}</p>
    </UCard>

    <UCard v-if="orders.length">
      <template #header>
        <h3 class="text-sm font-semibold text-gray-900 dark:text-white">
          {{ orders.length }} failed order{{ orders.length === 1 ? '' : 's' }} with PayMongo intent
        </h3>
      </template>
      <div class="space-y-3">
        <div
          v-for="o in orders"
          :key="o.orderNumber"
          class="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
        >
          <div class="flex flex-wrap justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <NuxtLink
                  :to="`/admin/events`"
                  class="font-mono text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  {{ o.orderNumber }}
                </NuxtLink>
                <UBadge color="red" variant="soft" size="xs">failed</UBadge>
              </div>
              <div class="text-sm text-gray-700 dark:text-gray-300 mt-1">
                {{ o.eventTitle }}
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {{ o.customerName }} &middot; {{ o.customerEmail }}
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Created {{ formatDate(o.createdAt) }} &middot; pi:
                <span class="font-mono">{{ o.paymentIntentId }}</span>
              </div>
            </div>
            <div class="text-right">
              <div class="text-base font-semibold text-gray-900 dark:text-white">
                {{ formatCurrency(o.totalAmount) }}
              </div>
              <div class="flex gap-2 mt-2 justify-end">
                <UButton
                  size="xs"
                  color="gray"
                  variant="soft"
                  :loading="checks[o.orderNumber]?.loading"
                  @click="check(o.orderNumber)"
                >
                  Check PayMongo
                </UButton>
                <UButton
                  v-if="checks[o.orderNumber]?.result?.paymentIntentStatus === 'succeeded'"
                  size="xs"
                  color="green"
                  :loading="marks[o.orderNumber]?.loading"
                  @click="markPaid(o.orderNumber)"
                >
                  Mark as paid
                </UButton>
              </div>
            </div>
          </div>

          <div
            v-if="checks[o.orderNumber]"
            class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 text-xs"
          >
            <div v-if="checks[o.orderNumber]?.error" class="text-red-600 dark:text-red-400">
              Check error: {{ checks[o.orderNumber]?.error }}
            </div>
            <div v-else-if="checks[o.orderNumber]?.result">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-gray-500 dark:text-gray-400">PayMongo intent status:</span>
                <UBadge
                  v-if="checks[o.orderNumber]?.result?.paymentIntentExists"
                  :color="intentStatusColor(checks[o.orderNumber]?.result?.paymentIntentStatus)"
                  variant="soft"
                  size="xs"
                >
                  {{ checks[o.orderNumber]?.result?.paymentIntentStatus }}
                </UBadge>
                <UBadge v-else color="gray" variant="soft" size="xs">not found (404)</UBadge>
                <span
                  v-if="checks[o.orderNumber]?.result?.paymentIntentAmount != null"
                  class="text-gray-500 dark:text-gray-400"
                >
                  amount: ₱{{ ((checks[o.orderNumber]?.result?.paymentIntentAmount ?? 0) / 100).toFixed(2) }}
                </span>
              </div>
              <div
                v-if="checks[o.orderNumber]?.result?.payments?.length"
                class="mt-2 font-mono text-[11px] space-y-1"
              >
                <div
                  v-for="p in checks[o.orderNumber]?.result?.payments"
                  :key="p.id"
                  class="text-gray-700 dark:text-gray-300"
                >
                  {{ p.id }} &middot; {{ p.status }} &middot; ₱{{ (p.amount / 100).toFixed(2) }}
                  <span v-if="p.sourceType"> &middot; {{ p.sourceType }}</span>
                </div>
              </div>
              <div
                v-if="checks[o.orderNumber]?.result?.paymentIntentStatus !== 'succeeded'"
                class="mt-2 text-gray-500 dark:text-gray-400"
              >
                PayMongo does not currently report this intent as succeeded. Mark-as-paid is disabled
                unless you force it.
              </div>
            </div>
          </div>

          <div
            v-if="marks[o.orderNumber]?.error"
            class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 text-xs text-red-600 dark:text-red-400"
          >
            Mark-paid error: {{ marks[o.orderNumber]?.error }}
          </div>
          <div
            v-else-if="marks[o.orderNumber]?.result"
            class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 text-xs text-green-700 dark:text-green-400"
          >
            Marked paid. Wallet recorded: {{ marks[o.orderNumber]?.result?.walletRecorded ? 'yes' : 'no' }} &middot;
            Email sent: {{ marks[o.orderNumber]?.result?.emailSent ? 'yes' : 'no' }}
            <span
              v-if="marks[o.orderNumber]?.result?.warnings?.length"
              class="text-amber-600 dark:text-amber-400"
            >
              &middot; warnings: {{ marks[o.orderNumber]?.result?.warnings.join('; ') }}
            </span>
          </div>
        </div>
      </div>
    </UCard>

    <UCard v-else-if="!loading && !error">
      <p class="text-sm text-gray-500 dark:text-gray-400">
        No failed PayMongo orders with a payment intent in this range. Adjust the dates and load again.
      </p>
    </UCard>
  </div>
</template>
