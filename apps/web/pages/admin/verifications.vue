<script setup lang="ts">
definePageMeta({
  layout: 'default',
  middleware: ['admin'],
})

const route = useRoute()
const toast = useToast()

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

// Fetch verifications
const { data, pending, refresh } = await useFetch('/api/v1/admin/verifications', {
  query: queryParams,
  watch: [queryParams],
})

const verifications = computed(() => data.value?.data?.verifications || [])
const stats = computed(() => data.value?.data?.stats || { pending: 0, underReview: 0, approved: 0, rejected: 0 })
const pagination = computed(() => ({
  page: data.value?.meta?.page ?? 1,
  limit: data.value?.meta?.limit ?? 20,
  total: data.value?.meta?.total ?? 0,
  totalPages: data.value?.meta?.totalPages ?? 1,
}))

// Selected verification for detail view
const selectedId = ref<string | null>(null)
const { data: detailData, pending: detailPending, refresh: refreshDetail } = await useFetch<{
  data?: {
    verification: any
    documents: any[]
    tickets: any[]
  }
}>(
  () => selectedId.value ? `/api/v1/admin/verifications/${selectedId.value}` as const : null!,
  { watch: [selectedId], immediate: false }
)
const selectedVerification = computed(() => detailData.value?.data)

// Modal state
const showModal = ref(false)
const showReviewModal = ref(false)
const modalAction = ref<'approve' | 'reject' | 'start_review' | null>(null)
const rejectionReason = ref('')
const reviewNotes = ref('')
const processing = ref(false)

function formatDate(date: string | Date | null) {
  if (!date) return '-'
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
    case 'under_review':
      return 'blue'
    case 'approved':
      return 'green'
    case 'rejected':
      return 'red'
    default:
      return 'gray'
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'pending': return 'Pending'
    case 'under_review': return 'Under Review'
    case 'approved': return 'Approved'
    case 'rejected': return 'Rejected'
    default: return status
  }
}

function getCountryName(code: string) {
  const countries: Record<string, string> = {
    PH: 'Philippines',
    US: 'United States',
    GB: 'United Kingdom',
    DE: 'Germany',
    FR: 'France',
    SG: 'Singapore',
    AE: 'UAE',
    OTHER: 'Other',
  }
  return countries[code] || code
}

async function openDetail(verification: any) {
  selectedId.value = verification.id
  await refreshDetail()
  showModal.value = true
}

function closeDetail() {
  showModal.value = false
  selectedId.value = null
}

function openReviewModal(action: 'approve' | 'reject' | 'start_review') {
  modalAction.value = action
  rejectionReason.value = ''
  reviewNotes.value = ''
  showReviewModal.value = true
}

async function processAction() {
  if (!selectedId.value || !modalAction.value) return

  processing.value = true
  try {
    await $fetch(`/api/v1/admin/verifications/${selectedId.value}`, {
      method: 'PATCH',
      body: {
        action: modalAction.value,
        rejectionReason: modalAction.value === 'reject' ? rejectionReason.value : undefined,
        reviewNotes: reviewNotes.value || undefined,
      },
    })

    toast.add({
      title: 'Success',
      description: modalAction.value === 'approve' 
        ? 'Verification approved' 
        : modalAction.value === 'reject' 
          ? 'Verification rejected' 
          : 'Review started',
      color: 'green',
    })

    showReviewModal.value = false
    closeDetail()
    refresh()
  } catch (error: any) {
    toast.add({
      title: 'Error',
      description: error.data?.message || 'Failed to process verification',
      color: 'red',
    })
  } finally {
    processing.value = false
  }
}

