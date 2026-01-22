<script setup lang="ts">
const props = defineProps<{
  orderId: string
  currency?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  success: [result: { orderNumber: string; captureId: string }]
  error: [error: Error]
  cancel: []
}>()

const { loadSDK, renderButtons, sdkLoading, sdkError } = usePayPal()

const containerRef = ref<HTMLElement>()
const isRendered = ref(false)
const isProcessing = ref(false)
const renderError = ref<string | null>(null)

// Load SDK and render buttons when component is mounted and orderId is available
watch(
  [() => props.orderId, containerRef],
  async ([orderId, container]) => {
    if (!orderId || !container || isRendered.value) return

    renderError.value = null

    // Load the SDK first
    const loaded = await loadSDK(props.currency || 'PHP')
    if (!loaded) {
      renderError.value = sdkError.value || 'Failed to load PayPal SDK'
      return
    }

    // Render the buttons
    const rendered = await renderButtons(container, {
      orderId,
      onSuccess: (result) => {
        isProcessing.value = false
        emit('success', result)
      },
      onCancel: () => {
        isProcessing.value = false
        emit('cancel')
      },
      onError: (error) => {
        isProcessing.value = false
        renderError.value = error.message
        emit('error', error)
      },
      style: {
        layout: 'vertical',
        color: 'gold',
        shape: 'rect',
        label: 'paypal',
        height: 45,
      },
    })

    isRendered.value = rendered
    if (!rendered) {
      renderError.value = 'PayPal is not available for this purchase'
    }
  },
  { immediate: true }
)

// Clean up when component is unmounted
onUnmounted(() => {
  isRendered.value = false
})
</script>

<template>
  <div class="paypal-buttons-wrapper">
    <!-- Loading state -->
    <div v-if="sdkLoading" class="flex items-center justify-center py-6">
      <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 text-gray-400 animate-spin" />
      <span class="ml-2 text-sm text-gray-500">Loading PayPal...</span>
    </div>

    <!-- Error state -->
    <UAlert
      v-else-if="renderError || sdkError"
      color="red"
      variant="soft"
      icon="i-heroicons-exclamation-triangle"
      :title="renderError || sdkError || 'PayPal Error'"
      class="mb-4"
    />

    <!-- Processing state overlay -->
    <div v-if="isProcessing" class="absolute inset-0 bg-white/80 dark:bg-gray-900/80 flex items-center justify-center z-10 rounded-lg">
      <div class="text-center">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-primary animate-spin" />
        <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">Processing payment...</p>
      </div>
    </div>

    <!-- PayPal buttons container -->
    <div
      ref="containerRef"
      class="paypal-buttons-container"
      :class="{ 'opacity-50 pointer-events-none': disabled || isProcessing }"
    />
  </div>
</template>

<style scoped>
.paypal-buttons-wrapper {
  position: relative;
  min-height: 100px;
}

.paypal-buttons-container {
  min-height: 50px;
}
</style>
