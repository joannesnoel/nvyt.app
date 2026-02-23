export function useWebPush() {
  const isSupported = ref(false)
  const permission = ref<NotificationPermission>('default')
  const isSubscribed = ref(false)
  const isLoading = ref(false)
  const config = useRuntimeConfig()

  if (import.meta.client) {
    isSupported.value = 'serviceWorker' in navigator && 'PushManager' in window
    permission.value = Notification.permission
  }

  async function subscribe() {
    if (!isSupported.value) return false
    isLoading.value = true
    try {
      const perm = await Notification.requestPermission()
      permission.value = perm
      if (perm !== 'granted') return false

      const registration = await navigator.serviceWorker.ready
      let sub = await registration.pushManager.getSubscription()
      if (!sub) {
        sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(config.public.vapidPublicKey as string),
        })
      }
      const subJson = sub.toJSON()
      await $fetch('/api/v1/push/subscribe', {
        method: 'POST',
        body: {
          endpoint: sub.endpoint,
          keys: { p256dh: subJson.keys!.p256dh, auth: subJson.keys!.auth },
        },
      })
      isSubscribed.value = true
      return true
    } catch (e) {
      console.error('[web-push] subscribe failed:', e)
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function unsubscribe() {
    if (!isSupported.value) return
    isLoading.value = true
    try {
      const registration = await navigator.serviceWorker.ready
      const sub = await registration.pushManager.getSubscription()
      if (sub) {
        await $fetch('/api/v1/push/subscribe', { method: 'DELETE', body: { endpoint: sub.endpoint } })
        await sub.unsubscribe()
      }
      isSubscribed.value = false
    } finally {
      isLoading.value = false
    }
  }

  async function checkSubscription() {
    if (!isSupported.value || !import.meta.client) return
    try {
      const registration = await navigator.serviceWorker.ready
      const sub = await registration.pushManager.getSubscription()
      isSubscribed.value = !!sub
    } catch { /* no-op */ }
  }

  return { isSupported, permission, isSubscribed, isLoading, subscribe, unsubscribe, checkSubscription }
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}
