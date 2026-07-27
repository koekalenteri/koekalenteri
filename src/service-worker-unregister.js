self.addEventListener('install', () => {
  void self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await self.registration.unregister()

      const cacheNames = await self.caches.keys()
      await Promise.all(cacheNames.map((cacheName) => self.caches.delete(cacheName)))

      const windowClients = await self.clients.matchAll({ type: 'window' })
      await Promise.allSettled(windowClients.map((client) => client.navigate(client.url)))
    })()
  )
})
