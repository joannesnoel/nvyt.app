<script setup lang="ts">
const props = defineProps<{
  message: {
    id: string
    senderType: string
    senderName: string
    content: string | null
    attachments: any[] | null
    createdAt: string
  }
}>()

const isVisitor = computed(() => props.message.senderType === 'visitor')

function formatTime(date: string) {
  return new Date(date).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function isImage(contentType: string) {
  return contentType?.startsWith('image/')
}
</script>

<template>
  <div class="flex" :class="isVisitor ? 'justify-end' : 'justify-start'">
    <div
      class="max-w-[80%] rounded-lg px-3 py-2"
      :class="isVisitor
        ? 'bg-primary-500 text-white'
        : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'"
    >
      <!-- Sender name for non-visitor -->
      <p v-if="!isVisitor" class="text-xs font-medium mb-0.5" :class="isVisitor ? 'text-primary-100' : 'text-primary-600 dark:text-primary-400'">
        {{ message.senderName }}
      </p>

      <!-- Content -->
      <p v-if="message.content" class="text-sm whitespace-pre-wrap break-words">
        {{ message.content }}
      </p>

      <!-- Attachments -->
      <div v-if="message.attachments && message.attachments.length > 0" class="mt-1 space-y-1">
        <template v-for="attachment in message.attachments" :key="attachment.key">
          <!-- Image -->
          <div v-if="isImage(attachment.contentType)" class="rounded overflow-hidden">
            <img
              :src="attachment.url"
              :alt="attachment.filename"
              class="max-w-full max-h-48 rounded cursor-pointer"
              @click="window.open(attachment.url, '_blank')"
            />
          </div>
          <!-- File download -->
          <a
            v-else
            :href="attachment.url"
            target="_blank"
            class="flex items-center gap-2 text-xs rounded px-2 py-1.5"
            :class="isVisitor ? 'bg-primary-600 hover:bg-primary-700' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'"
          >
            <UIcon name="i-heroicons-document-arrow-down" class="w-4 h-4 flex-shrink-0" />
            <span class="truncate">{{ attachment.filename }}</span>
          </a>
        </template>
      </div>

      <!-- Time -->
      <p class="text-[10px] mt-1" :class="isVisitor ? 'text-primary-200' : 'text-gray-400'">
        {{ formatTime(message.createdAt) }}
      </p>
    </div>
  </div>
</template>
