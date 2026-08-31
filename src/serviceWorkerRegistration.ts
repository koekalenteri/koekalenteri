import { reportError } from './lib/client/error'
import { appVersion } from './lib/version'

type UpdateListener = (registration: ServiceWorkerRegistration, worker: ServiceWorker) => void

const updateListeners = new Set<UpdateListener>()
let waitingUpdate: { registration: ServiceWorkerRegistration; worker: ServiceWorker } | undefined
let activatingUpdate = false
let watchingControllerChanges = false
const updatedSessionKey = 'service-worker-updated'

type VersionChange = {
  from: string
  to: string
}

const getServiceWorkerVersion = (worker: ServiceWorker) => {
  if (typeof window.MessageChannel !== 'function') return Promise.resolve(appVersion)

  return new Promise<string>((resolve) => {
    const messageChannel = new window.MessageChannel()
    let timeout: number
    const finish = (version: string) => {
      window.clearTimeout(timeout)
      messageChannel.port1.close()
      messageChannel.port2.close()
      resolve(version)
    }
    timeout = window.setTimeout(() => finish(appVersion), 1000)

    messageChannel.port1.onmessage = (event) => {
      finish(typeof event.data?.version === 'string' ? event.data.version : appVersion)
    }
    worker.postMessage({ type: 'GET_VERSION' }, [messageChannel.port2])
  })
}

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

export const activateServiceWorkerUpdate = (registration: ServiceWorkerRegistration, updateWorker?: ServiceWorker) => {
  const worker = updateWorker ?? registration.waiting
  if (!worker || activatingUpdate) return

  activatingUpdate = true
  clearWaitingUpdate()
  const updatedVersion = getServiceWorkerVersion(worker)
  navigator.serviceWorker.addEventListener(
    'controllerchange',
    async () => {
      try {
        const versionChange: VersionChange = {
          from: appVersion,
          to: await updatedVersion,
        }
        window.sessionStorage.setItem(updatedSessionKey, JSON.stringify(versionChange))
      } catch (error) {
        reportError(error)
      }
      window.location.reload()
    },
    { once: true }
  )
  worker.postMessage({ type: 'SKIP_WAITING' })
}

export const consumeServiceWorkerUpdated = () => {
  try {
    const storedVersionChange = window.sessionStorage.getItem(updatedSessionKey)
    window.sessionStorage.removeItem(updatedSessionKey)
    if (!storedVersionChange) return undefined

    const versionChange: unknown = JSON.parse(storedVersionChange)
    if (
      typeof versionChange === 'object' &&
      versionChange !== null &&
      'from' in versionChange &&
      typeof versionChange.from === 'string' &&
      'to' in versionChange &&
      typeof versionChange.to === 'string'
    ) {
      return versionChange
    }
    return undefined
  } catch (error) {
    reportError(error)
    return undefined
  }
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
