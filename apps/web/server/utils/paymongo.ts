// PayMongo API integration for Philippine payments
import crypto from 'crypto'

// Supports: GCash, Maya, Grab Pay, QR Ph, ShopeePay, BPI, UnionBank

interface PayMongoConfig {
  secretKey: string
  publicKey: string
  webhookSecret?: string
  paymentMethods?: string[]
}

// Default payment methods if not configured
const DEFAULT_PAYMENT_METHODS = ['gcash', 'paymaya', 'grab_pay', 'qrph', 'shopee_pay']

interface LineItem {
  name: string
  quantity: number
  amount: number // in centavos (PHP * 100)
  currency: string
  description?: string
}

interface CheckoutSessionOptions {
  lineItems: LineItem[]
  paymentMethodTypes?: string[]
  successUrl: string
  cancelUrl: string
  referenceNumber: string
  customerEmail?: string
  customerName?: string
  customerPhone?: string
  metadata?: Record<string, string>
}

interface CheckoutSession {
  id: string
  type: string
  attributes: {
    checkout_url: string
    payment_intent: {
      id: string
      type: string
      attributes: {
        status: string
        amount: number
        currency: string
      }
    }
    reference_number: string
    status: string
    created_at: number
    updated_at: number
    metadata?: Record<string, string>
  }
}

interface PaymentIntent {
  id: string
  type: string
  attributes: {
    status: 'awaiting_payment_method' | 'awaiting_next_action' | 'processing' | 'succeeded' | 'failed'
    amount: number
    currency: string
    payment_method_allowed: string[]
    payments: Array<{
      id: string
      type: string
      attributes: {
        status: string
        amount: number
        source: {
          type: string
        }
      }
    }>
    metadata?: Record<string, string>
    created_at: number
    updated_at: number
  }
}

interface Refund {
  id: string
  type: string
  attributes: {
    amount: number
    status: 'pending' | 'succeeded' | 'failed'
    reason: string
    payment_id: string
    created_at: number
    updated_at: number
  }
}

interface WebhookEvent {
  id: string
  type: string
  attributes: {
    type: string
    data: {
      id: string
      type: string
      attributes: Record<string, unknown>
    }
    created_at: number
    updated_at: number
  }
}

const PAYMONGO_API_URL = 'https://api.paymongo.com/v1'

function getConfig(): PayMongoConfig {
  const config = useRuntimeConfig()
  
  const secretKey = config.paymongoSecretKey as string
  const publicKey = config.public.paymongoPublicKey as string
  
  // Validate keys exist and aren't placeholders
  if (!secretKey || secretKey === 'sk_test_xxx' || !secretKey.startsWith('sk_')) {
    throw createError({
      statusCode: 500,
      message: 'PayMongo secret key is not configured. Please set PAYMONGO_SECRET_KEY in your .env file.',
    })
  }
  
  if (!publicKey || publicKey === 'pk_test_xxx' || !publicKey.startsWith('pk_')) {
    throw createError({
      statusCode: 500,
      message: 'PayMongo public key is not configured. Please set PAYMONGO_PUBLIC_KEY in your .env file.',
    })
  }
  
  // Parse payment methods from config (comma-separated string)
  const paymentMethodsStr = config.paymongoPaymentMethods as string | undefined
  const parsedMethods = paymentMethodsStr
    ? paymentMethodsStr.split(',').map((m: string) => m.trim()).filter((m: string) => m.length > 0)
    : []
  // Return undefined if empty so DEFAULT_PAYMENT_METHODS is used
  const paymentMethods = parsedMethods.length > 0 ? parsedMethods : undefined

  return {
    secretKey,
    publicKey,
    webhookSecret: config.paymongoWebhookSecret as string | undefined,
    paymentMethods,
  }
}

function getAuthHeader(): string {
  const { secretKey } = getConfig()
  return `Basic ${Buffer.from(secretKey + ':').toString('base64')}`
}

