<script setup lang="ts">
const props = defineProps<{
  messages: any[]
}>()

const container = ref<HTMLElement | null>(null)

function scrollToBottom() {
  nextTick(() => {
    if (container.value) {
      container.value.scrollTop = container.value.scrollHeight
    }
  })
}

// Auto-scroll on new messages
watch(() => props.messages.length, () => {
  scrollToBottom()
})

onMounted(() => {
  scrollToBottom()
})

defineExpose({ scrollToBottom })
</script>

<template>
  <div ref="container" class="flex-1 overflow-y-auto px-3 py-2 space-y-2">
    <SupportMessageBubble
      v-for="message in messages"
      :key="message.id"
      :message="message"
    />

    <div v-if="messages.length === 0" class="flex items-center justify-center h-full">
      <p class="text-sm text-gray-400">No messages yet</p>
    </div>
  </div>
</template>
