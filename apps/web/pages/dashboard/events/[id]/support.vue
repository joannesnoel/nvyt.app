<script setup lang="ts">
definePageMeta({
  layout: 'dashboard',
})

const route = useRoute()
const toast = useToast()
const { subscribe, events: pusherEvents } = usePusher()
const { user } = useAuth()

const eventId = computed(() => route.params.id as string)

useHead({ title: 'Support - NVYT' })

// Fetch conversations
const queryParams = computed(() => ({
  page: 1,
  limit: 50,
}))

const { data: listData, pending: listPending, refresh: refreshList } = await useFetch(
  () => `/api/v1/events/${eventId.value}/support/conversations`,
  { query: queryParams, watch: [eventId] }
)

const conversations = computed(() => (listData.value as any)?.data || [])

// Selected conversation
const selectedId = ref<string | null>(null)
const selectedConversation = ref<any>(null)
const selectedMessages = ref<any[]>([])
const detailLoading = ref(false)

async function selectConversation(id: string) {
  selectedId.value = id
  detailLoading.value = true

  try {
    const res = await $fetch(`/api/v1/events/${eventId.value}/support/conversations/${id}`)
    const data = (res as any)?.data
    selectedConversation.value = data
    selectedMessages.value = data?.messages || []
    refreshList()
  } catch {
    toast.add({ title: 'Failed to load conversation', color: 'red' })
  } finally {
    detailLoading.value = false
  }
}

// Send reply
async function onSendReply(content: string, attachments?: any[]) {
  if (!selectedId.value) return

  try {
    const res = await $fetch(`/api/v1/events/${eventId.value}/support/conversations/${selectedId.value}/messages`, {
      method: 'POST',
      body: { content, attachments },
    })
    const msg = (res as any)?.data
    if (msg) {
      selectedMessages.value.push(msg)
    }
  } catch (e: any) {
    toast.add({ title: e?.data?.message || 'Failed to send reply', color: 'red' })
  }
}

// Real-time updates
onMounted(() => {
  const channelName = `support-event-${eventId.value}`
  const channel = subscribe(channelName)
  if (channel) {
    channel.bind(pusherEvents.SUPPORT_NEW_CONVERSATION, () => {
      refreshList()
    })
    channel.bind(pusherEvents.SUPPORT_NEW_MESSAGE, (data: any) => {
      if (data.conversationId === selectedId.value && data.message?.senderType === 'visitor') {
        selectedMessages.value.push(data.message)
      }
      refreshList()
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
</script>

<template>
  <div class="h-[calc(100vh-7rem)] -my-6 -mx-4 sm:-mx-6 lg:-mx-8">
    <div class="flex h-full">
      <!-- Left Panel: Conversation List -->
      <div class="w-full md:w-80 border-r border-gray-200 dark:border-gray-700 flex flex-col" :class="{ 'hidden md:flex': selectedId }">
        <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h1 class="text-lg font-semibold text-gray-900 dark:text-white">Support Chat</h1>
          <p class="text-xs text-gray-500">Conversations for this event</p>
        </div>

        <div class="flex-1 overflow-y-auto">
          <div v-if="listPending" class="p-4 text-center">
            <UIcon name="i-heroicons-arrow-path" class="w-5 h-5 animate-spin text-gray-400" />
          </div>

          <div v-else-if="conversations.length === 0" class="p-8 text-center text-sm text-gray-400">
            <UIcon name="i-heroicons-chat-bubble-left-right" class="w-8 h-8 mx-auto mb-2" />
            <p>No conversations yet</p>
            <p class="text-xs mt-1">Visitors who need help with this event will appear here.</p>
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
      </div>

      <!-- Right Panel: Conversation Detail -->
      <div class="flex-1 flex flex-col" :class="{ 'hidden md:flex': !selectedId }">
        <div v-if="!selectedId" class="flex-1 flex items-center justify-center text-gray-400">
          <div class="text-center">
            <UIcon name="i-heroicons-chat-bubble-left-right" class="w-12 h-12 mx-auto mb-2" />
            <p>Select a conversation</p>
          </div>
        </div>

        <div v-else-if="detailLoading" class="flex-1 flex items-center justify-center">
          <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-gray-400" />
        </div>

        <template v-else-if="selectedConversation">
          <!-- Header -->
          <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <div class="flex items-center gap-3">
              <UButton
                icon="i-heroicons-arrow-left"
                color="gray"
                variant="ghost"
                size="sm"
                class="md:hidden"
                @click="selectedId = null"
              />
              <div>
                <div class="flex items-center gap-2">
                  <span class="font-semibold text-gray-900 dark:text-white">
                    {{ selectedConversation.visitorName }}
                  </span>
                  <span v-if="selectedConversation.visitorOnline" class="w-2 h-2 rounded-full bg-green-500" />
                  <UBadge :color="statusColor(selectedConversation.status)" variant="soft" size="xs">
                    {{ statusLabel(selectedConversation.status) }}
                  </UBadge>
                </div>
                <p v-if="selectedConversation.visitorEmail" class="text-xs text-gray-500">
                  {{ selectedConversation.visitorEmail }}
                </p>
              </div>
            </div>
          </div>

          <SupportMessageList :messages="selectedMessages" class="flex-1" />

          <SupportMessageInput
            v-if="selectedConversation.status !== 'closed'"
            @send="onSendReply"
          />
        </template>
      </div>
    </div>
  </div>
</template>
