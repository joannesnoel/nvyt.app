<script setup lang="ts">
definePageMeta({
  layout: 'default',
})

const route = useRoute()
const eventId = computed(() => route.params.id as string)
const toast = useToast()

// Fetch event
const { data: eventResponse } = await useFetch(
  () => `/api/v1/events/by-id/${eventId.value}`,
  { watch: [eventId] }
)
const event = computed(() => eventResponse.value?.data)

// Fetch verification status
const { data: verificationResponse, refresh } = await useFetch(
  () => `/api/v1/events/${eventId.value}/verification`,
  { watch: [eventId] }
)
const verification = computed(() => verificationResponse.value?.data)

// Form state
const isSubmitting = ref(false)
const form = ref({
  country: 'PH',
  businessName: '',
  businessType: 'sole_proprietor' as 'sole_proprietor' | 'corporation' | 'partnership' | 'llc' | 'other',
  registrationNumber: '',
})

// Countries
const countries = [
  { value: 'PH', label: 'Philippines' },
  { value: 'US', label: 'United States' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'DE', label: 'Germany' },
  { value: 'FR', label: 'France' },
  { value: 'SG', label: 'Singapore' },
  { value: 'AE', label: 'United Arab Emirates' },
  { value: 'OTHER', label: 'Other' },
]

const businessTypes = [
  { value: 'sole_proprietor', label: 'Sole Proprietor' },
  { value: 'corporation', label: 'Corporation' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'llc', label: 'LLC' },
  { value: 'other', label: 'Other' },
]

// Document requirements description based on country and business type
const currentDocumentRequirements = computed(() => {
  const country = form.value.country
  const businessType = form.value.businessType
  
  if (country === 'PH') {
    if (businessType === 'sole_proprietor') {
      return { description: 'DTI Certificate of Business Name Registration is required for sole proprietors.' }
    } else {
      return { description: 'SEC Certificate of Registration is required for corporations and partnerships.' }
    }
  }
  
  const requirements: Record<string, { description: string }> = {
    US: { description: 'EIN Letter from IRS, State Business License, or Articles of Incorporation' },
    GB: { description: 'Companies House Registration Certificate' },
    DE: { description: 'Handelsregister (Commercial Register) extract' },
    FR: { description: 'Extrait Kbis (Company Registration)' },
    SG: { description: 'ACRA Business Profile or UEN Certificate' },
    AE: { description: 'Trade License from DED' },
    OTHER: { description: 'Government-issued business registration document' },
  }
  return requirements[country] || requirements.OTHER
})

// Document types based on country AND business type
const documentTypeOptions = computed(() => {
  const country = form.value.country
  const businessType = form.value.businessType
  const options = []

  if (country === 'PH') {
    // Philippines: DTI for sole proprietors, SEC for corporations/partnerships
    if (businessType === 'sole_proprietor') {
      options.push(
        { value: 'ph_dti', label: 'DTI Certificate', description: 'Certificate of Business Name Registration', required: true },
      )
    } else {
      // corporation, partnership, llc, other
      options.push(
        { value: 'ph_sec', label: 'SEC Registration', description: 'Certificate of Registration', required: true },
      )
    }
    options.push(
      { value: 'ph_bir', label: 'BIR Certificate', description: 'Tax registration (optional)', required: false },
    )
  } else if (country === 'US') {
    options.push(
      { value: 'us_ein', label: 'EIN Letter', description: 'From IRS', required: true },
    )
    if (businessType === 'corporation' || businessType === 'llc') {
      options.push(
        { value: 'us_articles', label: 'Articles of Incorporation', description: 'Formation documents', required: true },
      )
    }
    options.push(
      { value: 'us_state_license', label: 'State Business License', description: 'If applicable in your state', required: false },
    )
  } else if (country === 'SG') {
    options.push(
      { value: 'sg_acra', label: 'ACRA Business Profile', description: 'Company registration', required: true },
      { value: 'sg_uen', label: 'UEN Certificate', description: 'Unique Entity Number', required: false },
    )
  } else if (country === 'AE') {
    options.push(
      { value: 'ae_trade_license', label: 'Trade License', description: 'From DED', required: true },
    )
    if (businessType === 'corporation' || businessType === 'llc' || businessType === 'partnership') {
      options.push(
        { value: 'ae_moa', label: 'Memorandum of Association', description: 'For companies', required: false },
      )
    }
  } else if (country === 'GB' || country === 'DE' || country === 'FR') {
    options.push(
      { value: 'eu_company_reg', label: 'Company Registration', description: 'Government-issued', required: true },
      { value: 'eu_vat', label: 'VAT Registration', description: 'If applicable', required: false },
    )
  } else {
    options.push(
      { value: 'business_registration', label: 'Business Registration', description: 'Government-issued registration document', required: true },
    )
  }

  options.push(
    { value: 'government_id', label: 'Government ID', description: 'Owner/Representative ID (optional)', required: false },
    { value: 'other', label: 'Other Document', description: 'Additional supporting documents', required: false },
  )

  return options
})

