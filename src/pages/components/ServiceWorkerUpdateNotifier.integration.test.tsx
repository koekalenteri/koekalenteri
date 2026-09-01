import { render, waitFor } from '@testing-library/react'
import { useSnackbar } from 'notistack'
import { useTranslation } from 'react-i18next'
import { registerServiceWorker } from '../../serviceWorkerRegistration'
import ServiceWorkerUpdateNotifier from './ServiceWorkerUpdateNotifier'

vi.mock('notistack', () => ({
  useSnackbar: vi.fn(),
}))
vi.mock('react-i18next', () => ({
  useTranslation: vi.fn(),
}))

const mockUseSnackbar = useSnackbar as import('vitest').MockedFunction<typeof useSnackbar>
const mockUseTranslation = useTranslation as import('vitest').MockedFunction<typeof useTranslation>
const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker')

describe('ServiceWorkerUpdateNotifier integration', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    if (originalServiceWorker) {
      Object.defineProperty(navigator, 'serviceWorker', originalServiceWorker)
    } else {
      Reflect.deleteProperty(navigator, 'serviceWorker')
    }
  })

  it('activates the waiting worker automatically', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    // The notifier only posts a message; the partial worker double converts here.
    const waitingWorker = { postMessage: vi.fn() } as unknown as ServiceWorker
    const registration = new EventTarget() as ServiceWorkerRegistration
    Object.defineProperties(registration, {
      installing: { configurable: true, value: null },
      waiting: { configurable: true, value: waitingWorker },
    })
    const serviceWorker = new EventTarget() as ServiceWorkerContainer
    Object.defineProperties(serviceWorker, {
      controller: { configurable: true, value: {} },
      register: { configurable: true, value: vi.fn().mockResolvedValue(registration) },
    })
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: serviceWorker })

    const enqueueSnackbar = vi.fn()
    mockUseSnackbar.mockReturnValue({
      closeSnackbar: vi.fn(),
      enqueueSnackbar: enqueueSnackbar as unknown as ReturnType<typeof useSnackbar>['enqueueSnackbar'],
    })
    mockUseTranslation.mockReturnValue({ t: (key: string) => key } as ReturnType<typeof useTranslation>)

    render(<ServiceWorkerUpdateNotifier />)
    registerServiceWorker()
    window.dispatchEvent(new Event('load'))

    await waitFor(() => expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' }))
    expect(enqueueSnackbar).not.toHaveBeenCalled()
  })
})
