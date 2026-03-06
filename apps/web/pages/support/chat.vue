<script setup lang="ts">
definePageMeta({
  layout: 'default',
})

useHead({ title: 'Support - NVYT' })

const route = useRoute()
const {
  conversation,
  messages,
  isLoading,
  loadByToken,
  sendMessage,
  startConversation,
  initChat,
  markAsRead,
} = useSupportChat()

const toast = useToast()
const error = ref('')
const loaded = ref(false)

onMounted(async () => {
  const token = route.query.token as string
  if (token) {
    await loadByToken(token)
  } else {
    await initChat()
  }
  loaded.value = true

  if (conversation.value) {
    markAsRead()
  }
})

async function onPreChatSubmit(data: { name: string; email: string; message: string }) {
  error.value = ''
  try {
    await startConversation(data.name, data.email, data.message)
  } catch (e: any) {
    error.value = e.message || 'Failed to start conversation'
  }
}

async function onSendMessage(content: string, attachments?: any[]) {
  try {
    await sendMessage(content, attachments)
  } catch (e: any) {
    toast.add({ title: e.message || 'Failed to send message', color: 'red' })
  }
}

const isClosed = computed(() => {
  return conversation.value?.status === 'resolved' || conversation.value?.status === 'closed'
})

const statusLabel = computed(() => {
  if (!conversation.value) return ''
  const s = conversation.value.status
  if (s === 'resolved' || s === 'closed') return 'This conversation has been ' + s
  return ''
})
</script>

<template>
  <div class="max-w-2xl mx-auto px-4 py-8">
    <div class="bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col" style="height: calc(100vh - 12rem);">
      <!-- Header -->
      <div class="flex items-center gap-2 px-4 py-3 bg-primary-500 text-white">
        <UIcon name="i-heroicons-chat-bubble-left-right" class="w-5 h-5" />
        <span class="font-semibold">Support Chat</span>
      </div>

      <!-- Loading -->
      <div v-if="!loaded" class="flex-1 flex items-center justify-center">
        <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-gray-400" />
      </div>

      <!-- Conversation view -->
      <template v-else-if="conversation">
        <SupportMessageList :messages="messages" class="flex-1" />

        <div v-if="isClosed" class="px-4 py-2 bg-gray-50 dark:bg-gray-800 text-center">
          <p class="text-xs text-gray-500">{{ statusLabel }}</p>
        </div>

        <SupportMessageInput
          v-if="!isClosed"
          @send="onSendMessage"
        />
      </template>

      <!-- Pre-chat form -->
      <template v-else>
        <div class="flex-1 overflow-y-auto">
          <p v-if="error" class="text-red-500 text-sm text-center px-4 pt-3">{{ error }}</p>
          <SupportPreChatForm @submit="onPreChatSubmit" />
        </div>
      </template>
    </div>
  </div>
</template>