async function paymongoRequest<T>(
  endpoint: string,
  options: {
    method?: string
    body?: Record<string, unknown>
  } = {}
): Promise<T> {
  const { method = 'GET', body } = options

  const response = await fetch(`${PAYMONGO_API_URL}${endpoint}`, {
    method,
    headers: {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    ...(body && { body: JSON.stringify(body) }),
  })

  const data = await response.json()

  if (!response.ok) {
    const errorMessage = data.errors?.[0]?.detail || 'PayMongo API error'
    const errorCode = data.errors?.[0]?.code || 'PAYMONGO_ERROR'
    throw createError({
      statusCode: response.status,
      message: errorMessage,
      data: { code: errorCode, errors: data.errors },
    })
  }

  return data
}

/**
 * Create a PayMongo Checkout Session
 * This redirects users to PayMongo's hosted checkout page
 */
export async function createCheckoutSession(
  options: CheckoutSessionOptions
): Promise<CheckoutSession> {
  const config = getConfig()

  const {
    lineItems,
    paymentMethodTypes = config.paymentMethods || DEFAULT_PAYMENT_METHODS,
    successUrl,
    cancelUrl,
    referenceNumber,
    customerEmail,
    customerName,
    customerPhone,
    metadata,
  } = options

  const response = await paymongoRequest<{ data: CheckoutSession }>('/checkout_sessions', {
    method: 'POST',
    body: {
      data: {
        attributes: {
          line_items: lineItems.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            amount: item.amount,
            currency: item.currency,
            description: item.description,
          })),
          payment_method_types: paymentMethodTypes,
          success_url: successUrl,
          cancel_url: cancelUrl,
          reference_number: referenceNumber,
          ...(customerEmail && {
            billing: {
              email: customerEmail,
              name: customerName,
              phone: customerPhone,
            },
          }),
          ...(metadata && { metadata }),
        },
      },
    },
  })

  return response.data
}

/**
 * Retrieve a Checkout Session by ID
 */
export async function getCheckoutSession(sessionId: string): Promise<CheckoutSession> {
  const response = await paymongoRequest<{ data: CheckoutSession }>(
    `/checkout_sessions/${sessionId}`
  )
  return response.data
}

/**
 * Retrieve a Payment Intent by ID
 */
export async function getPaymentIntent(paymentIntentId: string): Promise<PaymentIntent> {
  const response = await paymongoRequest<{ data: PaymentIntent }>(
    `/payment_intents/${paymentIntentId}`
  )
  return response.data
}

/**
 * Create a refund for a payment
 */
export async function createRefund(
  paymentId: string,
  amount: number,
  reason: string = 'requested_by_customer'
): Promise<Refund> {
  const response = await paymongoRequest<{ data: Refund }>('/refunds', {
    method: 'POST',
    body: {
      data: {
        attributes: {
          amount,
          payment_id: paymentId,
          reason,
        },
      },
    },
  })

  return response.data
}

/**
 * Retrieve a refund by ID
 */
export async function getRefund(refundId: string): Promise<Refund> {
  const response = await paymongoRequest<{ data: Refund }>(`/refunds/${refundId}`)
  return response.data
}

/**
 * Verify webhook signature (HMAC-SHA256)
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  timestamp: string
): boolean {
  const { webhookSecret } = getConfig()
  if (!webhookSecret) {
    console.warn('PayMongo webhook secret not configured')
    return false
  }

  const signedPayload = `${timestamp}.${payload}`
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(signedPayload)
    .digest('hex')

  // The signature header format is: t=timestamp,te=test_signature,li=live_signature
  const signatures = signature.split(',')
  const liveSignature = signatures.find((s) => s.startsWith('li='))?.replace('li=', '')
  const testSignature = signatures.find((s) => s.startsWith('te='))?.replace('te=', '')

  return liveSignature === expectedSignature || testSignature === expectedSignature
}

/**
 * Parse webhook event from request body
 */
export function parseWebhookEvent(body: unknown): WebhookEvent {
  const event = body as { data: WebhookEvent }
  return event.data
}

/**
 * Convert PHP amount to centavos (PayMongo uses centavos)
 */
export function toCentavos(amount: number): number {
  return Math.round(amount * 100)
}

/**
 * Convert centavos to PHP
 */
export function fromCentavos(centavos: number): number {
  return centavos / 100
}

/**
 * Helper to check if payment was successful
 */
export function isPaymentSuccessful(paymentIntent: PaymentIntent): boolean {
  return paymentIntent.attributes.status === 'succeeded'
}

/**
 * Get the payment method used (e.g., 'gcash', 'card')
 */
export function getPaymentMethod(paymentIntent: PaymentIntent): string | null {
  const payment = paymentIntent.attributes.payments?.[0]
  return payment?.attributes?.source?.type || null
}

// ============================================================================
// Payment Intents API (for custom checkout)
// ============================================================================

export interface CreatePaymentIntentOptions {
  amount: number // in centavos
  currency?: string
  paymentMethodAllowed?: string[]
  description?: string
  metadata?: Record<string, string>
  captureType?: 'automatic' | 'manual'
}

