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
useHead(() => ({ title: event.value?.title ? `Team - ${event.value.title} - NVYT` : 'NVYT' }))

// Fetch collaborators
const { data: collaboratorsResponse, pending: collaboratorsPending, refresh: refreshCollaborators } = await useFetch(
  () => `/api/v1/events/${eventId.value}/collaborators`,
  { watch: [eventId] }
)
const collaborators = computed(() => collaboratorsResponse.value?.data?.collaborators ?? [])
const isOwner = computed(() => collaboratorsResponse.value?.data?.isOwner ?? false)

// Invite modal state
const showInviteModal = ref(false)
const inviteEmail = ref('')
const invitePermissions = ref({
  canEdit: false,
  canPublish: false,
  canManageTickets: false,
  canCheckIn: true,
  canManageAttendees: false,
  canViewTickets: false,
  canViewAnalytics: true,
})
const isInviting = ref(false)

// Edit modal state
const showEditModal = ref(false)
const editingCollaborator = ref<any>(null)
const editPermissions = ref({
  canEdit: false,
  canPublish: false,
  canManageTickets: false,
  canCheckIn: false,
  canManageAttendees: false,
  canViewTickets: false,
  canViewAnalytics: false,
})
const isUpdating = ref(false)

// Remove confirmation
const showRemoveModal = ref(false)
const removingCollaborator = ref<any>(null)
const isRemoving = ref(false)

const permissions = [
  { key: 'canEdit', label: 'Edit Event', description: 'Can edit event details, title, description, etc.' },
  { key: 'canPublish', label: 'Publish/Unpublish', description: 'Can publish or unpublish the event' },
  { key: 'canManageTickets', label: 'Manage Tickets', description: 'Can create, edit, and delete ticket types' },
  { key: 'canCheckIn', label: 'Check-in', description: 'Can check-in attendees at the event' },
  { key: 'canManageAttendees', label: 'Manage Attendees', description: 'Can approve, reject, or remove attendees' },
  { key: 'canViewTickets', label: 'View Tickets', description: 'Can view ticket QR codes and download tickets' },
  { key: 'canViewAnalytics', label: 'View Analytics', description: 'Can view event statistics and reports' },
] as const

function openInviteModal() {
  inviteEmail.value = ''
  invitePermissions.value = {
    canEdit: false,
    canPublish: false,
    canManageTickets: false,
    canCheckIn: true,
    canManageAttendees: false,
    canViewTickets: false,
    canViewAnalytics: true,
  }
  showInviteModal.value = true
}

async function inviteCollaborator() {
  if (!inviteEmail.value) return

  isInviting.value = true
  try {
    await $fetch(`/api/v1/events/${eventId.value}/collaborators`, {
      method: 'POST',
      body: {
        email: inviteEmail.value,
        ...invitePermissions.value,
      },
    })
    toast.add({
      title: 'Invitation Sent',
      description: `Invitation sent to ${inviteEmail.value}`,
      color: 'green',
    })
    showInviteModal.value = false
    await refreshCollaborators()
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to invite collaborator',
      color: 'red',
    })
  } finally {
    isInviting.value = false
  }
}

function openEditModal(collaborator: any) {
  editingCollaborator.value = collaborator
  editPermissions.value = {
    canEdit: collaborator.canEdit,
    canPublish: collaborator.canPublish,
    canManageTickets: collaborator.canManageTickets,
    canCheckIn: collaborator.canCheckIn,
    canManageAttendees: collaborator.canManageAttendees,
    canViewTickets: collaborator.canViewTickets,
    canViewAnalytics: collaborator.canViewAnalytics,
  }
  showEditModal.value = true
}

async function updateCollaborator() {
  if (!editingCollaborator.value) return

  isUpdating.value = true
  try {
    await $fetch(`/api/v1/events/${eventId.value}/collaborators/${editingCollaborator.value.id}`, {
      method: 'PATCH',
      body: editPermissions.value,
    })
    toast.add({
      title: 'Permissions Updated',
      description: 'Collaborator permissions have been updated',
      color: 'green',
    })
    showEditModal.value = false
    await refreshCollaborators()
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to update permissions',
      color: 'red',
    })
  } finally {
    isUpdating.value = false
  }
}

function openRemoveModal(collaborator: any) {
  removingCollaborator.value = collaborator
  showRemoveModal.value = true
}

