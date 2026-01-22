// PayPal API integration
// Supports: PayPal Balance, Credit/Debit Cards, Pay Later

import crypto from 'crypto'

interface PayPalConfig {
  clientId: string
  clientSecret: string
  mode: 'sandbox' | 'live'
  webhookId?: string
}

interface LineItem {
  name: string
  quantity: number
  amount: number // in smallest currency unit (centavos for PHP, cents for USD)
  currency: string
  description?: string
}

interface CreateOrderOptions {
  lineItems: LineItem[]
  currency: string
  referenceId: string
  description?: string
  returnUrl: string
  cancelUrl: string
}

interface PayPalOrder {
  id: string
  status: 'CREATED' | 'SAVED' | 'APPROVED' | 'VOIDED' | 'COMPLETED' | 'PAYER_ACTION_REQUIRED'
  intent: string
  purchase_units: Array<{
    reference_id: string
    amount: {
      currency_code: string
      value: string
      breakdown?: {
        item_total?: { currency_code: string; value: string }
      }
    }
    items?: Array<{
      name: string
      quantity: string
      unit_amount: { currency_code: string; value: string }
      description?: string
    }>
    payments?: {
      captures?: Array<{
        id: string
        status: string
        amount: { currency_code: string; value: string }
        create_time: string
        update_time: string
      }>
    }
  }>
  payer?: {
    email_address?: string
    payer_id?: string
    name?: {
      given_name?: string
      surname?: string
    }
  }
  create_time: string
  update_time: string
  links: Array<{
    href: string
    rel: string
    method: string
  }>
}

interface PayPalCapture {
  id: string
  status: 'COMPLETED' | 'DECLINED' | 'PARTIALLY_REFUNDED' | 'PENDING' | 'REFUNDED' | 'FAILED'
  status_details?: {
    reason?: string
  }
  amount: {
    currency_code: string
    value: string
  }
  create_time: string
  update_time: string
}

interface PayPalRefund {
  id: string
  status: 'CANCELLED' | 'FAILED' | 'PENDING' | 'COMPLETED'
  amount: {
    currency_code: string
    value: string
  }
  create_time: string
  update_time: string
}

interface PayPalWebhookEvent {
  id: string
  event_version: string
  create_time: string
  resource_type: string
  event_type: string
  summary: string
  resource: Record<string, unknown>
  links: Array<{
    href: string
    rel: string
    method: string
  }>
}

// Token cache
let accessTokenCache: { token: string; expiresAt: number } | null = null

function getConfig(): PayPalConfig {
  const config = useRuntimeConfig()

  const clientId = config.paypalClientId as string
  const clientSecret = config.paypalClientSecret as string
  const mode = (config.paypalMode as 'sandbox' | 'live') || 'sandbox'
  const webhookId = config.paypalWebhookId as string | undefined

  if (!clientId || clientId.startsWith('sb-xxx')) {
    throw createError({
      statusCode: 500,
      message: 'PayPal client ID is not configured. Please set PAYPAL_CLIENT_ID in your .env file.',
    })
  }

  if (!clientSecret) {
    throw createError({
      statusCode: 500,
      message: 'PayPal client secret is not configured. Please set PAYPAL_CLIENT_SECRET in your .env file.',
    })
  }

  return {
    clientId,
    clientSecret,
    mode,
    webhookId,
  }
}

function getBaseUrl(): string {
  const { mode } = getConfig()
  return mode === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com'
}

/**
 * Get OAuth2 access token with caching
 */
export async function getAccessToken(): Promise<string> {
  // Check cache first (with 5-minute buffer before expiry)
  if (accessTokenCache && Date.now() < accessTokenCache.expiresAt - 300000) {
    return accessTokenCache.token
  }

  const { clientId, clientSecret } = getConfig()
  const baseUrl = getBaseUrl()

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw createError({
      statusCode: response.status,
      message: error.error_description || 'Failed to get PayPal access token',
    })
  }

  const data = await response.json()

  // Cache the token
  accessTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000),
  }

  return data.access_token
}

async function paypalRequest<T>(
  endpoint: string,
  options: {
    method?: string
    body?: Record<string, unknown>
    headers?: Record<string, string>
  } = {}
): Promise<T> {
  const { method = 'GET', body, headers = {} } = options

  const accessToken = await getAccessToken()
  const baseUrl = getBaseUrl()

  const response = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...headers,
    },
    ...(body && { body: JSON.stringify(body) }),
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const errorMessage = data.message || data.details?.[0]?.description || 'PayPal API error'
    throw createError({
      statusCode: response.status,
      message: errorMessage,
      data: { code: data.name || 'PAYPAL_ERROR', details: data.details },
    })
  }

  return data
}

/**
 * Create a PayPal order for checkout
 */
