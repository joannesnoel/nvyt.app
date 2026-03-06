<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
})

useHead({ title: 'Support - Admin - NVYT' })

const toast = useToast()
const { subscribe, events: pusherEvents } = usePusher()
const { user } = useAuth()
const { refresh: refreshAdminUnread } = useAdminSupportUnread()

// Filters
const filters = reactive({
  status: '',
  search: '',
  assignedToMe: false,
  page: 1,
  limit: 20,
})

const debouncedSearch = ref(filters.search)
let searchTimeout: ReturnType<typeof setTimeout>
watch(() => filters.search, (val) => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    debouncedSearch.value = val
    filters.page = 1
  }, 300)
})

const queryParams = computed(() => {
  const params: Record<string, string | number | boolean> = {
    page: filters.page,
    limit: filters.limit,
  }
  if (filters.status) params.status = filters.status
  if (debouncedSearch.value) params.search = debouncedSearch.value
  if (filters.assignedToMe) params.assignedToMe = true
  return params
})

// Fetch conversations
const { data: listData, pending: listPending, refresh: refreshList } = await useFetch(
  '/api/v1/admin/support/conversations',
  { query: queryParams, watch: [queryParams] }
)

const conversations = computed(() => (listData.value as any)?.data || [])
const pagination = computed(() => ({
  page: (listData.value as any)?.meta?.page ?? 1,
  total: (listData.value as any)?.meta?.total ?? 0,
  totalPages: (listData.value as any)?.meta?.totalPages ?? 1,
}))

// Fetch stats
const { data: statsData, refresh: refreshStats } = await useFetch('/api/v1/admin/support/stats')
const stats = computed(() => (statsData.value as any)?.data || {})

// Selected conversation detail
const selectedId = ref<string | null>(null)
const selectedConversation = ref<any>(null)
const selectedMessages = ref<any[]>([])
const detailLoading = ref(false)

async function selectConversation(id: string) {
  selectedId.value = id
  detailLoading.value = true

  try {
    const res = await $fetch(`/api/v1/admin/support/conversations/${id}`)
    const data = (res as any)?.data
    selectedConversation.value = data
    selectedMessages.value = data?.messages || []

    // Refresh list to update unread counts
    refreshList()
    refreshStats()
    refreshAdminUnread()
  } catch {
    toast.add({ title: 'Failed to load conversation', color: 'red' })
  } finally {
    detailLoading.value = false
  }
}

// Send reply
const replyLoading = ref(false)

async function onSendReply(content: string, attachments?: any[]) {
  if (!selectedId.value) return
  replyLoading.value = true

  try {
    const res = await $fetch(`/api/v1/admin/support/conversations/${selectedId.value}/messages`, {
      method: 'POST',
      body: { content, attachments },
    })
    const msg = (res as any)?.data
    if (msg) {
      selectedMessages.value.push(msg)
    }
  } catch (e: any) {
    toast.add({ title: e?.data?.message || 'Failed to send reply', color: 'red' })
  } finally {
    replyLoading.value = false
  }
}

// Update conversation
async function updateConversation(updates: { status?: string; assigneeId?: string | null }) {
  if (!selectedId.value) return

  try {
    const res = await $fetch(`/api/v1/admin/support/conversations/${selectedId.value}`, {
      method: 'PATCH',
      body: updates,
    })
    const updated = (res as any)?.data
    if (updated) {
      selectedConversation.value = { ...selectedConversation.value, ...updated }
    }
    refreshList()
    refreshStats()
    toast.add({ title: 'Conversation updated', color: 'green' })
  } catch (e: any) {
    toast.add({ title: e?.data?.message || 'Failed to update', color: 'red' })
  }
}

function resolveConversation() {
  updateConversation({ status: 'resolved' })
}

function closeConversation() {
  updateConversation({ status: 'closed' })
}

function assignToMe() {
  updateConversation({ assigneeId: user.value?.id })
}

