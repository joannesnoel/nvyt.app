<script setup lang="ts">
definePageMeta({
  layout: 'default',
})

const route = useRoute()
const router = useRouter()
const toast = useToast()

const processing = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    // Get PayPal order ID from query params (PayPal adds 'token' param)
    const paypalToken = route.query.token as string
    // Check if this is a retry payment
    const retryOrderNumber = route.query.retry as string | undefined
    const setupToken = route.query.setupToken as string | undefined

    if (!paypalToken) {
      throw new Error('Missing PayPal order token')
    }

    let response: any

    if (retryOrderNumber) {
      // This is a retry payment - call capture-retry endpoint
      response = await $fetch('/api/v1/paypal/capture-retry', {
        method: 'POST',
        body: {
          paypalOrderId: paypalToken,
          orderNumber: retryOrderNumber,
        },
      })

      if (response.data?.orderNumber) {
        // Success - redirect to order success page
        const successUrl = setupToken
          ? `/orders/${response.data.orderNumber}/success?token=${setupToken}`
          : `/orders/${response.data.orderNumber}/success`

        toast.add({
          title: 'Payment Successful!',
          description: response.data.alreadyPaid
            ? 'Your payment was already confirmed.'
            : 'Your tickets have been confirmed.',
          color: 'green',
        })

        await router.push(successUrl)
      } else {
        throw new Error('Failed to complete payment')
      }
    } else {
      // This is a new order payment - call complete endpoint
      response = await $fetch('/api/v1/paypal/complete', {
        method: 'POST',
        body: {
          paypalOrderId: paypalToken,
        },
      })

      if (response.data?.orderNumber) {
        // Success - redirect to order success page
        const successUrl = response.data.setupToken
          ? `/orders/${response.data.orderNumber}/success?token=${response.data.setupToken}`
          : `/orders/${response.data.orderNumber}/success`

        toast.add({
          title: 'Payment Successful!',
          description: 'Your tickets have been confirmed.',
          color: 'green',
        })

        await router.push(successUrl)
      } else {
        throw new Error('Failed to complete payment')
      }
    }
  } catch (e: any) {
    console.error('PayPal return error:', e)
    error.value = e.data?.message || e.message || 'Failed to complete payment'
    processing.value = false
  }
})

function goBack() {
  router.push('/')
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
          Completing your payment...
        </h1>
        <p class="text-gray-600 dark:text-gray-400">
          Please wait while we confirm your payment with PayPal.
        </p>
      </div>

      <!-- Error -->
      <div v-else class="space-y-4">
        <div class="w-16 h-16 mx-auto bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
          <UIcon name="i-heroicons-exclamation-triangle" class="w-8 h-8 text-red-500" />
        </div>
        <h1 class="text-xl font-semibold text-gray-900 dark:text-white">
          Payment Failed
        </h1>
        <p class="text-gray-600 dark:text-gray-400">
          {{ error }}
        </p>
        <UButton color="primary" @click="goBack">
          Go to Homepage
        </UButton>
      </div>
    </div>
  </div>
</template>
