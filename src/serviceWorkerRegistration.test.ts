const mockReportError = vi.fn()

vi.mock('./lib/client/error', () => ({
  reportError: mockReportError,
}))

const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker')
const originalCaches = Object.getOwnPropertyDescriptor(window, 'caches')

const mockServiceWorkerContainer = (
  registration: ServiceWorkerRegistration,
  controller: ServiceWorker | null = {} as ServiceWorker
) => {
  const container = new EventTarget() as ServiceWorkerContainer
  Object.defineProperties(container, {
    controller: { configurable: true, value: controller },
    register: { configurable: true, value: vi.fn().mockResolvedValue(registration) },
  })
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: container })
  return container
}

const mockRegistration = (waiting: ServiceWorker | null = null, installing: ServiceWorker | null = null) => {
  const registration = new EventTarget() as ServiceWorkerRegistration
  Object.defineProperties(registration, {
    installing: { configurable: true, value: installing },
    waiting: { configurable: true, value: waiting },
  })
  return registration
}

const mockInstallingWorker = () => {
  const worker = new EventTarget() as ServiceWorker
  Object.defineProperty(worker, 'state', { configurable: true, value: 'installing' })
  return worker
}

describe('serviceWorkerRegistration', () => {
  beforeEach(() => {
    vi.resetModules()
    mockReportError.mockClear()
    window.sessionStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (originalServiceWorker) {
      Object.defineProperty(navigator, 'serviceWorker', originalServiceWorker)
    } else {
      Reflect.deleteProperty(navigator, 'serviceWorker')
    }
    if (originalCaches) {
      Object.defineProperty(window, 'caches', originalCaches)
    } else {
      Reflect.deleteProperty(window, 'caches')
    }
  })

  it('registers the generated service worker in deployed builds', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const registration = mockRegistration()
    const container = mockServiceWorkerContainer(registration)
    const { registerServiceWorker } = await import('./serviceWorkerRegistration')

    registerServiceWorker()
    window.dispatchEvent(new Event('load'))
    await Promise.resolve()

    expect(container.register).toHaveBeenCalledWith('/service-worker.js')
  })

  it('does not register on the hot-reload development server', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const registration = mockRegistration()
    const container = mockServiceWorkerContainer(registration)
    const { registerServiceWorker } = await import('./serviceWorkerRegistration')

    registerServiceWorker()
    window.dispatchEvent(new Event('load'))
    await Promise.resolve()

    expect(container.register).not.toHaveBeenCalled()
  })

  it('reports registration failures', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const error = new Error('registration failed')
    const registration = mockRegistration()
    const container = mockServiceWorkerContainer(registration)
    const register = container.register as import('vitest').Mock
    register.mockRejectedValue(error)
    const { registerServiceWorker } = await import('./serviceWorkerRegistration')

    registerServiceWorker()
    window.dispatchEvent(new Event('load'))
    await Promise.resolve()
    await Promise.resolve()

    expect(mockReportError).toHaveBeenCalledWith(error)
  })

  it('reports and activates a waiting update only when requested', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    // The code under test only posts a message; the partial worker double converts here.
    const waitingWorker = { postMessage: vi.fn() } as unknown as ServiceWorker
    const registration = mockRegistration(waitingWorker)
    mockServiceWorkerContainer(registration)
    const { activateServiceWorkerUpdate, registerServiceWorker, subscribeToServiceWorkerUpdates } = await import(
      './serviceWorkerRegistration'
    )
    const listener = vi.fn()
    subscribeToServiceWorkerUpdates(listener)

    registerServiceWorker()
    window.dispatchEvent(new Event('load'))
    await Promise.resolve()

    expect(listener).toHaveBeenCalledWith(registration, waitingWorker)
    expect(waitingWorker.postMessage).not.toHaveBeenCalled()

    activateServiceWorkerUpdate(registration)
    activateServiceWorkerUpdate(registration)
    expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    expect(
      (waitingWorker.postMessage as import('vitest').Mock).mock.calls.filter(
        ([message]) => message.type === 'SKIP_WAITING'
      )
    ).toHaveLength(1)

    const laterListener = vi.fn()
    subscribeToServiceWorkerUpdates(laterListener)
    expect(laterListener).not.toHaveBeenCalled()
  })

  it('reports an applied update once', async () => {
    const { consumeServiceWorkerUpdated, updatedSessionKey } = await import('./serviceWorkerRegistration')
    window.sessionStorage.setItem(updatedSessionKey, JSON.stringify({ from: '1.10.2', to: '1.10.3' }))

    expect(consumeServiceWorkerUpdated()).toEqual({ from: '1.10.2', to: '1.10.3' })
    expect(consumeServiceWorkerUpdated()).toBeUndefined()
  })

  it('reports an update that finishes installing while the app is controlled', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const installingWorker = mockInstallingWorker()
    const registration = mockRegistration(null, installingWorker)
    mockServiceWorkerContainer(registration)
    const { registerServiceWorker, subscribeToServiceWorkerUpdates } = await import('./serviceWorkerRegistration')
    const listener = vi.fn()
    subscribeToServiceWorkerUpdates(listener)

    registerServiceWorker()
    window.dispatchEvent(new Event('load'))
    await Promise.resolve()
    registration.dispatchEvent(new Event('updatefound'))
    Object.defineProperty(installingWorker, 'state', { configurable: true, value: 'installed' })
    installingWorker.dispatchEvent(new Event('statechange'))

    expect(listener).toHaveBeenCalledWith(registration, installingWorker)
  })

  it('does not report the service worker during its first install', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const installingWorker = mockInstallingWorker()
    const registration = mockRegistration(null, installingWorker)
    mockServiceWorkerContainer(registration, null)
    const { registerServiceWorker, subscribeToServiceWorkerUpdates } = await import('./serviceWorkerRegistration')
    const listener = vi.fn()
    subscribeToServiceWorkerUpdates(listener)

    registerServiceWorker()
    window.dispatchEvent(new Event('load'))
    await Promise.resolve()
    registration.dispatchEvent(new Event('updatefound'))
    Object.defineProperty(installingWorker, 'state', { configurable: true, value: 'installed' })
    installingWorker.dispatchEvent(new Event('statechange'))

    expect(listener).not.toHaveBeenCalled()
  })

  describe('when the tab comes back into view', () => {
    const hour = 60 * 60 * 1000

    const setVisibility = (visibilityState: DocumentVisibilityState) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: visibilityState })
      document.dispatchEvent(new Event('visibilitychange'))
    }

    const registerWithUpdate = async (update = vi.fn().mockResolvedValue(undefined)) => {
      vi.stubEnv('NODE_ENV', 'production')
      const registration = mockRegistration()
      Object.defineProperty(registration, 'update', { configurable: true, value: update })
      mockServiceWorkerContainer(registration)
      const { registerServiceWorker } = await import('./serviceWorkerRegistration')

      registerServiceWorker()
      window.dispatchEvent(new Event('load'))
      await Promise.resolve()
      return update
    }

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-11-08T12:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
      Reflect.deleteProperty(document, 'visibilityState')
    })

    it('asks for a newer service worker after the tab was away for an hour', async () => {
      const update = await registerWithUpdate()

      setVisibility('hidden')
      vi.setSystemTime(new Date('2026-11-08T13:00:00Z'))
      setVisibility('visible')

      expect(update).toHaveBeenCalledTimes(1)
    })

    it('does not ask again within the hour', async () => {
      const update = await registerWithUpdate()

      vi.setSystemTime(Date.now() + hour - 1)
      setVisibility('visible')
      expect(update).not.toHaveBeenCalled()

      vi.setSystemTime(Date.now() + 1)
      setVisibility('visible')
      vi.setSystemTime(Date.now() + hour - 1)
      setVisibility('visible')
      expect(update).toHaveBeenCalledTimes(1)
    })

    it('does not ask while the tab is hidden', async () => {
      const update = await registerWithUpdate()

      vi.setSystemTime(Date.now() + hour)
      setVisibility('hidden')

      expect(update).not.toHaveBeenCalled()
    })

    it('leaves an offline check unreported', async () => {
      const update = await registerWithUpdate(vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

      vi.setSystemTime(Date.now() + hour)
      setVisibility('visible')
      await Promise.resolve()
      await Promise.resolve()

      expect(update).toHaveBeenCalledTimes(1)
      expect(mockReportError).not.toHaveBeenCalled()
    })
  })

  it('unregisters the service worker for rollback builds', async () => {
    const registration = mockRegistration()
    const unregister = vi.fn().mockResolvedValue(true)
    Object.defineProperty(registration, 'unregister', { configurable: true, value: unregister })
    const container = mockServiceWorkerContainer(registration)
    Object.defineProperty(container, 'getRegistrations', {
      configurable: true,
      value: vi.fn().mockResolvedValue([registration]),
    })
    const cacheKeys = vi.fn().mockResolvedValue(['workbox-precache'])
    const cacheDelete = vi.fn().mockResolvedValue(true)
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: { delete: cacheDelete, keys: cacheKeys },
    })
    const { unregisterServiceWorker } = await import('./serviceWorkerRegistration')

    await unregisterServiceWorker()

    expect(container.getRegistrations).toHaveBeenCalled()
    expect(unregister).toHaveBeenCalled()
    expect(cacheKeys).toHaveBeenCalled()
    expect(cacheDelete).toHaveBeenCalledWith('workbox-precache')
  })
})
