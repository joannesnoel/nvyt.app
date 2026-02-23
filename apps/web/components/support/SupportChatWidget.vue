<script setup lang="ts">
const {
  isOpen,
  conversation,
  messages,
  isLoading,
  unreadCount,
  initChat,
  startConversation,
  startNewConversation,
  sendMessage,
  toggle,
  close,
  markAsRead,
} = useSupportChat()

const toast = useToast()
const error = ref('')

// Init on mount
onMounted(() => {
  initChat()
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

// Mark read when opening with existing conversation
watch(isOpen, (open) => {
  if (open && conversation.value) {
    markAsRead()
  }
})

const statusLabel = computed(() => {
  if (!conversation.value) return ''
  const s = conversation.value.status
  if (s === 'resolved' || s === 'closed') return 'This conversation has been ' + s
  return ''
})

const isClosed = computed(() => {
  return conversation.value?.status === 'resolved' || conversation.value?.status === 'closed'
})
</script>

<template>
  <ClientOnly>
    <div class="fixed bottom-4 right-4 z-50 flex flex-col items-end">
      <!-- Chat Panel -->
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0 translate-y-4 scale-95"
        enter-to-class="opacity-100 translate-y-0 scale-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="opacity-100 translate-y-0 scale-100"
        leave-to-class="opacity-0 translate-y-4 scale-95"
      >
        <div
          v-if="isOpen"
          class="mb-3 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col"
          :class="[
            'w-[calc(100vw-2rem)] sm:w-[400px]',
            'h-[calc(100vh-8rem)] sm:h-[500px]',
          ]"
        >
          <!-- Header -->
          <div class="flex items-center justify-between px-4 py-3 bg-primary-500 text-white">
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-chat-bubble-left-right" class="w-5 h-5" />
              <span class="font-semibold text-sm">Support Chat</span>
            </div>
            <UButton
              icon="i-heroicons-x-mark"
              color="white"
              variant="ghost"
              size="xs"
              @click="close"
            />
          </div>

          <!-- Body -->
          <template v-if="conversation">
            <!-- Message list -->
            <SupportMessageList :messages="messages" class="flex-1" />

            <!-- Status bar if closed -->
            <div v-if="isClosed" class="px-4 py-3 bg-gray-50 dark:bg-gray-800 text-center space-y-2">
              <p class="text-xs text-gray-500">{{ statusLabel }}</p>
              <UButton
                size="sm"
                color="primary"
                variant="solid"
                label="Start New Conversation"
                icon="i-heroicons-plus"
                @click="startNewConversation"
              />
            </div>

            <!-- Input -->
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
      </Transition>

      <!-- Floating Button -->
      <button
        @click="toggle"
        class="relative w-14 h-14 rounded-full bg-primary-500 hover:bg-primary-600 text-white shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-105"
      >
        <UIcon
          :name="isOpen ? 'i-heroicons-x-mark' : 'i-heroicons-chat-bubble-left-right'"
          class="w-6 h-6"
        />

        <!-- Unread badge -->
        <span
          v-if="unreadCount > 0 && !isOpen"
          class="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center"
        >
          {{ unreadCount > 9 ? '9+' : unreadCount }}
        </span>
      </button>
    </div>
  </ClientOnly>
</template>
