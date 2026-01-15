// PayMongo API integration for Philippine payments
import crypto from 'crypto'

// Supports: GCash, Maya, Cards, Grab Pay, QR Ph, BPI, UnionBank

interface PayMongoConfig {
  secretKey: string
  publicKey: string
  webhookSecret?: string
}

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
  
  return {
    secretKey,
    publicKey,
    webhookSecret: config.paymongoWebhookSecret as string | undefined,
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
  const {
    lineItems,
    paymentMethodTypes = ['gcash', 'paymaya', 'card', 'grab_pay', 'qrph'], // dob, dob_ubp require activation
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
