<script setup lang="ts">
definePageMeta({
  layout: 'default',
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

// Fetch announcements
const { data: announcementsResponse, pending: announcementsPending, refresh: refreshAnnouncements } = await useFetch(
  () => `/api/v1/events/${eventId.value}/announcements`,
  { watch: [eventId] }
)
const announcements = computed(() => announcementsResponse.value?.data ?? [])

// Add announcement modal state
const showAddModal = ref(false)
const addForm = ref({
  title: '',
  content: '',
  isPinned: false,
})
const isAdding = ref(false)

function openAddModal() {
  addForm.value = {
    title: '',
    content: '',
    isPinned: false,
  }
  showAddModal.value = true
}

async function addAnnouncement() {
  if (!addForm.value.title || !addForm.value.content) return

  isAdding.value = true
  try {
    await $fetch(`/api/v1/events/${eventId.value}/announcements`, {
      method: 'POST',
      body: addForm.value,
    })
    toast.add({
      title: 'Announcement Posted',
      description: 'Your announcement has been published',
      color: 'green',
    })
    showAddModal.value = false
    await refreshAnnouncements()
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to post announcement',
      color: 'red',
    })
  } finally {
    isAdding.value = false
  }
}

// Edit announcement modal state
const showEditModal = ref(false)
const editingAnnouncement = ref<any>(null)
const editForm = ref({
  title: '',
  content: '',
  isPinned: false,
})
const isUpdating = ref(false)

function openEditModal(announcement: any) {
  editingAnnouncement.value = announcement
  editForm.value = {
    title: announcement.title,
    content: announcement.content,
    isPinned: announcement.isPinned,
  }
  showEditModal.value = true
}

async function updateAnnouncement() {
  if (!editingAnnouncement.value || !editForm.value.title || !editForm.value.content) return

  isUpdating.value = true
  try {
    await $fetch(`/api/v1/events/${eventId.value}/announcements/${editingAnnouncement.value.id}`, {
      method: 'PATCH',
      body: editForm.value,
    })
    toast.add({
      title: 'Announcement Updated',
      description: 'Your changes have been saved',
      color: 'green',
    })
    showEditModal.value = false
    await refreshAnnouncements()
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to update announcement',
      color: 'red',
    })
  } finally {
    isUpdating.value = false
  }
}

// Toggle pinned status
async function togglePinned(announcement: any) {
  try {
    await $fetch(`/api/v1/events/${eventId.value}/announcements/${announcement.id}`, {
      method: 'PATCH',
      body: { isPinned: !announcement.isPinned },
    })
    await refreshAnnouncements()
    toast.add({
      title: announcement.isPinned ? 'Unpinned' : 'Pinned',
      description: announcement.isPinned
        ? 'Announcement removed from top'
        : 'Announcement will appear at the top',
      color: 'green',
    })
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to update announcement',
      color: 'red',
    })
  }
}

// Toggle published status
async function togglePublished(announcement: any) {
  try {
    await $fetch(`/api/v1/events/${eventId.value}/announcements/${announcement.id}`, {
      method: 'PATCH',
      body: { isPublished: !announcement.isPublished },
    })
    await refreshAnnouncements()
    toast.add({
      title: announcement.isPublished ? 'Unpublished' : 'Published',
      description: announcement.isPublished
        ? 'Announcement is now hidden from attendees'
        : 'Announcement is now visible to everyone',
      color: 'green',
    })
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to update announcement',
      color: 'red',
    })
  }
}

// Delete announcement confirmation
const showDeleteModal = ref(false)
const deletingAnnouncement = ref<any>(null)
const isDeleting = ref(false)

function openDeleteModal(announcement: any) {
  deletingAnnouncement.value = announcement
  showDeleteModal.value = true
}

