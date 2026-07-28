import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

precacheAndRoute(self.__WB_MANIFEST)

// Serve the application shell for client-side routes. Requests for files are
// excluded so a missing asset cannot accidentally receive index.html.
const fileExtension = /\/[^/?]+\.[^/]+$/
registerRoute(
  // PUBLIC_URL is replaced by the parent webpack compilation inherited by
  // InjectManifest's child compiler.
  new NavigationRoute(createHandlerBoundToURL(`${process.env.PUBLIC_URL}/index.html`), {
    denylist: [fileExtension],
  })
)

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('message', (event) => {
  if (event.origin !== self.location.origin) return

  if (event.data?.type === 'SKIP_WAITING') {
    void self.skipWaiting()
  }
})
