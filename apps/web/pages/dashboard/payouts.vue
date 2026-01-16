<script setup lang="ts">
definePageMeta({
  layout: 'default',
})

const toast = useToast()

// Fetch wallet data
const { data: walletData, refresh: refreshWallet } = await useFetch('/api/v1/wallet')
const wallet = computed(() => walletData.value?.data?.wallet)
const availableBalance = computed(() => parseFloat(wallet.value?.availableBalance || '0'))

// Fetch payout settings
const { data: settingsData, refresh: refreshSettings } = await useFetch('/api/v1/payouts/settings')
const payoutSettings = computed(() => settingsData.value?.data?.settings)
const isConfigured = computed(() => settingsData.value?.data?.isConfigured)

// Fetch payout history
const { data: payoutsData, pending: payoutsPending, refresh: refreshPayouts } = await useFetch('/api/v1/payouts')
const payoutsList = computed(() => payoutsData.value?.data?.payouts || [])

// Payout request form
const showRequestModal = ref(false)
const requestAmount = ref<number | undefined>(undefined)
const requesting = ref(false)

// Settings form
const showSettingsModal = ref(false)
const settingsForm = reactive({
  bankName: '',
  accountName: '',
  accountNumber: '',
})
const savingSettings = ref(false)

const MINIMUM_PAYOUT = 500

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

function openSettingsModal() {
  if (payoutSettings.value) {
    settingsForm.bankName = payoutSettings.value.bankName || ''
    settingsForm.accountName = payoutSettings.value.accountName || ''
    settingsForm.accountNumber = ''
  }
  showSettingsModal.value = true
}

async function saveSettings() {
  if (!settingsForm.bankName || !settingsForm.accountName || !settingsForm.accountNumber) {
    toast.add({
      title: 'Error',
      description: 'Please fill in all fields',
      color: 'red',
    })
    return
  }

  savingSettings.value = true
  try {
    await $fetch('/api/v1/payouts/settings', {
      method: 'PUT',
      body: settingsForm,
    })

    toast.add({
      title: 'Success',
      description: 'Payout settings saved successfully',
      color: 'green',
    })
    showSettingsModal.value = false
    await refreshSettings()
  } catch (err: any) {
    toast.add({
      title: 'Error',
      description: err.data?.message || 'Failed to save settings',
      color: 'red',
    })
  } finally {
    savingSettings.value = false
  }
}

async function requestPayout() {
  if (!requestAmount.value || requestAmount.value < MINIMUM_PAYOUT) {
    toast.add({
      title: 'Error',
      description: `Minimum payout amount is ${formatCurrency(MINIMUM_PAYOUT)}`,
      color: 'red',
    })
    return
  }

  if (requestAmount.value > availableBalance.value) {
    toast.add({
      title: 'Error',
      description: 'Insufficient balance',
      color: 'red',
    })
    return
  }

  requesting.value = true
  try {
    await $fetch('/api/v1/payouts/request', {
      method: 'POST',
      body: { amount: requestAmount.value },
    })

    toast.add({
      title: 'Success',
      description: 'Payout request submitted successfully',
      color: 'green',
    })
    showRequestModal.value = false
    requestAmount.value = undefined
    await Promise.all([refreshWallet(), refreshPayouts()])
  } catch (err: any) {
    toast.add({
      title: 'Error',
      description: err.data?.message || 'Failed to request payout',
      color: 'red',
    })
  } finally {
    requesting.value = false
  }
}

function setMaxAmount() {
  requestAmount.value = availableBalance.value
}

const hasPendingPayout = computed(() =>
  payoutsList.value.some((p: any) => p.status === 'pending' || p.status === 'processing')
)

const canRequestPayout = computed(() =>
  isConfigured.value && !hasPendingPayout.value && availableBalance.value >= MINIMUM_PAYOUT
)
</script>

