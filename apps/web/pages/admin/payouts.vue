<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
})

useHead({ title: 'Payouts - Admin - NVYT' })

const route = useRoute()

// Filters
const filters = reactive({
  page: parseInt(route.query.page as string) || 1,
  limit: 20,
  status: (route.query.status as string) || '',
})

// Build query params
const queryParams = computed(() => {
  const params: Record<string, string | number> = {
    page: filters.page,
    limit: filters.limit,
  }
  if (filters.status) params.status = filters.status
  return params
})

// Fetch payouts
const { data, pending, refresh } = await useFetch('/api/v1/admin/payouts', {
  query: queryParams,
  watch: [queryParams],
})

const payouts = computed(() => data.value?.data?.payouts || [])
const stats = computed(() => data.value?.data?.stats || { pending: { count: 0, amount: 0 }, processing: { count: 0, amount: 0 }, completed: { count: 0, amount: 0 } })
const pagination = computed(() => ({
  page: data.value?.meta?.page ?? 1,
  limit: data.value?.meta?.limit ?? 20,
  total: data.value?.meta?.total ?? 0,
  totalPages: data.value?.meta?.totalPages ?? 1,
}))

// Modal state
const showModal = ref(false)
const selectedPayout = ref<any>(null)
const modalAction = ref<'approve' | 'reject' | null>(null)
const rejectionReason = ref('')
const notes = ref('')
const processing = ref(false)

// Reconcile wallets
const toast = useToast()
const reconciling = ref(false)
const reconcileResult = ref<any>(null)

async function reconcileWallets() {
  reconciling.value = true
  reconcileResult.value = null
  try {
    const result = await $fetch('/api/v1/admin/reconcile-wallets', { method: 'POST' })
    reconcileResult.value = (result as any).data?.summary
    toast.add({
      title: 'Wallets Reconciled',
      description: `${reconcileResult.value.duplicatesRemoved} duplicates removed, ${reconcileResult.value.transactionsCreated} created, ${reconcileResult.value.transactionsFixed} fixed, ${reconcileResult.value.walletsRecalculated} wallets recalculated`,
      color: 'green',
    })
  } catch (error: any) {
    toast.add({
      title: 'Reconciliation Failed',
      description: error.data?.message || 'Failed to reconcile wallets',
      color: 'red',
    })
  } finally {
    reconciling.value = false
  }
}

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

function getStatusColor(status: string) {
  switch (status) {
    case 'pending':
      return 'yellow'
    case 'processing':
      return 'blue'
    case 'completed':
      return 'green'
    case 'rejected':
      return 'red'
    default:
      return 'gray'
  }
}

function openActionModal(payout: any, action: 'approve' | 'reject') {
  selectedPayout.value = payout
  modalAction.value = action
  rejectionReason.value = ''
  notes.value = ''
  showModal.value = true
}

async function processAction() {
  if (!selectedPayout.value || !modalAction.value) return

  processing.value = true
  try {
    const status = modalAction.value === 'approve' ? 'completed' : 'rejected'

    await $fetch(`/api/v1/admin/payouts/${selectedPayout.value.id}`, {
      method: 'PATCH',
      body: {
        status,
        rejectionReason: status === 'rejected' ? rejectionReason.value : undefined,
        notes: notes.value || undefined,
      },
    })

    showModal.value = false
    refresh()
  } catch (error: any) {
    console.error('Error processing payout:', error)
    alert(error.data?.message || 'Failed to process payout')
  } finally {
    processing.value = false
  }
}

const statusOptions = [
  { label: 'All Statuses', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'Processing', value: 'processing' },
  { label: 'Completed', value: 'completed' },
  { label: 'Rejected', value: 'rejected' },
]
</script>

