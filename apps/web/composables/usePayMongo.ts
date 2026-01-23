// PayMongo.js SDK integration composable

interface PayMongoNamespace {
  createPaymentMethod: (options: CreatePaymentMethodOptions) => Promise<PaymentMethodResult>
}

interface CreatePaymentMethodOptions {
  type: 'card'
  details: {
    card_number: string
    exp_month: string
    exp_year: string
    cvc: string
  }
  billing?: {
    name?: string
    email?: string
    phone?: string
    address?: {
      line1?: string
      line2?: string
      city?: string
      state?: string
      postal_code?: string
      country?: string
    }
  }
}

interface PaymentMethodResult {
  id: string
  type: 'payment_method'
  attributes: {
    type: string
    billing?: {
      name?: string
      email?: string
      phone?: string
      address?: Record<string, string>
    }
    created_at: number
    updated_at: number
  }
}

interface PayMongoError {
  code: string
  detail: string
  source?: {
    pointer?: string
    attribute?: string
  }
}

declare global {
  interface Window {
    PayMongo?: PayMongoNamespace
  }
}

export type PaymentMethodType = 'card' | 'gcash' | 'paymaya' | 'grab_pay' | 'qrph'

export interface PaymentMethod {
  type: PaymentMethodType
  label: string
  description: string
  icon: string
  needsClientCreation: boolean // If true, payment method is created client-side
}

export const PAYMENT_METHODS: PaymentMethod[] = [
  {
    type: 'gcash',
    label: 'GCash',
    description: 'Pay with your GCash wallet',
    icon: 'i-simple-icons-cashapp',
    needsClientCreation: false,
  },
  {
    type: 'paymaya',
    label: 'Maya',
    description: 'Pay with your Maya wallet',
    icon: 'i-heroicons-wallet',
    needsClientCreation: false,
  },
  {
    type: 'grab_pay',
    label: 'GrabPay',
    description: 'Pay with your Grab wallet',
    icon: 'i-heroicons-banknotes',
    needsClientCreation: false,
  },
  {
    type: 'card',
    label: 'Credit/Debit Card',
    description: 'Visa, Mastercard, JCB',
    icon: 'i-heroicons-credit-card',
    needsClientCreation: true,
  },
  {
    type: 'qrph',
    label: 'QR Ph',
    description: 'Scan QR with your banking app',
    icon: 'i-heroicons-qr-code',
    needsClientCreation: false,
  },
]

export function usePayMongo() {
  const config = useRuntimeConfig()
  const sdkLoaded = ref(false)
  const sdkLoading = ref(false)
  const sdkError = ref<string | null>(null)

  const publicKey = computed(() => config.public.paymongoPublicKey as string)

  // Check if PayMongo is configured
  const isConfigured = computed(() => !!publicKey.value && publicKey.value.startsWith('pk_'))

  /**
   * Load the PayMongo.js SDK dynamically
   */
  async function loadSDK(): Promise<boolean> {
    // Already loaded
    if (window.PayMongo) {
      sdkLoaded.value = true
      return true
    }

    // Already loading
    if (sdkLoading.value) {
      return new Promise((resolve) => {
        const checkLoaded = setInterval(() => {
          if (sdkLoaded.value || sdkError.value) {
            clearInterval(checkLoaded)
            resolve(sdkLoaded.value)
          }
        }, 100)
      })
    }

    if (!publicKey.value) {
      sdkError.value = 'PayMongo public key not configured'
      return false
    }

    sdkLoading.value = true
    sdkError.value = null

    return new Promise((resolve) => {
      const script = document.createElement('script')
      script.src = 'https://js.paymongo.com/v1'
      script.async = true

      script.onload = () => {
        // Initialize PayMongo with public key
        if (window.PayMongo) {
          sdkLoaded.value = true
          sdkLoading.value = false
          resolve(true)
        } else {
          sdkError.value = 'PayMongo SDK failed to initialize'
          sdkLoading.value = false
          resolve(false)
        }
      }

      script.onerror = () => {
        sdkError.value = 'Failed to load PayMongo SDK'
        sdkLoading.value = false
        resolve(false)
      }

      document.head.appendChild(script)
    })
  }

  /**
   * Create a card payment method using PayMongo.js
   * Card data is sent directly to PayMongo (never touches our server)
   */
  async function createCardPaymentMethod(options: {
    cardNumber: string
    expMonth: string
    expYear: string
    cvc: string
    billing?: {
      name?: string
      email?: string
      phone?: string
    }
  }): Promise<{ paymentMethodId: string | null; error: string | null }> {
    // Ensure SDK is loaded
    if (!window.PayMongo) {
      const loaded = await loadSDK()
      if (!loaded) {
        return { paymentMethodId: null, error: sdkError.value || 'Failed to load PayMongo SDK' }
      }
    }

    try {
      // Clean card number (remove spaces/dashes)
      const cleanCardNumber = options.cardNumber.replace(/[\s-]/g, '')

      const result = await window.PayMongo!.createPaymentMethod({
        type: 'card',
        details: {
          card_number: cleanCardNumber,
          exp_month: options.expMonth.padStart(2, '0'),
          exp_year: options.expYear.length === 2 ? `20${options.expYear}` : options.expYear,
          cvc: options.cvc,
        },
        billing: options.billing ? {
          name: options.billing.name,
          email: options.billing.email,
          phone: options.billing.phone,
        } : undefined,
      })

      return { paymentMethodId: result.id, error: null }
    } catch (e: any) {
      console.error('PayMongo createPaymentMethod error:', e)

      // Parse PayMongo error format
      let errorMessage = 'Failed to process card'
      if (e.errors && Array.isArray(e.errors)) {
        const firstError = e.errors[0] as PayMongoError
        errorMessage = firstError.detail || errorMessage

        // Provide user-friendly messages for common errors
        if (firstError.code === 'parameter_invalid') {
          if (firstError.source?.attribute === 'card_number') {
            errorMessage = 'Invalid card number'
          } else if (firstError.source?.attribute === 'exp_month' || firstError.source?.attribute === 'exp_year') {
            errorMessage = 'Invalid expiration date'
          } else if (firstError.source?.attribute === 'cvc') {
            errorMessage = 'Invalid CVC'
          }
        }
      } else if (e.message) {
        errorMessage = e.message
      }

      return { paymentMethodId: null, error: errorMessage }
    }
  }

  /**
   * Get payment method info by type
   */
  function getPaymentMethodInfo(type: PaymentMethodType): PaymentMethod | undefined {
    return PAYMENT_METHODS.find(m => m.type === type)
  }

  return {
    sdkLoaded,
    sdkLoading,
    sdkError,
    isConfigured,
    publicKey,
    loadSDK,
    createCardPaymentMethod,
    getPaymentMethodInfo,
    PAYMENT_METHODS,
  }
}
