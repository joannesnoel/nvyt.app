// PayPal SDK integration composable

interface PayPalNamespace {
  Buttons: (options: PayPalButtonsOptions) => {
    render: (container: string | HTMLElement) => Promise<void>
    close: () => void
    isEligible: () => boolean
  }
}

interface PayPalButtonsOptions {
  style?: {
    layout?: 'vertical' | 'horizontal'
    color?: 'gold' | 'blue' | 'silver' | 'white' | 'black'
    shape?: 'rect' | 'pill'
    label?: 'paypal' | 'checkout' | 'buynow' | 'pay'
    height?: number
  }
  createOrder: () => Promise<string>
  onApprove: (data: { orderID: string }) => Promise<void>
  onCancel?: (data: { orderID: string }) => void
  onError?: (err: Error) => void
}

declare global {
  interface Window {
    paypal?: PayPalNamespace
  }
}

export function usePayPal() {
  const config = useRuntimeConfig()
  const sdkLoaded = ref(false)
  const sdkLoading = ref(false)
  const sdkError = ref<string | null>(null)

  const clientId = computed(() => config.public.paypalClientId as string)
  const mode = computed(() => (config.public.paypalMode as string) || 'sandbox')

  // Check if PayPal is configured
  const isConfigured = computed(() => !!clientId.value)

  /**
   * Load the PayPal SDK dynamically
   */
  async function loadSDK(currency: string = 'PHP'): Promise<boolean> {
    // Already loaded
    if (window.paypal) {
      sdkLoaded.value = true
      return true
    }

    // Already loading
    if (sdkLoading.value) {
      // Wait for existing load
      return new Promise((resolve) => {
        const checkLoaded = setInterval(() => {
          if (sdkLoaded.value || sdkError.value) {
            clearInterval(checkLoaded)
            resolve(sdkLoaded.value)
          }
        }, 100)
      })
    }

    if (!clientId.value) {
      sdkError.value = 'PayPal client ID not configured'
      return false
    }

    sdkLoading.value = true
    sdkError.value = null

    return new Promise((resolve) => {
      const script = document.createElement('script')
      script.src = `https://www.paypal.com/sdk/js?client-id=${clientId.value}&currency=${currency}&intent=capture`
      script.async = true

      script.onload = () => {
        sdkLoaded.value = true
        sdkLoading.value = false
        resolve(true)
      }

      script.onerror = () => {
        sdkError.value = 'Failed to load PayPal SDK'
        sdkLoading.value = false
        resolve(false)
      }

      document.head.appendChild(script)
    })
  }

  /**
   * Render PayPal buttons in a container
   */
  async function renderButtons(
    container: string | HTMLElement,
    options: {
      orderId: string
      onSuccess: (result: { orderNumber: string; captureId: string }) => void
      onCancel?: () => void
      onError?: (error: Error) => void
      style?: PayPalButtonsOptions['style']
    }
  ): Promise<boolean> {
    if (!window.paypal) {
      console.error('PayPal SDK not loaded')
      return false
    }

    const { orderId, onSuccess, onCancel, onError, style } = options

    try {
      const buttons = window.paypal.Buttons({
        style: style || {
          layout: 'vertical',
          color: 'gold',
          shape: 'rect',
          label: 'paypal',
        },

        // Create PayPal order on our server
        createOrder: async () => {
          const response = await $fetch('/api/v1/paypal/create-order', {
            method: 'POST',
            body: { orderId },
          }) as any

          if (!response.data?.paypalOrderId) {
            throw new Error('Failed to create PayPal order')
          }

          return response.data.paypalOrderId
        },

        // Capture payment after approval
        onApprove: async (data: { orderID: string }) => {
          try {
            const response = await $fetch('/api/v1/paypal/capture-order', {
              method: 'POST',
              body: { paypalOrderId: data.orderID },
            }) as any

            if (response.data?.orderNumber) {
              onSuccess({
                orderNumber: response.data.orderNumber,
                captureId: response.data.captureId,
              })
            } else {
              throw new Error('Failed to capture payment')
            }
          } catch (error: any) {
            onError?.(error)
          }
        },

        onCancel: (data: { orderID: string }) => {
          console.log('PayPal payment cancelled:', data.orderID)
          onCancel?.()
        },

        onError: (err: Error) => {
          console.error('PayPal error:', err)
          onError?.(err)
        },
      })

      // Check eligibility before rendering
      if (!buttons.isEligible()) {
        console.warn('PayPal Buttons not eligible for this buyer')
        return false
      }

      await buttons.render(container)
      return true
    } catch (error) {
      console.error('Failed to render PayPal buttons:', error)
      return false
    }
  }

  return {
    sdkLoaded,
    sdkLoading,
    sdkError,
    isConfigured,
    mode,
    loadSDK,
    renderButtons,
  }
}
