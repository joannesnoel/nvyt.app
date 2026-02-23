self.addEventListener('push', (event) => {
  if (!event.data) return
  const data = event.data.json()
  const options = {
    body: data.body,
    icon: data.icon || '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: data.tag || 'nvyt-notification',
    data: { url: data.url || '/' },
    vibrate: [200, 100, 200],
  }
  event.waitUntil(self.registration.showNotification(data.title || 'nvyt', options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(url) && 'focus' in client) return client.focus()
      }
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})
