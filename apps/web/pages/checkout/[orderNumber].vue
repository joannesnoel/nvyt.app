<script setup lang="ts">
import type { PaymentMethodType } from '~/composables/usePayMongo'
import type { OrderItem, FeeBreakdown } from '~/components/checkout/OrderSummary.vue'

definePageMeta({
  layout: 'default',
})

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { createCardPaymentMethod, loadSDK } = usePayMongo()

const orderNumber = computed(() => route.params.orderNumber as string)
const setupToken = computed(() => route.query.token as string | undefined)

// Order data
const orderData = ref<{
  orderNumber: string
  paymentIntentId: string
  clientKey: string
  publicKey: string
  eventTitle: string
  eventSlug: string
  items: OrderItem[]
  feeBreakdown: FeeBreakdown
  registrationRequired: boolean
  accountSetupRequired: boolean
  setupToken?: string
} | null>(null)

const loading = ref(true)
const loadError = ref<string | null>(null)

// Payment state
const selectedPaymentMethod = ref<PaymentMethodType | null>(null)
const cardFormRef = ref<{ validate: () => boolean; submit: () => void } | null>(null)
const isProcessing = ref(false)
const paymentError = ref<string | null>(null)

// Fetch order data on mount
onMounted(async () => {
  await fetchOrderData()
})

async function fetchOrderData() {
  loading.value = true
  loadError.value = null

  try {
    // First, check if order exists and get its current state
    const response = await $fetch(`/api/v1/orders/${orderNumber.value}`, {
      query: setupToken.value ? { token: setupToken.value } : undefined,
    }) as any

    if (!response.data) {
      throw new Error('Order not found')
    }

    // Order properties are spread directly into response.data
    const order = response.data

    // Check if order is already paid
    if (order.paymentStatus === 'paid') {
      toast.add({
        title: 'Order Already Paid',
        description: 'This order has already been completed.',
        color: 'green',
      })
      const successUrl = setupToken.value
        ? `/orders/${orderNumber.value}/success?token=${setupToken.value}`
        : `/orders/${orderNumber.value}/success`
      await router.push(successUrl)
      return
    }

    // Check if we have a payment intent
    if (!order.paymongoPaymentIntentId) {
      throw new Error('No payment intent found. Please start checkout again.')
    }

    // Build items from tickets grouped by ticket type
    // Use the order's subtotalAmount to derive actual unit prices (accounts for price tiers)
    const ticketGroups = new Map<string, { name: string; quantity: number }>()
    for (const ticket of order.tickets || []) {
      const key = ticket.ticketTypeId
      const existing = ticketGroups.get(key)
      if (existing) {
        existing.quantity++
      } else {
        ticketGroups.set(key, {
          name: ticket.ticketType?.name || 'Ticket',
          quantity: 1,
        })
      }
    }

    const subtotal = parseFloat(order.subtotalAmount || '0')
    const totalTickets = order.tickets?.length || 1

    const items: OrderItem[] = Array.from(ticketGroups.entries()).map(([ticketTypeId, info]) => {
      // Calculate unit price from subtotal - this accounts for price tiers
      // If all tickets are same type, unit price = subtotal / total tickets
      // If multiple types exist, we proportionally distribute based on count
      const proportion = info.quantity / totalTickets
      const groupSubtotal = subtotal * proportion
      const unitPrice = groupSubtotal / info.quantity

      return {
        ticketTypeId,
        ticketTypeName: info.name,
        quantity: info.quantity,
        unitPrice,
        subtotal: groupSubtotal,
      }
    })

    const processingFee = parseFloat(order.processingFee || '0')
    const adminFee = parseFloat(order.adminFee || '0')
    const totalFees = parseFloat(order.totalFees || '0')
    const total = parseFloat(order.totalAmount || '0')

    orderData.value = {
      orderNumber: order.orderNumber,
      paymentIntentId: order.paymongoPaymentIntentId,
      clientKey: '', // Not needed for attach flow
      publicKey: '',
      eventTitle: order.event?.title || 'Event',
      eventSlug: order.event?.slug || '',
      items,
      feeBreakdown: {
        subtotal,
        processingFee,
        adminFee,
        totalFees,
        total,
      },
      registrationRequired: order.hasRegistrationFields || false,
      accountSetupRequired: false,
      setupToken: setupToken.value,
    }

    // Preload PayMongo SDK for card payments
    loadSDK()
  } catch (e: any) {
    console.error('Failed to load order:', e)
    loadError.value = e.data?.message || e.message || 'Failed to load order'
  } finally {
    loading.value = false
  }
}

