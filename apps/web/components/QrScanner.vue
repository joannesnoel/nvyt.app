<script setup lang="ts">
const props = defineProps<{
  active: boolean
}>()

const emit = defineEmits<{
  scan: [code: string]
  error: [error: string]
}>()

const scannerId = `qr-scanner-${Date.now()}`
const scannerElement = ref<HTMLDivElement | null>(null)
const scanner = shallowRef<any>(null)
const isScanning = ref(false)
const hasPermission = ref<boolean | null>(null)
const errorMessage = ref('')
const isMounted = ref(false)

onMounted(() => {
  isMounted.value = true
})

onUnmounted(() => {
  isMounted.value = false
  stopScanner()
})

async function startScanner() {
  if (!import.meta.client || !isMounted.value) return

  // Reset state
  errorMessage.value = ''
  hasPermission.value = null

  // Wait for next render cycle to ensure DOM is ready
  await nextTick()

  // Additional small delay for iOS Safari
  await new Promise(resolve => setTimeout(resolve, 100))

  if (!isMounted.value) return

  // Check if element exists using the ref
  if (!scannerElement.value) {
    console.error('Scanner element ref not available')
    errorMessage.value = 'Scanner failed to initialize. Please refresh the page.'
    hasPermission.value = false
    return
  }

  try {
    // Dynamic import to avoid SSR issues
    const { Html5Qrcode } = await import('html5-qrcode')

    if (!isMounted.value) return

    // Create scanner instance using the element's ID
    scanner.value = new Html5Qrcode(scannerId)

    // Use facingMode directly - more reliable on iOS
    await scanner.value.start(
      { facingMode: 'environment' },
      {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1,
      },
      (decodedText: string) => {
        // Emit scan result - parent controls when to scan next
        emit('scan', decodedText)
      },
      () => {}
    )

    isScanning.value = true
    hasPermission.value = true
  } catch (err: any) {
    console.error('Scanner error:', err)
    await handleScannerError(err)
  }
}

async function handleScannerError(err: any) {
  const errorString = err?.message || err?.toString() || ''

  if (
    errorString.includes('Permission') ||
    errorString.includes('NotAllowedError') ||
    errorString.includes('denied')
  ) {
    errorMessage.value = 'Camera permission denied. Please allow camera access in your browser settings.'
    hasPermission.value = false
  } else if (
    errorString.includes('NotFoundError') ||
    errorString.includes('No camera')
  ) {
    errorMessage.value = 'No camera found on this device.'
    hasPermission.value = false
  } else if (errorString.includes('NotReadableError')) {
    errorMessage.value = 'Camera is in use by another application.'
    hasPermission.value = false
  } else if (errorString.includes('OverconstrainedError')) {
    // Back camera not available, try front camera
    await tryFrontCamera()
  } else {
    errorMessage.value = errorString || 'Failed to start camera. Please try again.'
    hasPermission.value = false
  }

  if (hasPermission.value === false) {
    emit('error', errorMessage.value)
  }
}

async function tryFrontCamera() {
  if (!scanner.value || !isMounted.value) {
    errorMessage.value = 'Could not access camera.'
    hasPermission.value = false
    return
  }

  try {
    await scanner.value.start(
      { facingMode: 'user' },
      {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1,
      },
      (decodedText: string) => {
        // Emit scan result - parent controls when to scan next
        emit('scan', decodedText)
      },
      () => {}
    )
    isScanning.value = true
    hasPermission.value = true
  } catch {
    errorMessage.value = 'Could not access camera. Please try again.'
    hasPermission.value = false
  }
}

async function pauseScanner() {
  if (!scanner.value) return

  try {
    const { Html5QrcodeScannerState } = await import('html5-qrcode')
    if (scanner.value.getState() === Html5QrcodeScannerState.SCANNING) {
      scanner.value.pause()
    }
  } catch (err) {
    console.error('Error pausing scanner:', err)
  }
}

async function resumeScanner() {
  if (!scanner.value) return

  try {
    const { Html5QrcodeScannerState } = await import('html5-qrcode')
    if (scanner.value.getState() === Html5QrcodeScannerState.PAUSED) {
      scanner.value.resume()
    }
  } catch (err) {
    console.error('Error resuming scanner:', err)
  }
}