async function deleteAnnouncement() {
  if (!deletingAnnouncement.value) return

  isDeleting.value = true
  try {
    await $fetch(`/api/v1/events/${eventId.value}/announcements/${deletingAnnouncement.value.id}`, {
      method: 'DELETE',
    })
    toast.add({
      title: 'Announcement Deleted',
      description: 'The announcement has been removed',
      color: 'green',
    })
    showDeleteModal.value = false
    await refreshAnnouncements()
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to delete announcement',
      color: 'red',
    })
  } finally {
    isDeleting.value = false
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
</script>

<template>
  <div class="py-8">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Loading -->
      <div v-if="eventPending || announcementsPending" class="space-y-4">
        <USkeleton class="h-8 w-1/3" />
        <USkeleton class="h-4 w-1/4" />
        <div class="mt-8 space-y-4">
          <USkeleton v-for="i in 3" :key="i" class="h-32" />
        </div>
      </div>

      <!-- Content -->
      <div v-else-if="event">
        <!-- Header -->
        <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <NuxtLink
              :to="`/dashboard/events/${eventId}`"
              class="text-gray-600 dark:text-gray-400 hover:text-primary flex items-center gap-1 mb-2"
            >
              <UIcon name="i-heroicons-arrow-left" class="w-4 h-4" />
              Back to Event
            </NuxtLink>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
              Announcements
            </h1>
            <p class="text-gray-600 dark:text-gray-400 mt-1">
              Post news and updates for your attendees
            </p>
          </div>

          <UButton
            color="primary"
            icon="i-heroicons-megaphone"
            @click="openAddModal"
          >
            New Announcement
          </UButton>
        </div>

        <!-- Announcements List -->
        <div v-if="announcements.length > 0" class="space-y-4">
          <UCard
            v-for="announcement in announcements"
            :key="announcement.id"
            :class="{ 'opacity-60': !announcement.isPublished }"
          >
            <div class="flex flex-col gap-4">
              <div class="flex items-start justify-between gap-4">
                <div class="flex-1">
                  <div class="flex items-center gap-2 mb-2">
                    <UBadge
                      v-if="announcement.isPinned"
                      color="orange"
                      variant="soft"
                      size="xs"
                    >
                      <UIcon name="i-heroicons-pin" class="w-3 h-3 mr-1" />
                      Pinned
                    </UBadge>
                    <UBadge
                      v-if="!announcement.isPublished"
                      color="gray"
                      variant="soft"
                      size="xs"
                    >
                      Draft
                    </UBadge>
                    <span class="text-xs text-gray-500">
                      {{ formatDate(announcement.createdAt) }}
                    </span>
                  </div>

                  <h3 class="font-semibold text-gray-900 dark:text-white text-lg mb-2">
                    {{ announcement.title }}
                  </h3>

                  <p class="text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                    {{ announcement.content }}
                  </p>
                </div>

                <div class="flex flex-col gap-2">
                  <UButton
                    :color="announcement.isPinned ? 'orange' : 'gray'"
                    :variant="announcement.isPinned ? 'soft' : 'ghost'"
                    size="sm"
                    icon="i-heroicons-pin"
                    @click="togglePinned(announcement)"
                    :title="announcement.isPinned ? 'Unpin' : 'Pin to top'"
                  />
                  <UButton
                    color="gray"
                    variant="ghost"
                    size="sm"
                    icon="i-heroicons-pencil"
                    @click="openEditModal(announcement)"
                  />
                  <UButton
                    color="red"
                    variant="ghost"
                    size="sm"
                    icon="i-heroicons-trash"
                    @click="openDeleteModal(announcement)"
                  />
                </div>
              </div>

              <div class="flex items-center gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
                <span class="text-sm text-gray-500">Visibility:</span>
                <UToggle
                  :model-value="announcement.isPublished"
                  @update:model-value="togglePublished(announcement)"
                />
                <span class="text-sm" :class="announcement.isPublished ? 'text-green-600' : 'text-gray-500'">
                  {{ announcement.isPublished ? 'Published' : 'Hidden' }}
                </span>
              </div>
            </div>
          </UCard>
        </div>

        <!-- Empty State -->
        <UCard v-else>
          <div class="text-center py-12">
            <UIcon name="i-heroicons-megaphone" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No announcements yet</h3>
            <p class="text-gray-500 mb-6">
              Keep your attendees informed with news and updates.
            </p>
            <UButton
              color="primary"
              icon="i-heroicons-megaphone"
              @click="openAddModal"
            >
              Post First Announcement
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

    <!-- Add Announcement Modal -->
    <UModal v-model="showAddModal">
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <div class="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
              <UIcon name="i-heroicons-megaphone" class="w-5 h-5 text-primary" />
            </div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              New Announcement
            </h3>
          </div>
        </template>

        <div class="space-y-4">
          <UFormGroup label="Title" required>
            <UInput
              v-model="addForm.title"
              placeholder="e.g., Important venue change"
            />
          </UFormGroup>

          <UFormGroup label="Content" required>
            <UTextarea
              v-model="addForm.content"
              placeholder="Write your announcement..."
              :rows="6"
            />
          </UFormGroup>

          <UCheckbox
            v-model="addForm.isPinned"
            label="Pin to top"
            help="Pinned announcements always appear first"
          />
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
              :disabled="!addForm.title || !addForm.content"
              @click="addAnnouncement"
            >
              Post Announcement
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Edit Announcement Modal -->
    <UModal v-model="showEditModal">
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <div class="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
              <UIcon name="i-heroicons-pencil-square" class="w-5 h-5 text-primary" />
            </div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Edit Announcement
            </h3>
          </div>
        </template>

        <div class="space-y-4">
          <UFormGroup label="Title" required>
            <UInput v-model="editForm.title" />
          </UFormGroup>

          <UFormGroup label="Content" required>
            <UTextarea
              v-model="editForm.content"
              :rows="6"
            />
          </UFormGroup>

          <UCheckbox
            v-model="editForm.isPinned"
            label="Pin to top"
            help="Pinned announcements always appear first"
          />
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
              :disabled="!editForm.title || !editForm.content"
              @click="updateAnnouncement"
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
              Delete Announcement
            </h3>
          </div>
        </template>

        <div v-if="deletingAnnouncement" class="space-y-4">
          <p class="text-gray-600 dark:text-gray-400">
            Are you sure you want to delete this announcement?
          </p>
          <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p class="font-medium text-gray-900 dark:text-white">
              {{ deletingAnnouncement.title }}
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
              @click="deleteAnnouncement"
            >
              Delete
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