export async function createPayPalOrder(options: CreateOrderOptions): Promise<PayPalOrder> {
  const {
    lineItems,
    currency,
    referenceId,
    description,
    returnUrl,
    cancelUrl,
  } = options

  // Calculate total from line items
  const totalAmount = lineItems.reduce((sum, item) => sum + (item.amount * item.quantity), 0)

  // Format amounts to 2 decimal places (PayPal requires string amounts)
  const formatAmount = (amount: number) => (amount / 100).toFixed(2)

  const purchaseUnit: Record<string, unknown> = {
    reference_id: referenceId,
    description: description || 'Ticket purchase',
    amount: {
      currency_code: currency,
      value: formatAmount(totalAmount),
      breakdown: {
        item_total: {
          currency_code: currency,
          value: formatAmount(totalAmount),
        },
      },
    },
    items: lineItems.map((item) => ({
      name: item.name.substring(0, 127), // PayPal has 127 char limit
      quantity: String(item.quantity),
      unit_amount: {
        currency_code: currency,
        value: formatAmount(item.amount),
      },
      ...(item.description && { description: item.description.substring(0, 127) }),
    })),
  }

  return paypalRequest<PayPalOrder>('/v2/checkout/orders', {
    method: 'POST',
    headers: {
      'PayPal-Request-Id': referenceId, // Idempotency key
    },
    body: {
      intent: 'CAPTURE',
      purchase_units: [purchaseUnit],
      payment_source: {
        paypal: {
          experience_context: {
            payment_method_preference: 'IMMEDIATE_PAYMENT_REQUIRED',
            brand_name: 'nvyt',
            locale: 'en-US',
            landing_page: 'LOGIN',
            user_action: 'PAY_NOW',
            return_url: returnUrl,
            cancel_url: cancelUrl,
          },
        },
      },
    },
  })
}

/**
 * Capture a PayPal order after buyer approval
 */
export async function capturePayPalOrder(orderId: string): Promise<PayPalOrder> {
  return paypalRequest<PayPalOrder>(`/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      'PayPal-Request-Id': `capture-${orderId}-${Date.now()}`, // Idempotency key
    },
  })
}

/**
 * Get PayPal order details
 */
export async function getPayPalOrder(orderId: string): Promise<PayPalOrder> {
  return paypalRequest<PayPalOrder>(`/v2/checkout/orders/${orderId}`)
}

/**
 * Refund a PayPal capture
 */
export async function refundPayPalCapture(
  captureId: string,
  amount?: number,
  currency?: string,
  reason?: string
): Promise<PayPalRefund> {
  const body: Record<string, unknown> = {}

  // If amount is provided, it's a partial refund
  if (amount !== undefined && currency) {
    body.amount = {
      currency_code: currency,
      value: (amount / 100).toFixed(2),
    }
  }

  if (reason) {
    body.note_to_payer = reason.substring(0, 255)
  }

  return paypalRequest<PayPalRefund>(`/v2/payments/captures/${captureId}/refund`, {
    method: 'POST',
    headers: {
      'PayPal-Request-Id': `refund-${captureId}-${Date.now()}`, // Idempotency key
    },
    body: Object.keys(body).length > 0 ? body : undefined,
  })
}

/**
 * Verify PayPal webhook signature
 * https://developer.paypal.com/docs/api/webhooks/v1/#verify-webhook-signature
 */
export async function verifyPayPalWebhook(
  headers: Record<string, string | string[] | undefined>,
  body: string
): Promise<boolean> {
  const { webhookId } = getConfig()

  if (!webhookId) {
    console.warn('PayPal webhook ID not configured')
    return false
  }

  const transmissionId = headers['paypal-transmission-id'] as string
  const transmissionTime = headers['paypal-transmission-time'] as string
  const certUrl = headers['paypal-cert-url'] as string
  const authAlgo = headers['paypal-auth-algo'] as string
  const transmissionSig = headers['paypal-transmission-sig'] as string

  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
    console.warn('Missing PayPal webhook headers')
    return false
  }

  try {
    const response = await paypalRequest<{ verification_status: string }>('/v1/notifications/verify-webhook-signature', {
      method: 'POST',
      body: {
        auth_algo: authAlgo,
        cert_url: certUrl,
        transmission_id: transmissionId,
        transmission_sig: transmissionSig,
        transmission_time: transmissionTime,
        webhook_id: webhookId,
        webhook_event: JSON.parse(body),
      },
    })

    return response.verification_status === 'SUCCESS'
  } catch (error) {
    console.error('PayPal webhook verification failed:', error)
    return false
  }
}

/**
 * Parse webhook event from request body
 */
export function parsePayPalWebhookEvent(body: unknown): PayPalWebhookEvent {
  return body as PayPalWebhookEvent
}

/**
 * Convert amount to smallest currency unit (centavos/cents)
 */
export function toCents(amount: number): number {
  return Math.round(amount * 100)
}

/**
 * Convert from smallest currency unit to decimal
 */
export function fromCents(cents: number): number {
  return cents / 100
}

/**
 * Check if PayPal order capture was successful
 */
export function isCaptureSuccessful(order: PayPalOrder): boolean {
  return order.status === 'COMPLETED'
}

/**
 * Get capture ID from completed order
 */
export function getCaptureId(order: PayPalOrder): string | null {
  const capture = order.purchase_units?.[0]?.payments?.captures?.[0]
  return capture?.id || null
}

/**
 * Get payer email from order
 */
export function getPayerEmail(order: PayPalOrder): string | null {
  return order.payer?.email_address || null
}
