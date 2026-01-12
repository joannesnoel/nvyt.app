<script setup lang="ts">
const props = defineProps<{
  modelValue?: string
  folder?: string
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const uploading = ref(false)
const error = ref('')
const dragOver = ref(false)

const previewUrl = computed(() => props.modelValue || '')

const fileInput = ref<HTMLInputElement>()

function openFilePicker() {
  fileInput.value?.click()
}

async function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    await uploadFile(file)
  }
  // Reset input so same file can be selected again
  target.value = ''
}

function handleDrop(event: DragEvent) {
  event.preventDefault()
  dragOver.value = false

  const file = event.dataTransfer?.files?.[0]
  if (file && file.type.startsWith('image/')) {
    uploadFile(file)
  }
}

function handleDragOver(event: DragEvent) {
  event.preventDefault()
  dragOver.value = true
}

function handleDragLeave() {
  dragOver.value = false
}

async function uploadFile(file: File) {
  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  if (!allowedTypes.includes(file.type)) {
    error.value = 'Please upload a JPEG, PNG, GIF, or WebP image'
    return
  }

  // Validate file size (5MB)
  if (file.size > 5 * 1024 * 1024) {
    error.value = 'Image must be less than 5MB'
    return
  }

  uploading.value = true
  error.value = ''

  try {
    const formData = new FormData()
    formData.append('image', file)
    if (props.folder) {
      formData.append('folder', props.folder)
    }

    const response = await $fetch<{ success: boolean; data: { url: string } }>('/api/v1/uploads/image', {
      method: 'POST',
      body: formData,
    })

    if (response.success && response.data?.url) {
      emit('update:modelValue', response.data.url)
    }
  } catch (e: any) {
    error.value = e.data?.message || 'Failed to upload image'
  } finally {
    uploading.value = false
  }
}

function removeImage() {
  emit('update:modelValue', '')
}
</script>

<template>
  <div class="space-y-2">
    <!-- Hidden file input -->
    <input
      ref="fileInput"
      type="file"
      accept="image/jpeg,image/png,image/gif,image/webp"
      class="hidden"
      @change="handleFileSelect"
    >

    <!-- Preview or Upload Area -->
    <div
      v-if="previewUrl"
      class="relative rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700"
    >
      <img
        :src="previewUrl"
        alt="Cover image preview"
        class="w-full h-48 object-cover"
      >
      <div class="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
        <UButton
          icon="i-heroicons-arrow-path"
          color="white"
          variant="solid"
          size="sm"
          :loading="uploading"
          @click="openFilePicker"
        >
          Replace
        </UButton>
        <UButton
          icon="i-heroicons-trash"
          color="red"
          variant="solid"
          size="sm"
          @click="removeImage"
        >
          Remove
        </UButton>
      </div>
    </div>

    <!-- Drop Zone -->
    <div
      v-else
      class="border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer"
      :class="[
        dragOver
          ? 'border-primary bg-primary-50 dark:bg-primary-900/20'
          : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500',
        uploading ? 'pointer-events-none opacity-50' : ''
      ]"
      @click="openFilePicker"
      @drop="handleDrop"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
    >
      <UIcon
        v-if="!uploading"
        name="i-heroicons-photo"
        class="w-12 h-12 mx-auto text-gray-400 mb-3"
      />
      <UIcon
        v-else
        name="i-heroicons-arrow-path"
        class="w-12 h-12 mx-auto text-primary animate-spin mb-3"
      />
      <p class="text-sm text-gray-600 dark:text-gray-400">
        <template v-if="uploading">
          Uploading...
        </template>
        <template v-else>
          {{ placeholder || 'Click or drag image to upload' }}
        </template>
      </p>
      <p class="text-xs text-gray-500 mt-1">
        JPEG, PNG, GIF, or WebP up to 5MB
      </p>
    </div>

    <!-- Error Message -->
    <p v-if="error" class="text-sm text-red-500">
      {{ error }}
    </p>

    <!-- URL Input (fallback) -->
    <details class="text-sm">
      <summary class="text-gray-500 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
        Or enter image URL manually
      </summary>
      <div class="mt-2">
        <UInput
          :model-value="previewUrl"
          placeholder="https://example.com/image.jpg"
          icon="i-heroicons-link"
          @update:model-value="emit('update:modelValue', $event)"
        />
      </div>
    </details>
  </div>
</template>