const statusOptions = [
  { label: 'All Statuses', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'Under Review', value: 'under_review' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
]
</script>

<template>
  <div class="py-8">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <div class="mb-8">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
          Admin: Event Verifications
        </h1>
        <p class="text-gray-600 dark:text-gray-400 mt-1">
          Review and approve event verification requests for paid ticket events
        </p>
      </div>

      <!-- Stats Cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <UCard>
          <div>
            <p class="text-xs text-yellow-600 font-medium mb-1">Pending</p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ stats.pending }}</p>
          </div>
        </UCard>

        <UCard>
          <div>
            <p class="text-xs text-blue-600 font-medium mb-1">Under Review</p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ stats.underReview }}</p>
          </div>
        </UCard>

        <UCard>
          <div>
            <p class="text-xs text-green-600 font-medium mb-1">Approved</p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ stats.approved }}</p>
          </div>
        </UCard>

        <UCard>
          <div>
            <p class="text-xs text-red-600 font-medium mb-1">Rejected</p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ stats.rejected }}</p>
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

      <!-- Verifications Table -->
      <UCard>
        <div v-if="pending" class="space-y-4">
          <USkeleton v-for="i in 5" :key="i" class="h-16" />
        </div>

        <div v-else-if="verifications.length === 0" class="text-center py-12">
          <UIcon name="i-heroicons-shield-check" class="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p class="text-gray-500">No verification requests found</p>
        </div>

        <div v-else class="overflow-x-auto -mx-4 sm:mx-0">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead>
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Submitted
                </th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Event
                </th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Business
                </th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Organizer
                </th>
                <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Docs
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
              <tr
                v-for="verification in verifications"
                :key="verification.id"
                class="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                @click="openDetail(verification)"
              >
                <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                  {{ formatDate(verification.submittedAt) }}
                </td>
                <td class="px-4 py-3">
                  <p class="text-sm font-medium text-gray-900 dark:text-white">
                    {{ verification.eventTitle }}
                  </p>
                  <p class="text-xs text-gray-500">
                    {{ formatDate(verification.eventStartDate) }}
                  </p>
                </td>
                <td class="px-4 py-3">
                  <p class="text-sm font-medium text-gray-900 dark:text-white">
                    {{ verification.businessName }}
                  </p>
                  <p class="text-xs text-gray-500">
                    {{ getCountryName(verification.country) }}
                  </p>
                </td>
                <td class="px-4 py-3">
                  <p class="text-sm text-gray-900 dark:text-white">{{ verification.organizerName }}</p>
                  <p class="text-xs text-gray-500">{{ verification.organizerEmail }}</p>
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-center">
                  <UBadge color="gray" variant="soft" size="xs">
                    {{ verification.documentCount }}
                  </UBadge>
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-center">
                  <UBadge :color="getStatusColor(verification.status)" variant="soft" size="xs">
                    {{ getStatusLabel(verification.status) }}
                  </UBadge>
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-center" @click.stop>
                  <UButton
                    color="primary"
                    variant="soft"
                    size="xs"
                    @click="openDetail(verification)"
                  >
                    Review
                  </UButton>
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

      <!-- Detail Modal -->
      <UModal v-model="showModal" :ui="{ width: 'sm:max-w-3xl' }">
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                Verification Details
              </h3>
              <UBadge
                v-if="selectedVerification?.verification"
                :color="getStatusColor(selectedVerification.verification.status)"
                variant="soft"
              >
                {{ getStatusLabel(selectedVerification.verification.status) }}
              </UBadge>
            </div>
          </template>

          <div v-if="detailPending" class="space-y-4">
            <USkeleton class="h-20" />
            <USkeleton class="h-40" />
          </div>

          <div v-else-if="selectedVerification" class="space-y-6">
            <!-- Event Info -->
            <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <h4 class="text-sm font-medium text-gray-500 mb-3">Event Information</h4>
              <div class="grid md:grid-cols-2 gap-4">
                <div>
                  <p class="text-sm text-gray-500">Event Title</p>
                  <p class="font-medium text-gray-900 dark:text-white">
                    {{ selectedVerification.verification.eventTitle }}
                  </p>
                </div>
                <div>
                  <p class="text-sm text-gray-500">Event Date</p>
                  <p class="font-medium text-gray-900 dark:text-white">
                    {{ formatDate(selectedVerification.verification.eventStartDate) }}
                  </p>
                </div>
                <div>
                  <p class="text-sm text-gray-500">Organizer</p>
                  <p class="font-medium text-gray-900 dark:text-white">
                    {{ selectedVerification.verification.organizerName }}
                  </p>
                  <p class="text-sm text-gray-500">
                    {{ selectedVerification.verification.organizerEmail }}
                  </p>
                </div>
                <div>
                  <p class="text-sm text-gray-500">Event Status</p>
                  <UBadge
                    :color="selectedVerification.verification.eventStatus === 'published' ? 'green' : 'yellow'"
                    variant="soft"
                    size="xs"
                  >
                    {{ selectedVerification.verification.eventStatus }}
                  </UBadge>
                </div>
              </div>
            </div>

            <!-- Business Info -->
            <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <h4 class="text-sm font-medium text-gray-500 mb-3">Business Information</h4>
              <div class="grid md:grid-cols-2 gap-4">
                <div>
                  <p class="text-sm text-gray-500">Business Name</p>
                  <p class="font-medium text-gray-900 dark:text-white">
                    {{ selectedVerification.verification.businessName }}
                  </p>
                </div>
                <div>
                  <p class="text-sm text-gray-500">Country</p>
                  <p class="font-medium text-gray-900 dark:text-white">
                    {{ getCountryName(selectedVerification.verification.country) }}
                  </p>
                </div>
                <div v-if="selectedVerification.verification.businessType">
                  <p class="text-sm text-gray-500">Business Type</p>
                  <p class="font-medium text-gray-900 dark:text-white capitalize">
                    {{ selectedVerification.verification.businessType?.replace('_', ' ') }}
                  </p>
                </div>
                <div v-if="selectedVerification.verification.registrationNumber">
                  <p class="text-sm text-gray-500">Registration Number</p>
                  <p class="font-medium text-gray-900 dark:text-white font-mono">
                    {{ selectedVerification.verification.registrationNumber }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Ticket Info -->
            <div v-if="selectedVerification.tickets?.length > 0" class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <h4 class="text-sm font-medium text-gray-500 mb-3">Ticket Types</h4>
              <div class="space-y-2">
                <div
                  v-for="ticket in selectedVerification.tickets"
                  :key="ticket.id"
                  class="flex items-center justify-between text-sm"
                >
                  <span class="text-gray-900 dark:text-white">{{ ticket.name }}</span>
                  <span class="font-medium text-gray-900 dark:text-white">
                    {{ ticket.price > 0 ? `PHP ${ticket.price.toFixed(2)}` : 'Free' }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Documents -->
            <div>
              <h4 class="text-sm font-medium text-gray-500 mb-3">Uploaded Documents</h4>
              <div v-if="selectedVerification.documents?.length === 0" class="text-center py-4 text-gray-500">
                No documents uploaded yet
              </div>
              <div v-else class="space-y-2">
                <div
                  v-for="doc in selectedVerification.documents"
                  :key="doc.id"
                  class="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg"
                >
                  <div class="flex items-center gap-3">
                    <UIcon
                      :name="doc.mimeType?.includes('pdf') ? 'i-heroicons-document-text' : 'i-heroicons-photo'"
                      class="w-5 h-5 text-gray-400"
                    />
                    <div>
                      <p class="font-medium text-gray-900 dark:text-white text-sm">
                        {{ doc.documentType?.replace('_', ' ').toUpperCase() }}
                      </p>
                      <p class="text-xs text-gray-500">{{ doc.fileName }}</p>
                    </div>
                  </div>
                  <a
                    :href="doc.fileUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-1 text-sm text-primary hover:text-primary-600 font-medium"
                  >
                    <UIcon name="i-heroicons-arrow-top-right-on-square" class="w-4 h-4" />
                    View
                  </a>
                </div>
              </div>
            </div>

            <!-- Previous Rejection -->
            <div v-if="selectedVerification.verification.rejectionReason" class="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
              <h4 class="text-sm font-medium text-red-800 dark:text-red-200 mb-2">Previous Rejection Reason</h4>
              <p class="text-sm text-red-600 dark:text-red-300">
                {{ selectedVerification.verification.rejectionReason }}
              </p>
            </div>
          </div>

          <template #footer>
            <div class="flex justify-between items-center">
              <UButton color="gray" variant="outline" @click="closeDetail">
                Close
              </UButton>
              <div v-if="selectedVerification?.verification?.status !== 'approved'" class="flex gap-2">
                <UButton
                  v-if="selectedVerification?.verification?.status === 'pending'"
                  color="blue"
                  variant="soft"
                  @click="openReviewModal('start_review')"
                >
                  Start Review
                </UButton>
                <UButton
                  color="red"
                  variant="soft"
                  @click="openReviewModal('reject')"
                >
                  Reject
                </UButton>
                <UButton
                  color="green"
                  @click="openReviewModal('approve')"
                >
                  Approve
                </UButton>
              </div>
            </div>
          </template>
        </UCard>
      </UModal>

      <!-- Review Action Modal -->
      <UModal v-model="showReviewModal">
        <UCard>
          <template #header>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              {{ modalAction === 'approve' ? 'Approve Verification' : modalAction === 'reject' ? 'Reject Verification' : 'Start Review' }}
            </h3>
          </template>

          <div class="space-y-4">
            <UFormGroup v-if="modalAction === 'reject'" label="Rejection Reason" required>
              <UTextarea
                v-model="rejectionReason"
                placeholder="Explain why this verification is being rejected..."
                :rows="3"
              />
            </UFormGroup>

            <UFormGroup label="Internal Notes (optional)">
              <UTextarea
                v-model="reviewNotes"
                placeholder="Any internal notes for this review..."
                :rows="2"
              />
            </UFormGroup>

            <div v-if="modalAction === 'approve'" class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <p class="text-sm text-green-800 dark:text-green-200">
                Approving this verification will allow the organizer to publish their paid event.
              </p>
            </div>
          </div>

          <template #footer>
            <div class="flex justify-end gap-3">
              <UButton color="gray" variant="outline" @click="showReviewModal = false">
                Cancel
              </UButton>
              <UButton
                :color="modalAction === 'approve' ? 'green' : modalAction === 'reject' ? 'red' : 'blue'"
                :loading="processing"
                :disabled="modalAction === 'reject' && !rejectionReason"
                @click="processAction"
              >
                {{ modalAction === 'approve' ? 'Approve' : modalAction === 'reject' ? 'Reject' : 'Start Review' }}
              </UButton>
            </div>
          </template>
        </UCard>
      </UModal>
    </div>
  </div>
</template>
