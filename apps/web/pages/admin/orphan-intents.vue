<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
})

useHead({ title: 'Orphan Payment Intents - Admin - NVYT' })

interface Orphan {
  orderNumber: string
  paymentIntentId: string
  paymentStatus: string
  totalAmount: string
  customerEmail: string
  paidAt: string | null
  createdAt: string
  eventTitle: string
}

interface ScanResult {
  range: { from: string | null; to: string | null }
  statuses: string[]
  limit: number
  scanned: number
  capped: boolean
  summary: { ok: number; orphans: number; errors: number }
  orphans: Orphan[]
  errors: Array<{ orderNumber: string; error: string }>
}

const today = new Date().toISOString().slice(0, 10)
const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

const from = ref(ninetyDaysAgo)
const to = ref(today)
const includePaid = ref(true)
const includeFailed = ref(true)
const includePending = ref(false)
const includeRefunded = ref(false)
const limit = ref(500)

const running = ref(false)
const result = ref<ScanResult | null>(null)
const error = ref<string | null>(null)

const selectedStatuses = computed(() => {
  const out: string[] = []
  if (includePaid.value) out.push('paid')
  if (includeFailed.value) out.push('failed')
  if (includePending.value) out.push('pending')
  if (includeRefunded.value) out.push('refunded')
  return out
})

async function run() {
  if (selectedStatuses.value.length === 0) {
    error.value = 'Select at least one order status to scan.'
    return
  }
  running.value = true
  error.value = null
  result.value = null
  try {
    const res = await $fetch('/api/v1/admin/troubleshoot/orphan-intents', {
      method: 'POST',
      body: {
        ...(from.value ? { from: from.value } : {}),
        ...(to.value ? { to: to.value } : {}),
        statuses: selectedStatuses.value,
        limit: limit.value,
      },
    })
    result.value = (res as any).data
  } catch (err: any) {
    error.value = err.data?.message || err.message || 'Scan failed'
  } finally {
    running.value = false
  }
}

function formatCurrency(amount: string | number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(Number(amount))
}

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}
</script>

<template>
  <div class="max-w-6xl">
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Orphan Payment Intents</h1>
      <p class="text-gray-600 dark:text-gray-400 mt-1">
        Flags orders whose <code class="text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">paymongo_payment_intent_id</code>
        is not found on the PayMongo side (API returns 404). Read-only — no orders are modified.
      </p>
      <p class="text-amber-600 dark:text-amber-400 text-xs mt-2">
        ⚠ Each order triggers a PayMongo API call with a 200 ms delay. A 500-order scan takes about 2 minutes.
      </p>
    </div>

    <UCard class="mb-6">
      <div class="grid gap-4 md:grid-cols-2">
        <div>
          <label class="block text-xs text-gray-600 dark:text-gray-400 mb-1">From (created_at)</label>
          <UInput v-model="from" type="date" />
        </div>
        <div>
          <label class="block text-xs text-gray-600 dark:text-gray-400 mb-1">To</label>
          <UInput v-model="to" type="date" />
        </div>
        <div class="md:col-span-2">
          <label class="block text-xs text-gray-600 dark:text-gray-400 mb-2">Order statuses</label>
          <div class="flex flex-wrap gap-4">
            <UCheckbox v-model="includePaid" label="paid" />
            <UCheckbox v-model="includeFailed" label="failed" />
            <UCheckbox v-model="includePending" label="pending" />
            <UCheckbox v-model="includeRefunded" label="refunded" />
          </div>
        </div>
        <div>
          <label class="block text-xs text-gray-600 dark:text-gray-400 mb-1">Max orders to scan</label>
          <UInput v-model.number="limit" type="number" min="1" max="2000" />
        </div>
        <div class="flex items-end">
          <UButton color="primary" :loading="running" :disabled="running" @click="run">
            {{ running ? 'Scanning...' : 'Run Scan' }}
          </UButton>
        </div>
      </div>
    </UCard>

    <UCard v-if="error" class="mb-6 border-red-200 dark:border-red-800">
      <p class="text-red-600 dark:text-red-400 text-sm">{{ error }}</p>
    </UCard>

    <template v-if="result">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <AdminStatCard
          title="Scanned"
          :value="result.scanned"
          icon="i-heroicons-magnifying-glass"
          color="gray"
        />
        <AdminStatCard
          title="OK"
          :value="result.summary.ok"
          icon="i-heroicons-check-circle"
          color="green"
        />
        <AdminStatCard
          title="Orphans"
          :value="result.summary.orphans"
          icon="i-heroicons-exclamation-triangle"
          color="red"
        />
        <AdminStatCard
          title="Errors"
          :value="result.summary.errors"
          icon="i-heroicons-x-circle"
          color="yellow"
        />
      </div>

      <UCard v-if="result.capped" class="mb-6">
        <p class="text-amber-600 dark:text-amber-400 text-sm">
          Scan capped at {{ result.limit }} orders. Narrow the date range or raise the limit to see the rest.
        </p>
      </UCard>

      <UCard v-if="result.orphans.length" class="mb-6">
        <template #header>
          <h3 class="text-sm font-semibold text-red-600 dark:text-red-400">
            Orphans ({{ result.orphans.length }})
          </h3>
        </template>
        <div class="overflow-x-auto -mx-4 sm:mx-0">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
            <thead>
              <tr>
                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Order</th>
                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Event</th>
                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Paid at</th>
                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Payment Intent</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
              <tr
                v-for="o in result.orphans"
                :key="o.orderNumber"
                class="hover:bg-gray-50 dark:hover:bg-gray-800/50"
              >
                <td class="px-3 py-2 font-mono text-xs">{{ o.orderNumber }}</td>
                <td class="px-3 py-2">
                  <UBadge :color="o.paymentStatus === 'paid' ? 'green' : 'red'" variant="soft" size="xs">
                    {{ o.paymentStatus }}
                  </UBadge>
                </td>
                <td class="px-3 py-2 text-gray-700 dark:text-gray-300">{{ o.eventTitle }}</td>
                <td class="px-3 py-2 text-gray-700 dark:text-gray-300 text-xs">{{ o.customerEmail }}</td>
                <td class="px-3 py-2 text-right">{{ formatCurrency(o.totalAmount) }}</td>
                <td class="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">{{ formatDate(o.paidAt) }}</td>
                <td class="px-3 py-2 font-mono text-[11px]">{{ o.paymentIntentId }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>

      <UCard v-if="result.errors.length" class="mb-6">
        <template #header>
          <h3 class="text-sm font-semibold text-amber-600 dark:text-amber-400">
            Errors ({{ result.errors.length }})
          </h3>
        </template>
        <div class="space-y-1 text-xs">
          <div v-for="e in result.errors" :key="e.orderNumber">
            <span class="font-mono">{{ e.orderNumber }}</span>
            <span class="text-amber-600 dark:text-amber-400 ml-2">{{ e.error }}</span>
          </div>
        </div>
      </UCard>

      <UCard v-if="!result.orphans.length && !result.errors.length">
        <p class="text-sm text-green-700 dark:text-green-400">
          All scanned orders matched a PayMongo payment intent. No orphans found.
        </p>
      </UCard>
    </template>
  </div>
</template>