// Handle card form submission
function handleCardSubmit(cardData: {
  cardNumber: string
  expMonth: string
  expYear: string
  cvc: string
}) {
  processCardPayment(cardData)
}

async function processCardPayment(cardData: {
  cardNumber: string
  expMonth: string
  expYear: string
  cvc: string
}) {
  if (!orderData.value) return

  isProcessing.value = true
  paymentError.value = null

  try {
    // Create payment method using PayMongo.js (card data goes directly to PayMongo)
    const { paymentMethodId, error } = await createCardPaymentMethod({
      cardNumber: cardData.cardNumber,
      expMonth: cardData.expMonth,
      expYear: cardData.expYear,
      cvc: cardData.cvc,
    })

    if (error || !paymentMethodId) {
      paymentError.value = error || 'Failed to process card'
      return
    }

    // Attach the payment method to the payment intent
    await attachPaymentMethod(paymentMethodId)
  } catch (e: any) {
    console.error('Card payment error:', e)
    paymentError.value = e.data?.message || e.message || 'Failed to process card payment'
  } finally {
    isProcessing.value = false
  }
}

async function processEWalletPayment() {
  if (!orderData.value || !selectedPaymentMethod.value) return

  isProcessing.value = true
  paymentError.value = null

  try {
    // For e-wallets, the payment method is created server-side
    await attachPaymentMethod()
  } catch (e: any) {
    console.error('E-wallet payment error:', e)
    paymentError.value = e.data?.message || e.message || 'Failed to process payment'
  } finally {
    isProcessing.value = false
  }
}

async function attachPaymentMethod(paymentMethodId?: string) {
  if (!orderData.value || !selectedPaymentMethod.value) return

  const response = await $fetch('/api/v1/paymongo/attach-method', {
    method: 'POST',
    body: {
      orderNumber: orderData.value.orderNumber,
      paymentMethodId: paymentMethodId,
      paymentMethodType: selectedPaymentMethod.value,
    },
    query: setupToken.value ? { token: setupToken.value } : undefined,
  }) as any

  const status = response.data?.status

  if (status === 'succeeded') {
    // Payment completed immediately
    await handlePaymentSuccess()
  } else if (status === 'awaiting_next_action' && response.data?.nextAction?.redirectUrl) {
    // Redirect to 3DS or e-wallet authorization
    window.location.href = response.data.nextAction.redirectUrl
  } else if (status === 'processing') {
    // Payment is processing (e.g., QR Ph)
    toast.add({
      title: 'Payment Processing',
      description: 'Your payment is being processed. You will receive an email when complete.',
      color: 'blue',
    })
    // Redirect to a waiting page or order status
    const successUrl = setupToken.value
      ? `/orders/${orderData.value.orderNumber}?token=${setupToken.value}`
      : `/orders/${orderData.value.orderNumber}`
    await router.push(successUrl)
  } else if (status === 'failed') {
    throw new Error('Payment failed. Please try again.')
  }
}

async function handlePaymentSuccess() {
  if (!orderData.value) return

  toast.add({
    title: 'Payment Successful!',
    description: 'Your tickets have been confirmed.',
    color: 'green',
  })

  // Redirect to success page
  const token = orderData.value.setupToken || setupToken.value
  const successUrl = token
    ? `/orders/${orderData.value.orderNumber}/success?token=${token}`
    : `/orders/${orderData.value.orderNumber}/success`

  await router.push(successUrl)
}

function handlePayNow() {
  if (!selectedPaymentMethod.value) {
    toast.add({
      title: 'Select Payment Method',
      description: 'Please select a payment method to continue.',
      color: 'yellow',
    })
    return
  }

  if (selectedPaymentMethod.value === 'card') {
    // Trigger card form validation and submission
    if (cardFormRef.value) {
      cardFormRef.value.submit()
    }
  } else {
    // Process e-wallet payment
    processEWalletPayment()
  }
}