// Real-time updates
onMounted(() => {
  const channel = subscribe('support-admin')
  if (channel) {
    channel.bind(pusherEvents.SUPPORT_NEW_CONVERSATION, () => {
      refreshList()
      refreshStats()
    })
    channel.bind(pusherEvents.SUPPORT_NEW_MESSAGE, (data: any) => {
      // If viewing this conversation, add the message
      if (data.conversationId === selectedId.value && data.message?.senderType === 'visitor') {
        selectedMessages.value.push(data.message)
        // Auto mark as read
        $fetch(`/api/v1/admin/support/conversations/${selectedId.value}`).catch(() => {})
      }
      refreshList()
      refreshStats()
    })
  }
})

function formatDate(date: string) {
  if (!date) return ''
  const d = new Date(date)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function statusColor(status: string) {
  switch (status) {
    case 'open': return 'blue'
    case 'waiting_on_support': return 'orange'
    case 'waiting_on_visitor': return 'yellow'
    case 'resolved': return 'green'
    case 'closed': return 'gray'
    default: return 'gray'
  }
}

function statusLabel(status: string) {
  return status.replace(/_/g, ' ')
}

const statusOptions = [
  { label: 'All', value: '' },
  { label: 'Open', value: 'open' },
  { label: 'Waiting on Support', value: 'waiting_on_support' },
  { label: 'Waiting on Visitor', value: 'waiting_on_visitor' },
  { label: 'Resolved', value: 'resolved' },
  { label: 'Closed', value: 'closed' },
]
</script>

<template>
  <div class="h-[calc(100vh-7rem)] -my-6 -mx-4 sm:-mx-6 lg:-mx-8">
    <div class="flex h-full">
      <!-- Left Panel: Conversation List -->
      <div class="w-full md:w-96 border-r border-gray-200 dark:border-gray-700 flex flex-col" :class="{ 'hidden md:flex': selectedId }">
        <!-- Stats -->
        <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h1 class="text-lg font-semibold text-gray-900 dark:text-white mb-3">Support</h1>
          <div class="grid grid-cols-3 gap-2">
            <div class="text-center p-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
              <p class="text-lg font-bold text-orange-600">{{ stats.waiting_on_support || 0 }}</p>
              <p class="text-xs text-gray-500">Waiting</p>
            </div>
            <div class="text-center p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p class="text-lg font-bold text-blue-600">{{ stats.open || 0 }}</p>
              <p class="text-xs text-gray-500">Open</p>
            </div>
            <div class="text-center p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <p class="text-lg font-bold text-green-600">{{ stats.resolved || 0 }}</p>
              <p class="text-xs text-gray-500">Resolved</p>
            </div>
          </div>
        </div>

        <!-- Filters -->
        <div class="px-3 py-2 border-b border-gray-200 dark:border-gray-700 space-y-2">
          <UInput
            v-model="filters.search"
            placeholder="Search..."
            icon="i-heroicons-magnifying-glass"
            size="sm"
          />
          <div class="flex gap-2">
            <USelect
              v-model="filters.status"
              :options="statusOptions"
              option-attribute="label"
              value-attribute="value"
              size="xs"
              class="flex-1"
            />
            <UToggle v-model="filters.assignedToMe" size="xs" />
            <span class="text-xs text-gray-500 self-center">Mine</span>
          </div>
        </div>

        <!-- Conversation list -->
        <div class="flex-1 overflow-y-auto">
          <div v-if="listPending" class="p-4 text-center">
            <UIcon name="i-heroicons-arrow-path" class="w-5 h-5 animate-spin text-gray-400" />
          </div>

          <div v-else-if="conversations.length === 0" class="p-4 text-center text-sm text-gray-400">
            No conversations found
          </div>

          <div
            v-for="conv in conversations"
            :key="conv.id"
            class="px-3 py-3 border-b border-gray-100 dark:border-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            :class="{ 'bg-primary-50 dark:bg-primary-900/20': selectedId === conv.id }"
            @click="selectConversation(conv.id)"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="font-medium text-sm text-gray-900 dark:text-white truncate">
                    {{ conv.visitorName }}
                  </span>
                  <span v-if="conv.visitorOnline" class="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                </div>
                <p v-if="conv.eventTitle" class="text-xs text-primary-500 truncate">
                  {{ conv.eventTitle }}
                </p>
                <p class="text-xs text-gray-500 truncate mt-0.5">
                  {{ conv.lastMessagePreview || 'No messages' }}
                </p>
              </div>
              <div class="flex flex-col items-end gap-1 flex-shrink-0">
                <span class="text-[10px] text-gray-400">{{ formatDate(conv.lastMessageAt) }}</span>
                <UBadge :color="statusColor(conv.status)" variant="soft" size="xs">
                  {{ statusLabel(conv.status) }}
                </UBadge>
                <span
                  v-if="conv.unreadBySupport > 0"
                  class="bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center"
                >
                  {{ conv.unreadBySupport }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Pagination -->
        <div v-if="pagination.totalPages > 1" class="p-2 border-t border-gray-200 dark:border-gray-700 flex justify-center">
          <UPagination
            v-model="filters.page"
            :page-count="filters.limit"
            :total="pagination.total"
            size="xs"
          />
        </div>
      </div>

      <!-- Right Panel: Conversation Detail -->
      <div class="flex-1 flex flex-col" :class="{ 'hidden md:flex': !selectedId }">
        <!-- Empty state -->
        <div v-if="!selectedId" class="flex-1 flex items-center justify-center text-gray-400">
          <div class="text-center">
            <UIcon name="i-heroicons-chat-bubble-left-right" class="w-12 h-12 mx-auto mb-2" />
            <p>Select a conversation</p>
          </div>
        </div>

        <!-- Loading -->
        <div v-else-if="detailLoading" class="flex-1 flex items-center justify-center">
          <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-gray-400" />
        </div>

        <!-- Detail -->
        <template v-else-if="selectedConversation">
          <!-- Header -->
          <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700 space-y-2">
            <!-- Top row: back button, name, status -->
            <div class="flex items-center gap-3 min-w-0">
              <UButton
                icon="i-heroicons-arrow-left"
                color="gray"
                variant="ghost"
                size="sm"
                class="md:hidden flex-shrink-0"
                @click="selectedId = null"
              />
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-semibold text-gray-900 dark:text-white truncate">
                    {{ selectedConversation.visitorName }}
                  </span>
                  <span v-if="selectedConversation.visitorOnline" class="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                  <UBadge :color="statusColor(selectedConversation.status)" variant="soft" size="xs" class="flex-shrink-0">
                    {{ statusLabel(selectedConversation.status) }}
                  </UBadge>
                </div>
                <p v-if="selectedConversation.visitorEmail" class="text-xs text-gray-500 truncate">
                  {{ selectedConversation.visitorEmail }}
                </p>
                <p v-if="selectedConversation.eventTitle" class="text-xs text-primary-500 truncate">
                  {{ selectedConversation.eventTitle }}
                </p>
              </div>
            </div>
            <!-- Action buttons -->
            <div class="flex items-center gap-1.5 flex-wrap">
              <UButton
                v-if="!selectedConversation.assigneeId"
                size="xs"
                color="gray"
                variant="soft"
                icon="i-heroicons-user-plus"
                @click="assignToMe"
              >
                Assign to me
              </UButton>
              <UButton
                v-if="selectedConversation.status !== 'resolved'"
                size="xs"
                color="green"
                variant="soft"
                icon="i-heroicons-check-circle"
                @click="resolveConversation"
              >
                Resolve
              </UButton>
              <UButton
                v-if="selectedConversation.status !== 'closed'"
                size="xs"
                color="gray"
                variant="soft"
                icon="i-heroicons-x-circle"
                @click="closeConversation"
              >
                Close
              </UButton>
            </div>
          </div>

          <!-- Messages -->
          <SupportMessageList :messages="selectedMessages" class="flex-1" />

          <!-- Reply input -->
          <SupportMessageInput
            v-if="selectedConversation.status !== 'closed'"
            @send="onSendReply"
          />
        </template>
      </div>
    </div>
  </div>
</template>
