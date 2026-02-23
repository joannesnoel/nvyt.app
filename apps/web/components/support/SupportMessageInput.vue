<script setup lang="ts">
const emit = defineEmits<{
  send: [content: string, attachments?: any[]]
}>()

const content = ref('')
const isUploading = ref(false)
const pendingAttachments = ref<any[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
const toast = useToast()

const { uploadAttachment } = useSupportChat()

function triggerUpload() {
  fileInput.value?.click()
}

async function onFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  // Reset input
  input.value = ''

  if (file.size > 10 * 1024 * 1024) {
    toast.add({ title: 'File too large (max 10MB)', color: 'red' })
    return
  }

  isUploading.value = true
  try {
    const attachment = await uploadAttachment(file)
    pendingAttachments.value.push(attachment)
  } catch (error: any) {
    toast.add({ title: error?.message || 'Upload failed', color: 'red' })
  } finally {
    isUploading.value = false
  }
}

function removeAttachment(index: number) {
  pendingAttachments.value.splice(index, 1)
}

function onSend() {
  const text = content.value.trim()
  const attachments = pendingAttachments.value.length > 0
    ? [...pendingAttachments.value]
    : undefined

  if (!text && !attachments) return

  emit('send', text, attachments)
  content.value = ''
  pendingAttachments.value = []
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    onSend()
  }
}
</script>

<template>
  <div class="border-t border-gray-200 dark:border-gray-700 p-2">
    <!-- Pending attachments preview -->
    <div v-if="pendingAttachments.length > 0" class="flex flex-wrap gap-1 mb-2 px-1">
      <div
        v-for="(att, i) in pendingAttachments"
        :key="i"
        class="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded px-2 py-1 text-xs"
      >
        <UIcon name="i-heroicons-paper-clip" class="w-3 h-3" />
        <span class="truncate max-w-[120px]">{{ att.filename }}</span>
        <UButton
          icon="i-heroicons-x-mark"
          color="gray"
          variant="ghost"
          size="2xs"
          :padded="false"
          @click="removeAttachment(i)"
        />
      </div>
    </div>

    <div class="flex items-end gap-1">
      <input
        ref="fileInput"
        type="file"
        class="hidden"
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
        @change="onFileSelected"
      />

      <UButton
        icon="i-heroicons-paper-clip"
        color="gray"
        variant="ghost"
        size="sm"
        :loading="isUploading"
        @click="triggerUpload"
      />

      <UTextarea
        v-model="content"
        placeholder="Type a message..."
        :rows="1"
        size="sm"
        autoresize
        :maxrows="4"
        class="flex-1"
        @keydown="onKeydown"
      />

      <UButton
        icon="i-heroicons-paper-airplane"
        color="primary"
        size="sm"
        :disabled="!content.trim() && pendingAttachments.length === 0"
        @click="onSend"
      />
    </div>
  </div>
</template>