async function stopScanner() {
  if (scanner.value) {
    try {
      const { Html5QrcodeScannerState } = await import('html5-qrcode')
      const state = scanner.value.getState()
      if (state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED) {
        await scanner.value.stop()
      }
    } catch (err) {
      console.error('Error stopping scanner:', err)
    }
    scanner.value = null
    isScanning.value = false
  }
}

// Watch active prop to start/stop scanner
watch(() => props.active, async (active) => {
  if (active && isMounted.value) {
    await startScanner()
  } else {
    await stopScanner()
  }
})

// Start scanner when mounted if active
onMounted(async () => {
  if (props.active) {
    await startScanner()
  }
})
</script>

<template>
  <div class="qr-scanner-container">
    <!-- Scanner viewport -->
    <div
      :id="scannerId"
      ref="scannerElement"
      class="scanner-viewport"
      :class="{ 'scanner-active': isScanning }"
    />

    <!-- Permission/Error overlay -->
    <div
      v-if="!isScanning && active"
      class="scanner-overlay"
    >
      <div v-if="hasPermission === null" class="text-center">
        <UIcon name="i-heroicons-camera" class="w-12 h-12 text-gray-400 mb-4" />
        <p class="text-gray-600 dark:text-gray-400">Starting camera...</p>
        <p class="text-gray-500 text-xs mt-2">Please allow camera access when prompted</p>
        <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 text-primary animate-spin mt-4" />
      </div>

      <div v-else-if="hasPermission === false" class="text-center px-4">
        <UIcon name="i-heroicons-video-camera-slash" class="w-12 h-12 text-red-400 mb-4" />
        <p class="text-gray-900 dark:text-white font-medium mb-2">Camera Access Required</p>
        <p class="text-gray-600 dark:text-gray-400 text-sm mb-4">{{ errorMessage }}</p>
        <UButton
          color="primary"
          size="sm"
          @click="startScanner"
        >
          Try Again
        </UButton>
      </div>
    </div>

    <!-- Scan indicator -->
    <div v-if="isScanning" class="scan-indicator">
      <div class="scan-line" />
    </div>
  </div>
</template>

<style scoped>
.qr-scanner-container {
  position: relative;
  width: 100%;
  max-width: 400px;
  margin: 0 auto;
  aspect-ratio: 1;
  background: #000;
  border-radius: 12px;
  overflow: hidden;
}

.scanner-viewport {
  width: 100%;
  height: 100%;
}

.scanner-viewport :deep(video) {
  object-fit: cover !important;
  border-radius: 12px;
}

.scanner-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.8);
}

.scan-indicator {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.scan-indicator::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 250px;
  height: 250px;
  border: 2px solid rgba(var(--color-primary-500), 0.8);
  border-radius: 12px;
  box-shadow:
    0 0 0 9999px rgba(0, 0, 0, 0.5),
    inset 0 0 20px rgba(var(--color-primary-500), 0.2);
}

/* Corner markers */
.scan-indicator::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 250px;
  height: 250px;
  background:
    linear-gradient(to right, rgb(var(--color-primary-500)) 4px, transparent 4px) 0 0,
    linear-gradient(to right, rgb(var(--color-primary-500)) 4px, transparent 4px) 0 100%,
    linear-gradient(to left, rgb(var(--color-primary-500)) 4px, transparent 4px) 100% 0,
    linear-gradient(to left, rgb(var(--color-primary-500)) 4px, transparent 4px) 100% 100%,
    linear-gradient(to bottom, rgb(var(--color-primary-500)) 4px, transparent 4px) 0 0,
    linear-gradient(to bottom, rgb(var(--color-primary-500)) 4px, transparent 4px) 100% 0,
    linear-gradient(to top, rgb(var(--color-primary-500)) 4px, transparent 4px) 0 100%,
    linear-gradient(to top, rgb(var(--color-primary-500)) 4px, transparent 4px) 100% 100%;
  background-repeat: no-repeat;
  background-size: 30px 30px;
}

.scan-line {
  position: absolute;
  left: calc(50% - 125px);
  width: 250px;
  height: 2px;
  background: linear-gradient(
    90deg,
    transparent,
    rgb(var(--color-primary-500)),
    transparent
  );
  animation: scan 2s linear infinite;
}

@keyframes scan {
  0% {
    top: calc(50% - 125px);
    opacity: 0;
  }
  10% {
    opacity: 1;
  }
  90% {
    opacity: 1;
  }
  100% {
    top: calc(50% + 125px);
    opacity: 0;
  }
}
</style>