// File upload state
const selectedDocumentType = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const isUploading = ref(false)

// Initialize form from existing verification
watchEffect(() => {
  if (verification.value?.verification) {
    form.value.country = verification.value.verification.country || 'PH'
    form.value.businessName = verification.value.verification.businessName || ''
    form.value.businessType = (verification.value.verification.businessType || 'sole_proprietor') as typeof form.value.businessType
    form.value.registrationNumber = verification.value.verification.registrationNumber || ''
  }
})

// Status helpers
const statusColor = computed(() => {
  const status = verification.value?.status
  switch (status) {
    case 'approved': return 'green'
    case 'pending': return 'yellow'
    case 'under_review': return 'blue'
    case 'rejected': return 'red'
    case 'draft': return 'gray'
    default: return 'gray'
  }
})

const statusLabel = computed(() => {
  const status = verification.value?.status
  switch (status) {
    case 'approved': return 'Verified'
    case 'pending': return 'Pending Review'
    case 'under_review': return 'Under Review'
    case 'rejected': return 'Rejected'
    case 'draft': return 'Draft'
    case 'not_submitted': return 'Not Submitted'
    case 'not_required': return 'Not Required'
    default: return status
  }
})

const canEdit = computed(() => {
  const status = verification.value?.status
  // Allow editing when draft, not submitted, rejected, or pending (can still upload docs)
  return !status || status === 'not_submitted' || status === 'draft' || status === 'rejected' || status === 'pending'
})

// Check if at least one required document is uploaded
const hasRequiredDocument = computed(() => {
  const uploadedDocs = verification.value?.documents || []
  const requiredDocTypes = documentTypeOptions.value
    .filter(d => d.required)
    .map(d => d.value)
  
  // Check if any uploaded document matches a required type
  return uploadedDocs.some((doc: any) => requiredDocTypes.includes(doc.documentType))
})

// Check if business info is saved (verification record exists)
const hasBusinessInfo = computed(() => !!verification.value?.verification)

// Can submit for review (has business info + at least one required document + not already pending/under_review)
const canSubmitForReview = computed(() => {
  const status = verification.value?.status
  const notYetSubmitted = !status || status === 'draft' || status === 'rejected' || status === 'not_submitted'
  return hasBusinessInfo.value && hasRequiredDocument.value && notYetSubmitted
})

// Save business information (creates/updates verification record without submitting for review)
async function saveBusinessInfo() {
  if (!form.value.businessName.trim()) {
    toast.add({
      title: 'Validation Error',
      description: 'Business name is required',
      color: 'red',
    })
    return
  }

  isSubmitting.value = true
  try {
    await $fetch(`/api/v1/events/${eventId.value}/verification`, {
      method: 'POST',
      body: { ...form.value, saveOnly: true },
    })
    toast.add({
      title: 'Business Info Saved',
      description: 'Now upload the required documents below',
      color: 'green',
    })
    await refresh()
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to save business info',
      color: 'red',
    })
  } finally {
    isSubmitting.value = false
  }
}