<template>
  <div class="py-8">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <div class="flex items-start justify-between mb-8">
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
            Admin: Payout Management
          </h1>
          <p class="text-gray-600 dark:text-gray-400 mt-1">
            Review and process payout requests
          </p>
        </div>
        <UButton
          color="gray"
          variant="outline"
          icon="i-heroicons-arrow-path"
          :loading="reconciling"
          @click="reconcileWallets"
        >
          Reconcile Wallets
        </UButton>
      </div>

      <!-- Stats Cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <UCard>
          <div>
            <p class="text-xs text-yellow-600 font-medium mb-1">Pending</p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ stats.pending.count }}</p>
            <p class="text-sm text-gray-500">{{ formatCurrency(stats.pending.amount) }}</p>
          </div>
        </UCard>

        <UCard>
          <div>
            <p class="text-xs text-blue-600 font-medium mb-1">Processing</p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ stats.processing.count }}</p>
            <p class="text-sm text-gray-500">{{ formatCurrency(stats.processing.amount) }}</p>
          </div>
        </UCard>

        <UCard>
          <div>
            <p class="text-xs text-green-600 font-medium mb-1">Completed</p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ stats.completed.count }}</p>
            <p class="text-sm text-gray-500">{{ formatCurrency(stats.completed.amount) }}</p>
          </div>
        </UCard>
      </div>

      <!-- Filters -->
      <UCard class="mb-6">
        <div class="flex gap-4 items-end">
          <UFormGroup label="Status">
            <USelectMenu
              v-model="filters.status"
              :options="statusOptions"
              value-attribute="value"
              option-attribute="label"
            />
          </UFormGroup>
        </div>
      </UCard>

      <!-- Payouts Table -->
      <UCard>
        <div v-if="pending" class="space-y-4">
          <USkeleton v-for="i in 5" :key="i" class="h-16" />
        </div>

        <div v-else-if="payouts.length === 0" class="text-center py-12">
          <UIcon name="i-heroicons-banknotes" class="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p class="text-gray-500">No payout requests found</p>
        </div>

        <div v-else class="overflow-x-auto -mx-4 sm:mx-0">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead>
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Requested
                </th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Bank Details
                </th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
              <tr v-for="payout in payouts" :key="payout.id" class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                  {{ formatDate(payout.requestedAt) }}
                </td>
                <td class="px-4 py-3">
                  <p class="text-sm font-medium text-gray-900 dark:text-white">{{ payout.userName }}</p>
                  <p class="text-xs text-gray-500">{{ payout.userEmail }}</p>
                </td>
                <td class="px-4 py-3">
                  <p class="text-sm text-gray-900 dark:text-white">{{ payout.bankName }}</p>
                  <p class="text-xs text-gray-500">{{ payout.accountName }}</p>
                  <p class="text-xs text-gray-500 font-mono">{{ payout.accountNumber }}</p>
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-gray-900 dark:text-white">
                  {{ formatCurrency(payout.amount) }}
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-center">
                  <UBadge :color="getStatusColor(payout.status)" variant="soft" size="xs">
                    {{ payout.status }}
                  </UBadge>
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-center">
                  <div v-if="payout.status === 'pending'" class="flex gap-2 justify-center">
                    <UButton
                      color="green"
                      variant="soft"
                      size="xs"
                      @click="openActionModal(payout, 'approve')"
                    >
                      Approve
                    </UButton>
                    <UButton
                      color="red"
                      variant="soft"
                      size="xs"
                      @click="openActionModal(payout, 'reject')"
                    >
                      Reject
                    </UButton>
                  </div>
                  <span v-else-if="payout.status === 'rejected'" class="text-xs text-red-500">
                    {{ payout.rejectionReason }}
                  </span>
                  <span v-else-if="payout.processedAt" class="text-xs text-gray-500">
                    {{ formatDate(payout.processedAt) }}
                  </span>
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
              @click="filters.page = pagination.page - 1"
            >
              Previous
            </UButton>
            <UButton
              color="gray"
              variant="outline"
              size="sm"
              :disabled="pagination.page >= pagination.totalPages"
              @click="filters.page = pagination.page + 1"
            >
              Next
            </UButton>
          </div>
        </div>
      </UCard>

      <!-- Action Modal -->
      <UModal v-model="showModal">
        <UCard>
          <template #header>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              {{ modalAction === 'approve' ? 'Approve Payout' : 'Reject Payout' }}
            </h3>
          </template>

          <div class="space-y-4">
            <div v-if="selectedPayout" class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <div class="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p class="text-gray-500">User</p>
                  <p class="font-medium text-gray-900 dark:text-white">{{ selectedPayout.userName }}</p>
                </div>
                <div>
                  <p class="text-gray-500">Amount</p>
                  <p class="font-medium text-gray-900 dark:text-white">{{ formatCurrency(selectedPayout.amount) }}</p>
                </div>
                <div class="col-span-2">
                  <p class="text-gray-500">Bank Details</p>
                  <p class="font-medium text-gray-900 dark:text-white">
                    {{ selectedPayout.bankName }} - {{ selectedPayout.accountName }}
                  </p>
                  <p class="font-mono text-gray-600 dark:text-gray-400">{{ selectedPayout.accountNumber }}</p>
                </div>
              </div>
            </div>

            <UFormGroup v-if="modalAction === 'reject'" label="Rejection Reason" required>
              <UTextarea
                v-model="rejectionReason"
                placeholder="Explain why this payout is being rejected..."
                :rows="3"
              />
            </UFormGroup>

            <UFormGroup label="Notes (optional)">
              <UTextarea
                v-model="notes"
                placeholder="Any additional notes..."
                :rows="2"
              />
            </UFormGroup>

            <div v-if="modalAction === 'approve'" class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <p class="text-sm text-yellow-800 dark:text-yellow-200">
                <strong>Important:</strong> Before approving, make sure you have transferred
                {{ selectedPayout ? formatCurrency(selectedPayout.amount) : '' }} to the user's bank account.
              </p>
            </div>
          </div>

          <template #footer>
            <div class="flex justify-end gap-3">
              <UButton color="gray" variant="outline" @click="showModal = false">
                Cancel
              </UButton>
              <UButton
                :color="modalAction === 'approve' ? 'green' : 'red'"
                :loading="processing"
                :disabled="modalAction === 'reject' && !rejectionReason"
                @click="processAction"
              >
                {{ modalAction === 'approve' ? 'Mark as Completed' : 'Reject Payout' }}
              </UButton>
            </div>
          </template>
        </UCard>
      </UModal>
    </div>
  </div>
</template>
