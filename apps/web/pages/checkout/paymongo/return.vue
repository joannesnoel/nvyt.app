<script setup lang="ts">
definePageMeta({
  layout: 'default',
})

const route = useRoute()
const router = useRouter()
const toast = useToast()

const processing = ref(true)
const error = ref<string | null>(null)
const status = ref<'processing' | 'succeeded' | 'failed' | 'pending'>('processing')

onMounted(async () => {
  try {
    // Get order number from query params
    const orderNumber = route.query.order as string

    if (!orderNumber) {
      throw new Error('Missing order information')
    }

    // Verify payment status
    const response = await $fetch('/api/v1/paymongo/verify-payment', {
      method: 'POST',
      body: { orderNumber },
    }) as any

    status.value = response.data?.status || 'pending'

    if (status.value === 'succeeded') {
      toast.add({
        title: 'Payment Successful!',
        description: response.data?.alreadyPaid
          ? 'Your payment was already confirmed.'
          : 'Your tickets have been confirmed.',
        color: 'green',
      })

      // Redirect to success page
      const successUrl = response.data?.setupToken
        ? `/orders/${orderNumber}/success?token=${response.data.setupToken}`
        : `/orders/${orderNumber}/success`

      await router.push(successUrl)
    } else if (status.value === 'processing') {
      // Payment is still processing (e.g., QR Ph)
      // Show waiting message
      processing.value = false
    } else if (status.value === 'failed') {
      error.value = response.data?.message || 'Payment failed. Please try again.'
      processing.value = false
    } else {
      // Pending or cancelled
      error.value = response.data?.message || 'Payment was not completed. Please try again.'
      processing.value = false
    }
  } catch (e: any) {
    console.error('PayMongo return error:', e)
    error.value = e.data?.message || e.message || 'Failed to verify payment'
    processing.value = false
    status.value = 'failed'
  }
})

function retryPayment() {
  const orderNumber = route.query.order as string
  if (orderNumber) {
    router.push(`/checkout/${orderNumber}`)
  } else {
    router.push('/')
  }
}

function goHome() {
  router.push('/')
}

function viewOrder() {
  const orderNumber = route.query.order as string
  if (orderNumber) {
    router.push(`/orders/${orderNumber}`)
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-4">
    <div class="max-w-md w-full text-center">
      <!-- Processing -->
      <div v-if="processing" class="space-y-4">
        <div class="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
          <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-primary animate-spin" />
        </div>
        <h1 class="text-xl font-semibold text-gray-900 dark:text-white">
          Verifying your payment...
        </h1>
        <p class="text-gray-600 dark:text-gray-400">
          Please wait while we confirm your payment.
        </p>
      </div>

      <!-- Still Processing (QR Ph, bank transfers) -->
      <div v-else-if="status === 'processing'" class="space-y-4">
        <div class="w-16 h-16 mx-auto bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
          <UIcon name="i-heroicons-clock" class="w-8 h-8 text-blue-500" />
        </div>
        <h1 class="text-xl font-semibold text-gray-900 dark:text-white">
          Payment Processing
        </h1>
        <p class="text-gray-600 dark:text-gray-400">
          Your payment is being processed. This may take a few minutes.
          You will receive an email once your payment is confirmed.
        </p>
        <div class="pt-4 space-y-3">
          <UButton color="primary" @click="viewOrder">
            View Order Status
          </UButton>
          <UButton variant="ghost" @click="goHome">
            Go to Homepage
          </UButton>
        </div>
      </div>

      <!-- Error / Failed -->
      <div v-else class="space-y-4">
        <div class="w-16 h-16 mx-auto bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
          <UIcon name="i-heroicons-exclamation-triangle" class="w-8 h-8 text-red-500" />
        </div>
        <h1 class="text-xl font-semibold text-gray-900 dark:text-white">
          Payment {{ status === 'failed' ? 'Failed' : 'Not Completed' }}
        </h1>
        <p class="text-gray-600 dark:text-gray-400">
          {{ error }}
        </p>
        <div class="pt-4 space-y-3">
          <UButton color="primary" @click="retryPayment">
            Try Again
          </UButton>
          <UButton variant="ghost" @click="goHome">
            Go to Homepage
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>
