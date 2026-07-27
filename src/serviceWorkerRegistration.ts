import { reportError } from './lib/client/error'

type UpdateListener = (registration: ServiceWorkerRegistration, worker: ServiceWorker) => void

const updateListeners = new Set<UpdateListener>()
let waitingUpdate: { registration: ServiceWorkerRegistration; worker: ServiceWorker } | undefined
let activatingUpdate = false
let watchingControllerChanges = false

const clearWaitingUpdate = () => {
  waitingUpdate = undefined
}

const watchControllerChanges = () => {
  if (watchingControllerChanges) return

  watchingControllerChanges = true
  navigator.serviceWorker.addEventListener('controllerchange', clearWaitingUpdate)
}

const notifyUpdate = (registration: ServiceWorkerRegistration, worker: ServiceWorker) => {
  waitingUpdate = { registration, worker }
  updateListeners.forEach((listener) => {
    listener(registration, worker)
  })
}

const watchRegistration = (registration: ServiceWorkerRegistration) => {
  if (registration.waiting && navigator.serviceWorker.controller) {
    notifyUpdate(registration, registration.waiting)
  }

  registration.addEventListener('updatefound', () => {
    const installingWorker = registration.installing
    if (!installingWorker) return

    installingWorker.addEventListener('statechange', () => {
      if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
        notifyUpdate(registration, installingWorker)
      }
    })
  })
}

export const registerServiceWorker = () => {
  if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return

  window.addEventListener(
    'load',
    () => {
      watchControllerChanges()
      navigator.serviceWorker
        .register(`${process.env.PUBLIC_URL}/service-worker.js`)
        .then(watchRegistration)
        .catch(reportError)
    },
    { once: true }
  )
}

export const subscribeToServiceWorkerUpdates = (listener: UpdateListener) => {
  updateListeners.add(listener)
  if (waitingUpdate) listener(waitingUpdate.registration, waitingUpdate.worker)

  return () => {
    updateListeners.delete(listener)
  }
}

export const activateServiceWorkerUpdate = (registration: ServiceWorkerRegistration) => {
  const worker = registration.waiting
  if (!worker || activatingUpdate) return

  activatingUpdate = true
  clearWaitingUpdate()
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true })
  worker.postMessage({ type: 'SKIP_WAITING' })
}

export const unregisterServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) return

  try {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((registration) => registration.unregister()))

    if ('caches' in window) {
      const cacheNames = await window.caches.keys()
      await Promise.all(cacheNames.map((cacheName) => window.caches.delete(cacheName)))
    }
  } catch (error) {
    reportError(error)
  }
}