// Submit for review (only after documents are uploaded)
async function submitForReview() {
  if (!hasRequiredDocument.value) {
    toast.add({
      title: 'Documents Required',
      description: 'Please upload at least one required document before submitting',
      color: 'red',
    })
    return
  }

  isSubmitting.value = true
  try {
    await $fetch(`/api/v1/events/${eventId.value}/verification`, {
      method: 'POST',
      body: { ...form.value, submitForReview: true },
    })
    toast.add({
      title: 'Submitted for Review',
      description: 'Your verification is now pending review',
      color: 'green',
    })
    await refresh()
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to submit for review',
      color: 'red',
    })
  } finally {
    isSubmitting.value = false
  }
}

// Upload document
function triggerFileUpload(docType: string) {
  selectedDocumentType.value = docType
  fileInput.value?.click()
}

async function handleFileUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  // Validate file
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  if (!allowedTypes.includes(file.type)) {
    toast.add({
      title: 'Invalid File',
      description: 'Please upload a PDF, JPEG, PNG, or WebP file',
      color: 'red',
    })
    return
  }

  const maxSize = 10 * 1024 * 1024 // 10MB
  if (file.size > maxSize) {
    toast.add({
      title: 'File Too Large',
      description: 'Maximum file size is 10MB',
      color: 'red',
    })
    return
  }

  isUploading.value = true
  try {
    const formData = new FormData()
    formData.append('document', file)
    formData.append('documentType', selectedDocumentType.value)

    await $fetch(`/api/v1/events/${eventId.value}/verification/documents`, {
      method: 'POST',
      body: formData,
    })

    toast.add({
      title: 'Document Uploaded',
      description: 'Your document has been uploaded successfully',
      color: 'green',
    })
    await refresh()
  } catch (e: any) {
    toast.add({
      title: 'Upload Failed',
      description: e.data?.message || 'Failed to upload document',
      color: 'red',
    })
  } finally {
    isUploading.value = false
    selectedDocumentType.value = ''
    if (fileInput.value) fileInput.value.value = ''
  }
}

// Get document type label
function getDocTypeLabel(type: string) {
  const option = documentTypeOptions.value.find(o => o.value === type)
  return option?.label || type
}

// Check if document type is already uploaded
function isDocTypeUploaded(type: string) {
  return verification.value?.documents?.some((d: any) => d.documentType === type)
}
</script>

