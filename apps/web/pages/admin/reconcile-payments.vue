<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
})

useHead({ title: 'Reconcile Payments - Admin - NVYT' })

const running = ref(false)
const result = ref<any>(null)
const error = ref<string | null>(null)

async function runReconcile() {
  running.value = true
  result.value = null
  error.value = null

  try {
    const res = await $fetch('/api/v1/admin/reconcile-payments', {
      method: 'POST',
    })
    result.value = (res as any).data
  } catch (err: any) {
    error.value = err.data?.message || err.message || 'Failed to reconcile payments'
  } finally {
    running.value = false
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case 'paid': return 'green'
    case 'failed': return 'red'
    case 'skipped': return 'gray'
    default: return 'gray'
  }
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(amount)
}
</script>

<template>
  <div class="max-w-4xl">
    <!-- Header -->
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
        Reconcile Payments
      </h1>
      <p class="text-gray-600 dark:text-gray-400 mt-1">
        Check pending orders against PayMongo and reconcile payment statuses
      </p>
    </div>

      <!-- Action Card -->
      <UCard class="mb-6">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              This will query all orders with <strong>pending</strong> payment status that have a PayMongo payment intent,
              check their actual status via the PayMongo API, and update accordingly.
            </p>
          </div>
          <UButton
            color="primary"
            :loading="running"
            :disabled="running"
            @click="runReconcile"
          >
            {{ running ? 'Reconciling...' : 'Run Reconciliation' }}
          </UButton>
        </div>
      </UCard>

      <!-- Error -->
      <UCard v-if="error" class="mb-6 border-red-200 dark:border-red-800">
        <p class="text-red-600 dark:text-red-400 text-sm">{{ error }}</p>
      </UCard>

      <!-- Results -->
      <template v-if="result">
        <!-- Summary Cards -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <AdminStatCard
            title="Total Checked"
            :value="result.total"
            icon="i-heroicons-document-magnifying-glass"
            color="gray"
          />
          <AdminStatCard
            title="Paid"
            :value="result.reconciled.paid"
            icon="i-heroicons-check-circle"
            color="green"
          />
          <AdminStatCard
            title="Failed"
            :value="result.reconciled.failed"
            icon="i-heroicons-x-circle"
            color="red"
          />
          <AdminStatCard
            title="Skipped"
            :value="result.reconciled.skipped"
            icon="i-heroicons-minus-circle"
            color="gray"
          />
        </div>

        <!-- Errors -->
        <UCard v-if="result.errors?.length" class="mb-6">
          <template #header>
            <h3 class="text-sm font-semibold text-red-600">Errors ({{ result.errors.length }})</h3>
          </template>
          <div class="space-y-2">
            <div v-for="err in result.errors" :key="err.orderNumber" class="text-sm">
              <span class="font-mono text-gray-900 dark:text-white">{{ err.orderNumber }}</span>
              <span class="text-red-500 ml-2">{{ err.error }}</span>
            </div>
          </div>
        </UCard>

        <!-- Details Table -->
        <UCard v-if="result.details?.length">
          <template #header>
            <h3 class="text-sm font-semibold text-gray-900 dark:text-white">Details ({{ result.details.length }})</h3>
          </template>
          <div class="overflow-x-auto -mx-4 sm:mx-0">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead>
                <tr>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order</th>
                  <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                <tr v-for="d in result.details" :key="d.orderNumber" class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td class="px-4 py-3 text-sm font-mono text-gray-900 dark:text-white">{{ d.orderNumber }}</td>
                  <td class="px-4 py-3 text-center">
                    <UBadge :color="getStatusColor(d.status)" variant="soft" size="xs">{{ d.status }}</UBadge>
                  </td>
                  <td class="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">
                    {{ d.amount ? formatCurrency(d.amount) : '-' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </UCard>
      </template>
  </div>
</template>
