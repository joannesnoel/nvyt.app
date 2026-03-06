<script setup lang="ts">
definePageMeta({
  layout: 'checkout',
})

useHead({ title: 'QR Payment - NVYT' })

const route = useRoute()
const router = useRouter()

const qrCodeUrl = computed(() => {
  const url = route.query.url as string
  return url ? decodeURIComponent(url) : null
})

const orderNumber = computed(() => route.query.order as string)
const returnUrl = computed(() => {
  const url = route.query.return as string
  return url ? decodeURIComponent(url) : '/'
})

// Redirect if no QR code URL
if (!qrCodeUrl.value) {
  router.push('/')
}

function handleDone() {
  router.push(returnUrl.value)
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
    <div class="max-w-md mx-auto">
      <!-- Header -->
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-16 h-16 bg-primary-100 dark:bg-primary-900 rounded-full mb-4">
          <UIcon name="i-heroicons-qr-code" class="w-8 h-8 text-primary-600 dark:text-primary-400" />
        </div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
          Scan QR Code to Pay
        </h1>
        <p class="text-gray-600 dark:text-gray-400 mt-2">
          Open your banking app and scan this QR code to complete payment
        </p>
      </div>

      <!-- QR Code Card -->
      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
        <div v-if="qrCodeUrl" class="flex justify-center">
          <img
            :src="qrCodeUrl"
            alt="Payment QR Code"
            class="w-64 h-64 rounded-lg"
          />
        </div>

        <div class="mt-6 space-y-4">
          <div class="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
            <div class="flex items-start gap-3">
              <UIcon name="i-heroicons-information-circle" class="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div class="text-sm text-blue-700 dark:text-blue-300">
                <p class="font-medium mb-1">How to pay:</p>
                <ol class="list-decimal list-inside space-y-1">
                  <li>Open your banking app (BPI, BDO, GCash, Maya, etc.)</li>
                  <li>Go to "Scan QR" or "QR Payment"</li>
                  <li>Scan the QR code above</li>
                  <li>Confirm the payment amount</li>
                  <li>Complete the transaction</li>
                </ol>
              </div>
            </div>
          </div>

          <div v-if="orderNumber" class="text-center text-sm text-gray-500 dark:text-gray-400">
            Order: <span class="font-mono">{{ orderNumber }}</span>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="mt-6 space-y-3">
        <UButton
          color="primary"
          size="lg"
          block
          @click="handleDone"
        >
          I've Completed Payment
        </UButton>
        <p class="text-center text-xs text-gray-500 dark:text-gray-400">
          You'll receive an email confirmation once your payment is verified.
        </p>
      </div>
    </div>
  </div>
</template>
