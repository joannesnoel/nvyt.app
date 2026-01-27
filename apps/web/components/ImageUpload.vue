<script setup lang="ts">
import { Cropper } from 'vue-advanced-cropper'
import 'vue-advanced-cropper/dist/style.css'

const props = withDefaults(defineProps<{
  modelValue?: string
  folder?: string
  placeholder?: string
  compact?: boolean
  // Cropping options
  enableCrop?: boolean
  aspectRatio?: number // e.g., 16/9, 1, or undefined for free
  cropperTitle?: string
}>(), {
  enableCrop: true,
  aspectRatio: 16 / 9,
  cropperTitle: 'Adjust Image',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const uploading = ref(false)
const imageLoading = ref(false) // Track when new image is loading in browser
const error = ref('')
const dragOver = ref(false)

// Cropper state
const showCropper = ref(false)
const cropperImageSrc = ref('')
const cropperRef = ref<InstanceType<typeof Cropper> | null>(null)
const originalFile = ref<File | null>(null)
const cropperLoading = ref(false)

const previewUrl = computed(() => props.modelValue || '')

const fileInput = ref<HTMLInputElement>()

function openFilePicker() {
  fileInput.value?.click()
}

async function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    await processFile(file)
  }
  // Reset input so same file can be selected again
  target.value = ''
}

function handleDrop(event: DragEvent) {
  event.preventDefault()
  dragOver.value = false

  const file = event.dataTransfer?.files?.[0]
  if (file && file.type.startsWith('image/')) {
    processFile(file)
  }
}

function handleDragOver(event: DragEvent) {
  event.preventDefault()
  dragOver.value = true
}

function handleDragLeave() {
  dragOver.value = false
}

async function processFile(file: File) {
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

  error.value = ''

  if (props.enableCrop) {
    // Show cropper modal with loading state
    originalFile.value = file
    cropperLoading.value = true
    cropperImageSrc.value = URL.createObjectURL(file)
    showCropper.value = true
  } else {
    // Upload directly without cropping
    await uploadFile(file)
  }
}

function closeCropper() {
  showCropper.value = false
  cropperLoading.value = false
  if (cropperImageSrc.value) {
    URL.revokeObjectURL(cropperImageSrc.value)
  }
  cropperImageSrc.value = ''
  originalFile.value = null
}

function onCropperReady() {
  cropperLoading.value = false
}

async function confirmCrop() {
  if (!cropperRef.value || !originalFile.value) return

  uploading.value = true

  try {
    const { canvas } = cropperRef.value.getResult()
    if (!canvas) {
      error.value = 'Failed to crop image'
      return
    }

    // Convert canvas to blob
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), originalFile.value!.type, 0.9)
    })

    if (!blob) {
      error.value = 'Failed to process cropped image'
      return
    }

    // Create a new file from the blob
    const croppedFile = new File([blob], originalFile.value.name, {
      type: originalFile.value.type,
    })

    closeCropper()
    await uploadFile(croppedFile)
  } catch (e: any) {
    error.value = e.message || 'Failed to crop image'
    uploading.value = false
  }
}

async function uploadFile(file: File) {
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
      // Start loading the new image in browser
      imageLoading.value = true
      emit('update:modelValue', response.data.url)
    }
  } catch (e: any) {
    error.value = e.data?.message || 'Failed to upload image'
  } finally {
    uploading.value = false
  }
}

function onImageLoaded() {
  imageLoading.value = false
}

function removeImage() {
  emit('update:modelValue', '')
}

// Calculate default crop size to fill the image width
function defaultCropSize({ imageSize }: { imageSize: { width: number; height: number } }) {
  const ratio = props.aspectRatio || imageSize.width / imageSize.height

  // Try to fill the width first
  let width = imageSize.width
  let height = width / ratio

  // If height exceeds image, fit by height instead
  if (height > imageSize.height) {
    height = imageSize.height
    width = height * ratio
  }

  return { width, height }
}

