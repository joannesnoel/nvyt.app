<script setup lang="ts">
definePageMeta({
  layout: 'dashboard',
})

const route = useRoute()
const eventId = computed(() => route.params.id as string)
const toast = useToast()

// Fetch event by ID
const { data: eventResponse, pending: eventPending } = await useFetch(
  () => `/api/v1/events/by-id/${eventId.value}`,
  { watch: [eventId] }
)
const event = computed(() => eventResponse.value?.data)

// Fetch FAQs
const { data: faqsResponse, pending: faqsPending, refresh: refreshFaqs } = await useFetch(
  () => `/api/v1/events/${eventId.value}/faqs`,
  { watch: [eventId] }
)
const faqs = computed(() => faqsResponse.value?.data ?? [])

// Add FAQ modal state
const showAddModal = ref(false)
const addForm = ref({
  question: '',
  answer: '',
})
const isAdding = ref(false)

function openAddModal() {
  addForm.value = {
    question: '',
    answer: '',
  }
  showAddModal.value = true
}

async function addFaq() {
  if (!addForm.value.question || !addForm.value.answer) return

  isAdding.value = true
  try {
    await $fetch(`/api/v1/events/${eventId.value}/faqs`, {
      method: 'POST',
      body: addForm.value,
    })
    toast.add({
      title: 'FAQ Added',
      description: 'The FAQ has been added successfully',
      color: 'green',
    })
    showAddModal.value = false
    await refreshFaqs()
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to add FAQ',
      color: 'red',
    })
  } finally {
    isAdding.value = false
  }
}

// Edit FAQ modal state
const showEditModal = ref(false)
const editingFaq = ref<any>(null)
const editForm = ref({
  question: '',
  answer: '',
})
const isUpdating = ref(false)

function openEditModal(faq: any) {
  editingFaq.value = faq
  editForm.value = {
    question: faq.question,
    answer: faq.answer,
  }
  showEditModal.value = true
}

async function updateFaq() {
  if (!editingFaq.value || !editForm.value.question || !editForm.value.answer) return

  isUpdating.value = true
  try {
    await $fetch(`/api/v1/events/${eventId.value}/faqs/${editingFaq.value.id}`, {
      method: 'PATCH',
      body: editForm.value,
    })
    toast.add({
      title: 'FAQ Updated',
      description: 'The FAQ has been updated successfully',
      color: 'green',
    })
    showEditModal.value = false
    await refreshFaqs()
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to update FAQ',
      color: 'red',
    })
  } finally {
    isUpdating.value = false
  }
}

// Toggle active status
async function toggleActive(faq: any) {
  try {
    await $fetch(`/api/v1/events/${eventId.value}/faqs/${faq.id}`, {
      method: 'PATCH',
      body: { isActive: !faq.isActive },
    })
    await refreshFaqs()
    toast.add({
      title: faq.isActive ? 'FAQ Hidden' : 'FAQ Visible',
      description: faq.isActive
        ? 'This FAQ will no longer be shown on the event page'
        : 'This FAQ will now be shown on the event page',
      color: 'green',
    })
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to update FAQ',
      color: 'red',
    })
  }
}

// Delete FAQ confirmation
const showDeleteModal = ref(false)
const deletingFaq = ref<any>(null)
const isDeleting = ref(false)

function openDeleteModal(faq: any) {
  deletingFaq.value = faq
  showDeleteModal.value = true
}

async function deleteFaq() {
  if (!deletingFaq.value) return

  isDeleting.value = true
  try {
    await ($fetch as any)(`/api/v1/events/${eventId.value}/faqs/${deletingFaq.value.id}`, {
      method: 'DELETE',
    })
    toast.add({
      title: 'FAQ Deleted',
      description: 'The FAQ has been removed',
      color: 'green',
    })
    showDeleteModal.value = false
    await refreshFaqs()
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to delete FAQ',
      color: 'red',
    })
  } finally {
    isDeleting.value = false
  }
}
</script>

