const APP_BASE = new URL('./', self.location).pathname
const CACHE_NAME = 'almuafy-academy-shell-v1'
const APP_SHELL = [
  APP_BASE,
  `${APP_BASE}manifest.webmanifest`,
  `${APP_BASE}icons/icon-192.png`,
  `${APP_BASE}icons/icon-512.png`,
  `${APP_BASE}images/my-own-logo.png`,
  `${APP_BASE}fonts/bornomala-regular.woff2`,
  `${APP_BASE}fonts/bornomala-bold.woff2`,
  `${APP_BASE}fonts/inter-latin-variable.woff2`,
]

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', event => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(APP_BASE)) return
  if (/\/auth\/v1\/|\/rest\/v1\/|\/functions\/v1\//.test(url.pathname)) return

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(`${APP_BASE}`, response.clone()))
      return response
    }).catch(async () => (await caches.match(`${APP_BASE}`)) || Response.error()))
    return
  }

  if (/\/assets\/|\/icons\/|\/fonts\/|\/images\/|manifest\.webmanifest$/.test(url.pathname)) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()))
      return response
    })))
  }
})

self.addEventListener('push', event => {
  let message = {}
  try { message = event.data?.json() ?? {} } catch { message = { body: event.data?.text() ?? '' } }
  const title = message.title || 'Almuafy Academy'
  const options = {
    body: message.body || 'You have an incoming academy call.',
    icon: message.icon || `${APP_BASE}icons/icon-192.png`,
    badge: `${APP_BASE}icons/icon-192.png`,
    tag: message.tag || 'academy-incoming-call',
    renotify: true,
    data: { url: message.data?.url || APP_BASE },
  }
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    if (windows.some(client => client.visibilityState === 'visible')) return
    return self.registration.showNotification(title, options)
  })())
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const targetUrl = new URL(event.notification.data?.url || APP_BASE, self.location.origin).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if ('navigate' in client) await client.navigate(targetUrl)
      if ('focus' in client) return client.focus()
    }
    return self.clients.openWindow(targetUrl)
  })())
})
