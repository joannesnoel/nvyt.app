import webPush from 'web-push'
import { eq } from 'drizzle-orm'
import { pushSubscriptions } from '@nvyt/db'

let configured = false

function ensureConfigured() {
  if (configured) return true
  const config = useRuntimeConfig()
  const { vapidPublicKey, vapidPrivateKey } = config
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn('[web-push] VAPID keys not configured')
    return false
  }
  webPush.setVapidDetails(
    'mailto:hello@nvyt.app',
    vapidPublicKey,
    vapidPrivateKey,
  )
  configured = true
  return true
}

export async function sendPushNotification(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: { title: string; body: string; url?: string; icon?: string; tag?: string },
): Promise<boolean> {
  if (!ensureConfigured()) return false
  try {
    await webPush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify(payload),
    )
    return true
  } catch (error: any) {
    if (error.statusCode === 410 || error.statusCode === 404) {
      const db = useDatabase()
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, subscription.endpoint))
    }
    return false
  }
}

export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url?: string; icon?: string; tag?: string },
): Promise<number> {
  if (!ensureConfigured()) return 0
  const db = useDatabase()
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId))
  let sent = 0
  await Promise.allSettled(
    subs.map(async (sub) => {
      const ok = await sendPushNotification(sub, payload)
      if (ok) sent++
    }),
  )
  return sent
}