export interface PaymentIntentResponse {
  id: string
  type: 'payment_intent'
  attributes: {
    amount: number
    currency: string
    status: 'awaiting_payment_method' | 'awaiting_next_action' | 'processing' | 'succeeded' | 'failed'
    payment_method_allowed: string[]
    client_key: string
    description?: string
    metadata?: Record<string, string>
    payments: Array<{
      id: string
      type: string
      attributes: {
        status: string
        amount: number
        source: {
          type: string
        }
      }
    }>
    next_action?: {
      type: string
      redirect?: {
        url: string
        return_url: string
      }
    }
    created_at: number
    updated_at: number
  }
}

/**
 * Create a Payment Intent for custom checkout flow
 * This allows collecting payment without using PayMongo's hosted checkout
 */
export async function createPaymentIntent(
  options: CreatePaymentIntentOptions
): Promise<PaymentIntentResponse> {
  const config = getConfig()

  const {
    amount,
    currency = 'PHP',
    paymentMethodAllowed = config.paymentMethods || DEFAULT_PAYMENT_METHODS,
    description,
    metadata,
    captureType = 'automatic',
  } = options

  const response = await paymongoRequest<{ data: PaymentIntentResponse }>('/payment_intents', {
    method: 'POST',
    body: {
      data: {
        attributes: {
          amount,
          currency,
          payment_method_allowed: paymentMethodAllowed,
          capture_type: captureType,
          ...(description && { description }),
          ...(metadata && { metadata }),
        },
      },
    },
  })

  return response.data
}

// ============================================================================
// Payment Methods API
// ============================================================================

export type PaymentMethodType =
  | 'card'
  | 'gcash'
  | 'paymaya'
  | 'grab_pay'
  | 'qrph'
  | 'shopee_pay'
  | 'dob'
  | 'dob_ubp'
  | 'brankas_bdo'
  | 'brankas_landbank'
  | 'brankas_metrobank'

export interface CreatePaymentMethodOptions {
  type: PaymentMethodType
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
  metadata?: Record<string, string>
}

export interface PaymentMethodResponse {
  id: string
  type: 'payment_method'
  attributes: {
    type: PaymentMethodType
    billing?: {
      name?: string
      email?: string
      phone?: string
      address?: Record<string, string>
    }
    metadata?: Record<string, string>
    created_at: number
    updated_at: number
  }
}

/**
 * Create a Payment Method (server-side)
 * For e-wallets, this only needs the type
 * For cards, use PayMongo.js on the client to create the payment method
 */
export async function createPaymentMethod(
  options: CreatePaymentMethodOptions
): Promise<PaymentMethodResponse> {
  const { type, billing, metadata } = options

  const response = await paymongoRequest<{ data: PaymentMethodResponse }>('/payment_methods', {
    method: 'POST',
    body: {
      data: {
        attributes: {
          type,
          ...(billing && { billing }),
          ...(metadata && { metadata }),
        },
      },
    },
  })

  return response.data
}

// ============================================================================
// Attach Payment Method to Payment Intent
// ============================================================================

export interface AttachPaymentMethodOptions {
  paymentIntentId: string
  paymentMethodId: string
  returnUrl: string
  clientKey?: string // Required for card payments created client-side
}

export interface AttachPaymentMethodResponse {
  id: string
  type: 'payment_intent'
  attributes: {
    amount: number
    currency: string
    status: 'awaiting_payment_method' | 'awaiting_next_action' | 'processing' | 'succeeded' | 'failed'
    payment_method_allowed: string[]
    client_key: string
    payments: Array<{
      id: string
      type: string
      attributes: {
        status: string
        amount: number
        source: {
          type: string
        }
      }
    }>
    next_action?: {
      type: 'redirect'
      redirect: {
        url: string
        return_url: string
      }
    }
    metadata?: Record<string, string>
    created_at: number
    updated_at: number
  }
}

/**
 * Attach a Payment Method to a Payment Intent
 * For e-wallets (GCash, Maya, Grab Pay), this will return a redirect URL
 * For cards, this may return a 3DS redirect URL if 3DS is required
 */
export async function attachPaymentMethod(
  options: AttachPaymentMethodOptions
): Promise<AttachPaymentMethodResponse> {
  const { paymentIntentId, paymentMethodId, returnUrl, clientKey } = options

  const response = await paymongoRequest<{ data: AttachPaymentMethodResponse }>(
    `/payment_intents/${paymentIntentId}/attach`,
    {
      method: 'POST',
      body: {
        data: {
          attributes: {
            payment_method: paymentMethodId,
            return_url: returnUrl,
            ...(clientKey && { client_key: clientKey }),
          },
        },
      },
    }
  )

  return response.data
}

/**
 * Get the public key for PayMongo.js (used for card tokenization on client)
 */
export function getPublicKey(): string {
  const config = getConfig()
  return config.publicKey
}