async function removeCollaborator() {
  if (!removingCollaborator.value) return

  isRemoving.value = true
  try {
    await $fetch(`/api/v1/events/${eventId.value}/collaborators/${removingCollaborator.value.id}`, {
      method: 'DELETE' as const,
    })
    toast.add({
      title: 'Collaborator Removed',
      description: 'Collaborator has been removed from the team',
      color: 'green',
    })
    showRemoveModal.value = false
    await refreshCollaborators()
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to remove collaborator',
      color: 'red',
    })
  } finally {
    isRemoving.value = false
  }
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function getPermissionBadges(collaborator: any) {
  const badges = []
  if (collaborator.canEdit) badges.push('Edit')
  if (collaborator.canPublish) badges.push('Publish')
  if (collaborator.canManageTickets) badges.push('Tickets')
  if (collaborator.canCheckIn) badges.push('Check-in')
  if (collaborator.canManageAttendees) badges.push('Attendees')
  if (collaborator.canViewAnalytics) badges.push('Analytics')
  return badges
}
</script>

<template>
  <div class="sm:py-8">
    <div class="px-4 sm:px-6 lg:px-8">
      <!-- Loading -->
      <div v-if="eventPending || collaboratorsPending" class="space-y-4">
        <USkeleton class="h-8 w-1/3" />
        <USkeleton class="h-4 w-1/4" />
        <div class="mt-8 space-y-4">
          <USkeleton v-for="i in 3" :key="i" class="h-20" />
        </div>
      </div>

      <!-- Content -->
      <div v-else-if="event">
        <!-- Header -->
        <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
              Team Members
            </h1>
            <p class="text-gray-600 dark:text-gray-400 mt-1">
              Manage who can help organize {{ event.title }}
            </p>
          </div>

          <UButton
            v-if="isOwner"
            color="primary"
            icon="i-heroicons-user-plus"
            @click="openInviteModal"
          >
            Invite Member
          </UButton>
        </div>

        <!-- Owner Card -->
        <UCard class="mb-6">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-4">
              <UAvatar
                :src="event.organizer?.avatarUrl ?? undefined"
                :alt="event.organizer?.name ?? undefined"
                size="lg"
              />
              <div>
                <div class="flex items-center gap-2">
                  <p class="font-semibold text-gray-900 dark:text-white">
                    {{ event.organizer?.name || 'Event Organizer' }}
                  </p>
                  <UBadge color="primary" variant="soft" size="xs">Owner</UBadge>
                </div>
                <p class="text-sm text-gray-500">{{ (event.organizer as any)?.email }}</p>
              </div>
            </div>
            <p class="text-sm text-gray-500">Full access</p>
          </div>
        </UCard>

        <!-- Collaborators List -->
        <div v-if="collaborators.length > 0" class="space-y-4">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Collaborators</h2>

          <UCard v-for="collaborator in collaborators" :key="collaborator.id">
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div class="flex items-center gap-4">
                <UAvatar
                  :src="(collaborator.user as any)?.avatarUrl ?? undefined"
                  :alt="collaborator.user?.name ?? undefined"
                  size="lg"
                />
                <div>
                  <div class="flex items-center gap-2 flex-wrap">
                    <p class="font-semibold text-gray-900 dark:text-white">
                      {{ collaborator.user?.name || 'Invited User' }}
                    </p>
                    <UBadge
                      v-if="!collaborator.acceptedAt"
                      color="yellow"
                      variant="soft"
                      size="xs"
                    >
                      Pending
                    </UBadge>
                  </div>
                  <p class="text-sm text-gray-500">{{ collaborator.user?.email }}</p>
                  <p class="text-xs text-gray-400 mt-1">
                    Invited {{ formatDate(collaborator.invitedAt) }}
                    <span v-if="collaborator.acceptedAt">
                      &middot; Accepted {{ formatDate(collaborator.acceptedAt) }}
                    </span>
                  </p>
                </div>
              </div>

              <div class="flex flex-col md:flex-row md:items-center gap-3">
                <!-- Permission badges -->
                <div class="flex flex-wrap gap-1">
                  <UBadge
                    v-for="badge in getPermissionBadges(collaborator)"
                    :key="badge"
                    color="gray"
                    variant="soft"
                    size="xs"
                  >
                    {{ badge }}
                  </UBadge>
                </div>

                <!-- Actions -->
                <div v-if="isOwner" class="flex flex-wrap gap-2">
                  <UButton
                    color="gray"
                    variant="outline"
                    size="sm"
                    icon="i-heroicons-pencil"
                    @click="openEditModal(collaborator)"
                  >
                    Edit
                  </UButton>
                  <UButton
                    color="red"
                    variant="outline"
                    size="sm"
                    icon="i-heroicons-trash"
                    @click="openRemoveModal(collaborator)"
                  />
                </div>
              </div>
            </div>
          </UCard>
        </div>

        <!-- Empty State -->
        <UCard v-else>
          <div class="text-center py-8">
            <UIcon name="i-heroicons-user-group" class="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-1">No team members yet</h3>
            <p class="text-gray-500 mb-4">
              Invite team members to help you manage this event.
            </p>
            <UButton
              v-if="isOwner"
              color="primary"
              icon="i-heroicons-user-plus"
              @click="openInviteModal"
            >
              Invite Member
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

    <!-- Invite Modal -->
    <UModal v-model="showInviteModal">
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <div class="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
              <UIcon name="i-heroicons-user-plus" class="w-5 h-5 text-primary" />
            </div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Invite Team Member
            </h3>
          </div>
        </template>

        <div class="space-y-6">
          <UFormGroup label="Email Address" required>
            <UInput
              v-model="inviteEmail"
              type="email"
              placeholder="teammate@example.com"
            />
            <template #hint>
              <span class="text-gray-500">User must have an account to be invited</span>
            </template>
          </UFormGroup>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Permissions
            </label>
            <div class="space-y-3">
              <div
                v-for="perm in permissions"
                :key="perm.key"
                class="flex items-start gap-3"
              >
                <UToggle
                  v-model="invitePermissions[perm.key as keyof typeof invitePermissions]"
                  class="mt-0.5"
                />
                <div>
                  <p class="font-medium text-gray-900 dark:text-white text-sm">{{ perm.label }}</p>
                  <p class="text-xs text-gray-500">{{ perm.description }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton
              color="gray"
              variant="outline"
              @click="showInviteModal = false"
            >
              Cancel
            </UButton>
            <UButton
              color="primary"
              :loading="isInviting"
              :disabled="!inviteEmail"
              @click="inviteCollaborator"
            >
              Send Invitation
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Edit Modal -->
    <UModal v-model="showEditModal">
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <div class="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
              <UIcon name="i-heroicons-pencil-square" class="w-5 h-5 text-primary" />
            </div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Edit Permissions
            </h3>
          </div>
        </template>

        <div v-if="editingCollaborator" class="space-y-6">
          <div class="flex items-center gap-3">
            <UAvatar
              :src="editingCollaborator.user?.avatarUrl"
              :alt="editingCollaborator.user?.name"
              size="sm"
            />
            <div>
              <p class="font-medium text-gray-900 dark:text-white">
                {{ editingCollaborator.user?.name }}
              </p>
              <p class="text-sm text-gray-500">{{ editingCollaborator.user?.email }}</p>
            </div>
          </div>

          <div class="space-y-3">
            <div
              v-for="perm in permissions"
              :key="perm.key"
              class="flex items-start gap-3"
            >
              <UToggle
                v-model="editPermissions[perm.key as keyof typeof editPermissions]"
                class="mt-0.5"
              />
              <div>
                <p class="font-medium text-gray-900 dark:text-white text-sm">{{ perm.label }}</p>
                <p class="text-xs text-gray-500">{{ perm.description }}</p>
              </div>
            </div>
          </div>
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
              @click="updateCollaborator"
            >
              Save Changes
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Remove Confirmation Modal -->
    <UModal v-model="showRemoveModal">
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <div class="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-red-600" />
            </div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Remove Team Member
            </h3>
          </div>
        </template>

        <div v-if="removingCollaborator" class="space-y-4">
          <p class="text-gray-600 dark:text-gray-400">
            Are you sure you want to remove <strong>{{ removingCollaborator.user?.name }}</strong> from the team?
          </p>
          <p class="text-sm text-gray-500">
            They will no longer be able to access or manage this event.
          </p>
        </div>

        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton
              color="gray"
              variant="outline"
              @click="showRemoveModal = false"
            >
              Cancel
            </UButton>
            <UButton
              color="red"
              :loading="isRemoving"
              @click="removeCollaborator"
            >
              Remove
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