// Cleanup on unmount
onUnmounted(() => {
  if (cropperImageSrc.value) {
    URL.revokeObjectURL(cropperImageSrc.value)
  }
})
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

    <!-- Compact mode (for sidebar panels) -->
    <template v-if="compact">
      <div
        v-if="previewUrl || uploading || imageLoading"
        class="relative rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700"
      >
        <img
          v-if="previewUrl"
          :src="previewUrl"
          alt="Image preview"
          class="w-full object-cover"
          :class="aspectRatio === 16/9 ? 'aspect-video' : aspectRatio === 1 ? 'aspect-square' : 'h-24'"
          @load="onImageLoaded"
        >
        <!-- Placeholder when uploading without existing image -->
        <div
          v-else
          class="w-full bg-gray-200 dark:bg-gray-700"
          :class="aspectRatio === 16/9 ? 'aspect-video' : aspectRatio === 1 ? 'aspect-square' : 'h-24'"
        />
        <!-- Upload loading overlay -->
        <div
          v-if="uploading || imageLoading"
          class="absolute inset-0 bg-black/60 flex items-center justify-center"
        >
          <UIcon
            name="i-heroicons-arrow-path"
            class="w-6 h-6 text-white animate-spin"
          />
        </div>
        <!-- Hover actions -->
        <div v-else class="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
          <UButton
            icon="i-heroicons-arrow-path"
            color="white"
            variant="solid"
            size="xs"
            @click="openFilePicker"
          />
          <UButton
            icon="i-heroicons-trash"
            color="red"
            variant="solid"
            size="xs"
            @click="removeImage"
          />
        </div>
      </div>
      <UButton
        v-else
        block
        color="gray"
        variant="outline"
        size="xs"
        icon="i-heroicons-photo"
        @click="openFilePicker"
      >
        Upload
      </UButton>
    </template>

    <!-- Standard mode -->
    <template v-else>
      <!-- Preview (show when has image OR uploading/loading) -->
      <div
        v-if="previewUrl || uploading || imageLoading"
        class="relative rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700"
      >
        <img
          v-if="previewUrl"
          :src="previewUrl"
          alt="Image preview"
          class="w-full object-cover"
          :class="aspectRatio === 16/9 ? 'aspect-video' : aspectRatio === 1 ? 'aspect-square' : 'h-48'"
          @load="onImageLoaded"
        >
        <!-- Placeholder when uploading without existing image -->
        <div
          v-else
          class="w-full bg-gray-200 dark:bg-gray-700"
          :class="aspectRatio === 16/9 ? 'aspect-video' : aspectRatio === 1 ? 'aspect-square' : 'h-48'"
        />
        <!-- Upload loading overlay -->
        <div
          v-if="uploading || imageLoading"
          class="absolute inset-0 bg-black/60 flex items-center justify-center"
        >
          <div class="text-center">
            <UIcon
              name="i-heroicons-arrow-path"
              class="w-8 h-8 text-white animate-spin mb-2"
            />
            <p class="text-sm text-white">Uploading...</p>
          </div>
        </div>
        <!-- Hover actions -->
        <div v-else class="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <UButton
            icon="i-heroicons-arrow-path"
            color="white"
            variant="solid"
            size="sm"
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

      <!-- Drop Zone (only when no image and not uploading) -->
      <div
        v-else
        class="border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer"
        :class="[
          dragOver
            ? 'border-primary bg-primary-50 dark:bg-primary-900/20'
            : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
        ]"
        @click="openFilePicker"
        @drop="handleDrop"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
      >
        <UIcon
          name="i-heroicons-photo"
          class="w-12 h-12 mx-auto text-gray-400 mb-3"
        />
        <p class="text-sm text-gray-600 dark:text-gray-400">
          {{ placeholder || 'Click or drag image to upload' }}
        </p>
        <p class="text-xs text-gray-500 mt-1">
          JPEG, PNG, GIF, or WebP up to 5MB
        </p>
      </div>
    </template>

    <!-- Error Message -->
    <p v-if="error" class="text-sm text-red-500">
      {{ error }}
    </p>

    <!-- URL Input (fallback) - only in standard mode -->
    <details v-if="!compact" class="text-sm">
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

    <!-- Cropper Modal -->
    <UModal v-model="showCropper" :ui="{ width: 'sm:max-w-2xl' }">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              {{ cropperTitle }}
            </h3>
            <UButton
              color="gray"
              variant="ghost"
              icon="i-heroicons-x-mark"
              size="sm"
              @click="closeCropper"
            />
          </div>
        </template>

        <div class="space-y-4">
          <p class="text-sm text-gray-500">
            Drag to reposition. Scroll or pinch to zoom.
          </p>

          <!-- Cropper -->
          <div class="relative bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden" style="height: 400px;">
            <Cropper
              v-if="cropperImageSrc"
              ref="cropperRef"
              :src="cropperImageSrc"
              :stencil-props="{
                aspectRatio: aspectRatio,
              }"
              :default-size="defaultCropSize"
              class="h-full"
              image-restriction="stencil"
              :resize-image="{
                adjustStencil: false,
              }"
              @ready="onCropperReady"
            />
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton
              color="gray"
              variant="outline"
              @click="closeCropper"
            >
              Cancel
            </UButton>
            <UButton
              color="primary"
              :loading="uploading"
              @click="confirmCrop"
            >
              Apply & Upload
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

<style>
/* Cropper customization */
.vue-advanced-cropper {
  background: transparent !important;
}
.vue-advanced-cropper__background {
  background: rgb(var(--color-gray-100)) !important;
}
.dark .vue-advanced-cropper__background {
  background: rgb(var(--color-gray-800)) !important;
}
</style>