<template>
  <div class="py-8">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <div class="mb-8">
        <NuxtLink
          :to="`/dashboard/events/${eventId}`"
          class="text-gray-600 dark:text-gray-400 hover:text-primary flex items-center gap-1 mb-2"
        >
          <UIcon name="i-heroicons-arrow-left" class="w-4 h-4" />
          Back to Event
        </NuxtLink>
        <div class="flex items-center gap-3">
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
            Event Verification
          </h1>
          <UBadge v-if="verification?.status" :color="statusColor" variant="soft">
            {{ statusLabel }}
          </UBadge>
        </div>
        <p class="text-gray-600 dark:text-gray-400 mt-1">
          {{ event?.title }}
        </p>
      </div>

      <!-- Not Required -->
      <div v-if="verification?.status === 'not_required'" class="text-center py-12">
        <UIcon name="i-heroicons-check-circle" class="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Verification Not Required
        </h2>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          This event doesn't have paid tickets, so verification is not required.
        </p>
        <UButton :to="`/dashboard/events/${eventId}`" color="primary">
          Back to Event
        </UButton>
      </div>

      <!-- Approved -->
      <div v-else-if="verification?.status === 'approved'" class="space-y-6">
        <UCard>
          <div class="text-center py-8">
            <UIcon name="i-heroicons-shield-check" class="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Verification Approved
            </h2>
            <p class="text-gray-600 dark:text-gray-400">
              Your event is verified and ready to publish.
            </p>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <h2 class="font-semibold text-gray-900 dark:text-white">Business Details</h2>
          </template>
          <div class="grid md:grid-cols-2 gap-4">
            <div>
              <p class="text-sm text-gray-500">Business Name</p>
              <p class="font-medium text-gray-900 dark:text-white">
                {{ verification.verification?.businessName }}
              </p>
            </div>
            <div>
              <p class="text-sm text-gray-500">Country</p>
              <p class="font-medium text-gray-900 dark:text-white">
                {{ countries.find(c => c.value === verification?.verification?.country)?.label || verification?.verification?.country }}
              </p>
            </div>
            <div v-if="verification.verification?.registrationNumber">
              <p class="text-sm text-gray-500">Registration Number</p>
              <p class="font-medium text-gray-900 dark:text-white">
                {{ verification.verification?.registrationNumber }}
              </p>
            </div>
          </div>
        </UCard>
      </div>

      <!-- Form / Pending / Rejected -->
      <div v-else class="space-y-6">
        <!-- Rejection Notice -->
        <UCard v-if="verification?.status === 'rejected'" class="border-red-200 dark:border-red-800">
          <div class="flex items-start gap-4">
            <div class="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <UIcon name="i-heroicons-x-circle" class="w-6 h-6 text-red-600" />
            </div>
            <div>
              <h3 class="font-semibold text-red-800 dark:text-red-200">Verification Rejected</h3>
              <p class="text-red-600 dark:text-red-300 mt-1">
                {{ verification.verification?.rejectionReason || 'Please resubmit with valid documents.' }}
              </p>
              <p class="text-sm text-gray-600 dark:text-gray-400 mt-2">
                You can update your information and upload new documents below.
              </p>
            </div>
          </div>
        </UCard>

        <!-- Pending Notice -->
        <UCard v-if="verification?.status === 'pending' || verification?.status === 'under_review'">
          <div class="flex items-start gap-4">
            <div class="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
              <UIcon name="i-heroicons-clock" class="w-6 h-6 text-yellow-600" />
            </div>
            <div>
              <h3 class="font-semibold text-yellow-800 dark:text-yellow-200">
                {{ verification?.status === 'under_review' ? 'Under Review' : 'Pending Review' }}
              </h3>
              <p class="text-gray-600 dark:text-gray-400 mt-1">
                Your verification is being reviewed by our team. This usually takes 1-2 business days.
              </p>
            </div>
          </div>
        </UCard>

        <!-- Business Information Form -->
        <UCard>
          <template #header>
            <h2 class="font-semibold text-gray-900 dark:text-white">Business Information</h2>
          </template>

          <form @submit.prevent="saveBusinessInfo" class="space-y-4">
            <UFormGroup label="Country" required>
              <USelect
                v-model="form.country"
                :options="countries"
                option-attribute="label"
                value-attribute="value"
                :disabled="!canEdit"
              />
            </UFormGroup>

            <UFormGroup label="Business Name" required>
              <UInput
                v-model="form.businessName"
                placeholder="Enter your registered business name"
                :disabled="!canEdit"
              />
            </UFormGroup>

            <UFormGroup label="Business Type" required>
              <USelect
                v-model="form.businessType"
                :options="businessTypes"
                option-attribute="label"
                value-attribute="value"
                :disabled="!canEdit"
              />
            </UFormGroup>

            <UFormGroup label="Registration Number" hint="DTI/SEC/EIN number">
              <UInput
                v-model="form.registrationNumber"
                placeholder="Enter your business registration number"
                :disabled="!canEdit"
              />
            </UFormGroup>

            <div v-if="canEdit && !hasBusinessInfo" class="pt-4">
              <UButton type="submit" color="primary" :loading="isSubmitting">
                Save & Continue
              </UButton>
              <p class="text-sm text-gray-500 mt-2">
                Save your business info to enable document uploads
              </p>
            </div>
            
            <div v-else-if="canEdit && hasBusinessInfo" class="pt-4">
              <UButton type="submit" color="gray" variant="outline" :loading="isSubmitting">
                Update Business Info
              </UButton>
            </div>
          </form>
        </UCard>

        <!-- Document Upload - Always show based on selected country -->
        <UCard>
          <template #header>
            <h2 class="font-semibold text-gray-900 dark:text-white">Required Documents</h2>
          </template>

          <div class="space-y-4">
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {{ currentDocumentRequirements?.description }}
            </p>

            <!-- Uploaded Documents -->
            <div v-if="verification?.documents && verification.documents.length > 0" class="space-y-2">
              <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">Uploaded Documents</h3>
              <div
                v-for="doc in verification?.documents"
                :key="doc.id"
                class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
              >
                <div class="flex items-center gap-3">
                  <UIcon name="i-heroicons-document-check" class="w-5 h-5 text-green-500" />
                  <div>
                    <p class="font-medium text-gray-900 dark:text-white">
                      {{ getDocTypeLabel(doc.documentType) }}
                    </p>
                    <p class="text-sm text-gray-500">{{ doc.fileName }}</p>
                  </div>
                </div>
                <a
                  :href="doc.fileUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-primary font-medium"
                >
                  <UIcon name="i-heroicons-eye" class="w-4 h-4" />
                  View
                </a>
              </div>
            </div>

            <!-- Upload Buttons -->
            <div v-if="canEdit && hasBusinessInfo" class="space-y-3">
              <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">Upload Documents</h3>
              <div class="grid sm:grid-cols-2 gap-2">
                <UButton
                  v-for="docType in documentTypeOptions"
                  :key="docType.value"
                  :color="docType.required ? 'primary' : 'gray'"
                  :variant="isDocTypeUploaded(docType.value) ? 'soft' : 'outline'"
                  :icon="isDocTypeUploaded(docType.value) ? 'i-heroicons-check-circle' : 'i-heroicons-arrow-up-tray'"
                  :loading="isUploading && selectedDocumentType === docType.value"
                  :disabled="isUploading"
                  block
                  @click="triggerFileUpload(docType.value)"
                >
                  <span class="text-left flex-1">
                    <span class="block">
                      {{ docType.label }}
                      <span v-if="docType.required" class="text-red-500">*</span>
                    </span>
                    <span class="text-xs opacity-70">{{ docType.description }}</span>
                  </span>
                </UButton>
              </div>
              <p class="text-xs text-gray-500">
                <span class="text-red-500">*</span> Required document
              </p>
            </div>

            <!-- Prompt to save business info first -->
            <div v-else-if="canEdit && !hasBusinessInfo" class="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p class="text-sm text-blue-800 dark:text-blue-200">
                Please fill out and save the Business Information above first, then you can upload your documents.
              </p>
            </div>

            <!-- Hidden file input -->
            <input
              ref="fileInput"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              class="hidden"
              @change="handleFileUpload"
            />
          </div>
        </UCard>

        <!-- Submit for Review Button - only show when not yet submitted -->
        <UCard v-if="hasBusinessInfo && canSubmitForReview">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="font-semibold text-gray-900 dark:text-white">Ready to Submit?</h3>
              <p v-if="!hasRequiredDocument" class="text-sm text-amber-600 dark:text-amber-400 mt-1">
                Please upload at least one required document before submitting
              </p>
              <p v-else class="text-sm text-green-600 dark:text-green-400 mt-1">
                All requirements met! You can now submit for review.
              </p>
            </div>
            <UButton
              color="green"
              size="lg"
              :disabled="!hasRequiredDocument"
              :loading="isSubmitting"
              @click="submitForReview"
            >
              Submit for Review
            </UButton>
          </div>
        </UCard>
      </div>
    </div>
  </div>
</template>