<template>
  <div class="py-8">
    <div class="px-4 sm:px-6 lg:px-8">
      <!-- Loading -->
      <div v-if="eventPending || faqsPending" class="space-y-4">
        <USkeleton class="h-8 w-1/3" />
        <USkeleton class="h-4 w-1/4" />
        <div class="mt-8 space-y-4">
          <USkeleton v-for="i in 3" :key="i" class="h-24" />
        </div>
      </div>

      <!-- Content -->
      <div v-else-if="event">
        <!-- Header -->
        <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
              Frequently Asked Questions
            </h1>
            <p class="text-gray-600 dark:text-gray-400 mt-1">
              Add FAQs to help attendees find answers quickly
            </p>
          </div>

          <UButton
            color="primary"
            icon="i-heroicons-plus"
            @click="openAddModal"
          >
            Add FAQ
          </UButton>
        </div>

        <!-- FAQs List -->
        <div v-if="faqs.length > 0" class="space-y-4">
          <UCard
            v-for="(faq, index) in faqs"
            :key="faq.id"
            :class="{ 'opacity-60': !faq.isActive }"
          >
            <div class="flex flex-col md:flex-row md:items-start justify-between gap-4">
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-2">
                  <span class="text-sm text-gray-500 font-medium">
                    #{{ index + 1 }}
                  </span>
                  <UBadge
                    v-if="!faq.isActive"
                    color="gray"
                    variant="soft"
                    size="xs"
                  >
                    Hidden
                  </UBadge>
                </div>

                <p class="font-medium text-gray-900 dark:text-white mb-2">
                  {{ faq.question }}
                </p>

                <p class="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{{ faq.answer }}</p>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <UToggle
                  :model-value="faq.isActive"
                  @update:model-value="toggleActive(faq)"
                />
                <UButton
                  color="gray"
                  variant="outline"
                  size="sm"
                  icon="i-heroicons-pencil"
                  @click="openEditModal(faq)"
                >
                  Edit
                </UButton>
                <UButton
                  color="red"
                  variant="outline"
                  size="sm"
                  icon="i-heroicons-trash"
                  @click="openDeleteModal(faq)"
                />
              </div>
            </div>
          </UCard>
        </div>

        <!-- Empty State -->
        <UCard v-else>
          <div class="text-center py-12">
            <UIcon name="i-heroicons-question-mark-circle" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No FAQs yet</h3>
            <p class="text-gray-500 mb-6">
              Add frequently asked questions to help attendees.
            </p>
            <UButton
              color="primary"
              icon="i-heroicons-plus"
              @click="openAddModal"
            >
              Add First FAQ
            </UButton>
          </div>
        </UCard>
      </div>

      <!-- Not Found -->
      <div v-else class="text-center py-20">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">Event Not Found</h1>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          This event doesn't exist or you don't have access to it.
        </p>
        <UButton to="/dashboard" color="primary">Back to Dashboard</UButton>
      </div>
    </div>

    <!-- Add FAQ Modal -->
    <UModal v-model="showAddModal">
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <div class="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
              <UIcon name="i-heroicons-plus" class="w-5 h-5 text-primary" />
            </div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Add FAQ
            </h3>
          </div>
        </template>

        <div class="space-y-4">
          <UFormGroup label="Question" required>
            <UInput
              v-model="addForm.question"
              placeholder="e.g., What should I bring to the event?"
            />
          </UFormGroup>

          <UFormGroup label="Answer" required>
            <UTextarea
              v-model="addForm.answer"
              placeholder="Provide a helpful answer..."
              :rows="4"
            />
          </UFormGroup>
        </div>

        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton
              color="gray"
              variant="outline"
              @click="showAddModal = false"
            >
              Cancel
            </UButton>
            <UButton
              color="primary"
              :loading="isAdding"
              :disabled="!addForm.question || !addForm.answer"
              @click="addFaq"
            >
              Add FAQ
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Edit FAQ Modal -->
    <UModal v-model="showEditModal">
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <div class="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
              <UIcon name="i-heroicons-pencil-square" class="w-5 h-5 text-primary" />
            </div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Edit FAQ
            </h3>
          </div>
        </template>

        <div class="space-y-4">
          <UFormGroup label="Question" required>
            <UInput v-model="editForm.question" />
          </UFormGroup>

          <UFormGroup label="Answer" required>
            <UTextarea
              v-model="editForm.answer"
              :rows="4"
            />
          </UFormGroup>
        </div>

        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton
              color="gray"
              variant="outline"
              @click="showEditModal = false"
            >
              Cancel
            </UButton>
            <UButton
              color="primary"
              :loading="isUpdating"
              :disabled="!editForm.question || !editForm.answer"
              @click="updateFaq"
            >
              Save Changes
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Delete Confirmation Modal -->
    <UModal v-model="showDeleteModal">
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <div class="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-red-600" />
            </div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Delete FAQ
            </h3>
          </div>
        </template>

        <div v-if="deletingFaq" class="space-y-4">
          <p class="text-gray-600 dark:text-gray-400">
            Are you sure you want to delete this FAQ?
          </p>
          <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p class="font-medium text-gray-900 dark:text-white">
              {{ deletingFaq.question }}
            </p>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton
              color="gray"
              variant="outline"
              @click="showDeleteModal = false"
            >
              Cancel
            </UButton>
            <UButton
              color="red"
              :loading="isDeleting"
              @click="deleteFaq"
            >
              Delete
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