function goBack() {
  if (orderData.value?.eventSlug) {
    router.push(`/events/${orderData.value.eventSlug}`)
  } else {
    router.push('/')
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <div class="max-w-4xl mx-auto px-4 py-8 sm:py-12">
      <!-- Back button -->
      <button
        type="button"
        class="mb-6 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        @click="goBack"
      >
        <UIcon name="i-heroicons-arrow-left" class="w-4 h-4" />
        <span>Back to event</span>
      </button>

      <!-- Loading state -->
      <div v-if="loading" class="flex items-center justify-center py-20">
        <div class="text-center">
          <UIcon name="i-heroicons-arrow-path" class="w-10 h-10 text-primary animate-spin mx-auto" />
          <p class="mt-4 text-gray-600 dark:text-gray-400">Loading checkout...</p>
        </div>
      </div>

      <!-- Error state -->
      <div v-else-if="loadError" class="text-center py-20">
        <div class="w-16 h-16 mx-auto bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
          <UIcon name="i-heroicons-exclamation-triangle" class="w-8 h-8 text-red-500" />
        </div>
        <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Unable to Load Checkout
        </h2>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          {{ loadError }}
        </p>
        <UButton color="primary" @click="goBack">
          Go Back
        </UButton>
      </div>

      <!-- Checkout content -->
      <div v-else-if="orderData" class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <!-- Left column: Payment method selection -->
        <div class="space-y-6">
          <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
              Checkout
            </h1>
            <p class="text-gray-600 dark:text-gray-400 mt-1">
              Complete your purchase for {{ orderData.eventTitle }}
            </p>
          </div>

          <!-- Payment error -->
          <UAlert
            v-if="paymentError"
            color="red"
            variant="soft"
            icon="i-heroicons-exclamation-circle"
            :title="paymentError"
            :close-button="{ icon: 'i-heroicons-x-mark', color: 'red', variant: 'link' }"
            @close="paymentError = null"
          />

          <!-- Payment method selector -->
          <CheckoutPaymentMethodSelector
            v-model="selectedPaymentMethod"
            :disabled="isProcessing"
          />

          <!-- Card form (shown when card is selected) -->
          <div
            v-if="selectedPaymentMethod === 'card'"
            class="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700"
          >
            <CheckoutCardPaymentForm
              ref="cardFormRef"
              :disabled="isProcessing"
              @submit="handleCardSubmit"
            />
          </div>

          <!-- E-wallet info (shown for e-wallet methods) -->
          <div
            v-else-if="selectedPaymentMethod"
            class="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6 border border-blue-200 dark:border-blue-800"
          >
            <div class="flex items-start gap-3">
              <UIcon name="i-heroicons-information-circle" class="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div class="text-sm text-blue-700 dark:text-blue-300">
                <p v-if="selectedPaymentMethod === 'gcash'">
                  You will be redirected to GCash to authorize the payment.
                </p>
                <p v-else-if="selectedPaymentMethod === 'paymaya'">
                  You will be redirected to Maya to authorize the payment.
                </p>
                <p v-else-if="selectedPaymentMethod === 'grab_pay'">
                  You will be redirected to GrabPay to authorize the payment.
                </p>
                <p v-else-if="selectedPaymentMethod === 'qrph'">
                  A QR code will be generated. Scan it with your banking app to complete payment.
                </p>
              </div>
            </div>
          </div>

          <!-- Pay button (desktop) -->
          <div class="hidden lg:block">
            <UButton
              color="primary"
              size="xl"
              block
              :loading="isProcessing"
              :disabled="!selectedPaymentMethod || isProcessing"
              @click="handlePayNow"
            >
              <span v-if="isProcessing">Processing...</span>
              <span v-else>
                Pay {{ new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(orderData.feeBreakdown.total) }}
              </span>
            </UButton>
          </div>
        </div>

        <!-- Right column: Order summary -->
        <div>
          <CheckoutOrderSummary
            :event-title="orderData.eventTitle"
            :items="orderData.items"
            :fee-breakdown="orderData.feeBreakdown"
            :order-number="orderData.orderNumber"
          />

          <!-- Security badges -->
          <div class="mt-6 flex items-center justify-center gap-4 text-xs text-gray-500 dark:text-gray-400">
            <div class="flex items-center gap-1">
              <UIcon name="i-heroicons-lock-closed" class="w-4 h-4" />
              <span>Secure Payment</span>
            </div>
            <div class="flex items-center gap-1">
              <UIcon name="i-heroicons-shield-check" class="w-4 h-4" />
              <span>SSL Encrypted</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Mobile pay button (fixed at bottom) -->
    <div
      v-if="orderData && !loading && !loadError"
      class="lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 p-4 safe-area-pb"
    >
      <div class="flex items-center justify-between mb-3">
        <span class="text-sm text-gray-600 dark:text-gray-400">Total</span>
        <span class="text-lg font-semibold text-gray-900 dark:text-white">
          {{ new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(orderData.feeBreakdown.total) }}
        </span>
      </div>
      <UButton
        color="primary"
        size="lg"
        block
        :loading="isProcessing"
        :disabled="!selectedPaymentMethod || isProcessing"
        @click="handlePayNow"
      >
        <span v-if="isProcessing">Processing...</span>
        <span v-else>Pay Now</span>
      </UButton>
    </div>
  </div>
</template>

<style scoped>
.safe-area-pb {
  padding-bottom: max(1rem, env(safe-area-inset-bottom));
}
</style>
