/**
 * Google Analytics 4 tracking composable
 * Only fires events in production when gtag is available
 */

declare global {
  interface Window {
    gtag?: (...args: any[]) => void
  }
}

interface PurchaseItem {
  item_id: string
  item_name: string
  price: number
  quantity: number
  item_category?: string
}

interface PurchaseParams {
  transactionId: string
  value: number
  currency?: string
  items: PurchaseItem[]
}

export function useAnalytics() {
  const isAvailable = () => typeof window !== 'undefined' && typeof window.gtag === 'function'

  /**
   * Track a completed purchase
   */
  function trackPurchase(params: PurchaseParams) {
    if (!isAvailable()) return

    window.gtag!('event', 'purchase', {
      transaction_id: params.transactionId,
      value: params.value,
      currency: params.currency || 'PHP',
      items: params.items,
    })
  }

  /**
   * Track checkout initiation
   */
  function trackBeginCheckout(params: { value: number; currency?: string; items: PurchaseItem[] }) {
    if (!isAvailable()) return

    window.gtag!('event', 'begin_checkout', {
      value: params.value,
      currency: params.currency || 'PHP',
      items: params.items,
    })
  }

  /**
   * Track a custom event
   */
  function trackEvent(eventName: string, params?: Record<string, any>) {
    if (!isAvailable()) return

    window.gtag!('event', eventName, params)
  }

  return {
    trackPurchase,
    trackBeginCheckout,
    trackEvent,
  }
}