<template>
  <div class="py-8">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
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
            Payouts
          </h1>
          <p class="text-gray-600 dark:text-gray-400 mt-1">
            Request payouts and manage your bank details
          </p>
        </div>
      </div>

      <!-- Balance & Settings Cards -->
      <div class="grid md:grid-cols-2 gap-6 mb-8">
        <!-- Available Balance -->
        <UCard>
          <div class="text-center">
            <p class="text-sm text-gray-500 mb-2">Available for Payout</p>
            <p class="text-4xl font-bold text-green-600 mb-4">
              {{ formatCurrency(availableBalance) }}
            </p>
            <UButton
              v-if="canRequestPayout"
              color="primary"
              block
              icon="i-heroicons-banknotes"
              @click="showRequestModal = true"
            >
              Request Payout
            </UButton>
            <div v-else class="space-y-2">
              <UButton
                color="gray"
                variant="outline"
                block
                disabled
              >
                Request Payout
              </UButton>
              <p v-if="availableBalance < MINIMUM_PAYOUT" class="text-xs text-gray-500">
                Minimum payout: {{ formatCurrency(MINIMUM_PAYOUT) }}
              </p>
              <p v-else-if="hasPendingPayout" class="text-xs text-yellow-600">
                You have a pending payout request
              </p>
              <p v-else-if="!isConfigured" class="text-xs text-orange-600">
                Set up bank details to request payouts
              </p>
            </div>
          </div>
        </UCard>

        <!-- Bank Details -->
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="font-semibold text-gray-900 dark:text-white">Payout Settings</h3>
              <UButton
                color="gray"
                variant="ghost"
                size="sm"
                @click="openSettingsModal"
              >
                {{ isConfigured ? 'Edit' : 'Set up' }}
              </UButton>
            </div>
          </template>

          <div v-if="isConfigured && payoutSettings" class="space-y-3">
            <div>
              <p class="text-xs text-gray-400">Bank</p>
              <p class="text-sm font-medium text-gray-900 dark:text-white">{{ payoutSettings.bankName }}</p>
            </div>
            <div>
              <p class="text-xs text-gray-400">Account Name</p>
              <p class="text-sm font-medium text-gray-900 dark:text-white">{{ payoutSettings.accountName }}</p>
            </div>
            <div>
              <p class="text-xs text-gray-400">Account Number</p>
              <p class="text-sm font-medium text-gray-900 dark:text-white">{{ payoutSettings.accountNumber }}</p>
            </div>
          </div>

          <div v-else class="text-center py-4">
            <UIcon name="i-heroicons-credit-card" class="w-10 h-10 text-gray-400 mx-auto mb-2" />
            <p class="text-gray-500 mb-2">No bank account set up</p>
            <UButton
              color="primary"
              variant="soft"
              size="sm"
              @click="openSettingsModal"
            >
              Add Bank Details
            </UButton>
          </div>
        </UCard>
      </div>

      <!-- Payout History -->
      <UCard>
        <template #header>
          <h2 class="font-semibold text-gray-900 dark:text-white">Payout History</h2>
        </template>

        <div v-if="payoutsPending" class="space-y-4">
          <USkeleton v-for="i in 3" :key="i" class="h-16" />
        </div>

        <div v-else-if="payoutsList.length === 0" class="text-center py-8">
          <UIcon name="i-heroicons-banknotes" class="w-10 h-10 text-gray-400 mx-auto mb-2" />
          <p class="text-gray-500">No payout requests yet</p>
        </div>

        <div v-else class="divide-y divide-gray-200 dark:divide-gray-700 -my-4">
          <div
            v-for="payout in payoutsList"
            :key="payout.id"
            class="py-4"
          >
            <div class="flex items-center justify-between">
              <div>
                <div class="flex items-center gap-2">
                  <p class="font-medium text-gray-900 dark:text-white">
                    {{ formatCurrency(payout.amount) }}
                  </p>
                  <UBadge :color="getStatusColor(payout.status)" variant="soft" size="xs">
                    {{ payout.status }}
                  </UBadge>
                </div>
                <p class="text-sm text-gray-500">
                  {{ payout.bankName }} - {{ payout.accountNumber }}
                </p>
              </div>
              <div class="text-right">
                <p class="text-xs text-gray-400">Requested</p>
                <p class="text-sm text-gray-600 dark:text-gray-400">{{ formatDate(payout.requestedAt) }}</p>
              </div>
            </div>
            <p v-if="payout.rejectionReason" class="mt-2 text-sm text-red-600">
              Reason: {{ payout.rejectionReason }}
            </p>
            <p v-if="payout.processedAt" class="mt-1 text-xs text-gray-500">
              Processed: {{ formatDate(payout.processedAt) }}
            </p>
          </div>
        </div>
      </UCard>
    </div>

    <!-- Request Payout Modal -->
    <UModal v-model="showRequestModal">
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <div class="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
              <UIcon name="i-heroicons-banknotes" class="w-5 h-5 text-primary" />
            </div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Request Payout
            </h3>
          </div>
        </template>

        <div class="space-y-4">
          <UFormGroup label="Amount">
            <div class="relative">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">PHP</span>
              <UInput
                v-model.number="requestAmount"
                type="number"
                :placeholder="`Min: ${MINIMUM_PAYOUT}`"
                :min="MINIMUM_PAYOUT"
                :max="availableBalance"
                class="pl-12"
              />
              <UButton
                color="gray"
                variant="ghost"
                size="xs"
                class="absolute right-2 top-1/2 -translate-y-1/2"
                @click="setMaxAmount"
              >
                MAX
              </UButton>
            </div>
          </UFormGroup>

          <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
            <div class="flex justify-between text-sm">
              <span class="text-gray-500">Payout to:</span>
              <span class="text-gray-900 dark:text-white">{{ payoutSettings?.bankName }} - {{ payoutSettings?.accountNumber }}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-gray-500">Processing time:</span>
              <span class="text-gray-900 dark:text-white">3-5 business days</span>
            </div>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton
              color="gray"
              variant="outline"
              @click="showRequestModal = false"
            >
              Cancel
            </UButton>
            <UButton
              color="primary"
              :loading="requesting"
              :disabled="!requestAmount || requestAmount < MINIMUM_PAYOUT"
              @click="requestPayout"
            >
              Submit Request
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Settings Modal -->
    <UModal v-model="showSettingsModal">
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <div class="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
              <UIcon name="i-heroicons-credit-card" class="w-5 h-5 text-primary" />
            </div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Bank Account Details
            </h3>
          </div>
        </template>

        <div class="space-y-4">
          <UFormGroup label="Bank Name">
            <UInput
              v-model="settingsForm.bankName"
              placeholder="e.g., BDO, BPI, UnionBank"
            />
          </UFormGroup>

          <UFormGroup label="Account Name">
            <UInput
              v-model="settingsForm.accountName"
              placeholder="Name as it appears on your account"
            />
          </UFormGroup>

          <UFormGroup label="Account Number">
            <UInput
              v-model="settingsForm.accountNumber"
              placeholder="Your bank account number"
            />
          </UFormGroup>
        </div>

        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton
              color="gray"
              variant="outline"
              @click="showSettingsModal = false"
            >
              Cancel
            </UButton>
            <UButton
              color="primary"
              :loading="savingSettings"
              @click="saveSettings"
            >
              Save
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
