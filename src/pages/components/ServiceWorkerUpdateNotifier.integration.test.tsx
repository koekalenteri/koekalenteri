import { render, waitFor } from '@testing-library/react'
import { useSnackbar } from 'notistack'
import { useTranslation } from 'react-i18next'
import { registerServiceWorker } from '../../serviceWorkerRegistration'
import ServiceWorkerUpdateNotifier from './ServiceWorkerUpdateNotifier'

jest.mock('notistack', () => ({
  useSnackbar: jest.fn(),
}))
jest.mock('react-i18next', () => ({
  useTranslation: jest.fn(),
}))

const mockUseSnackbar = useSnackbar as jest.MockedFunction<typeof useSnackbar>
const mockUseTranslation = useTranslation as jest.MockedFunction<typeof useTranslation>
const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker')

describe('ServiceWorkerUpdateNotifier integration', () => {
  afterEach(() => {
    jest.restoreAllMocks()
    if (originalServiceWorker) {
      Object.defineProperty(navigator, 'serviceWorker', originalServiceWorker)
    } else {
      Reflect.deleteProperty(navigator, 'serviceWorker')
    }
  })

  it('activates the waiting worker automatically', async () => {
    jest.replaceProperty(process.env, 'NODE_ENV', 'production')
    const waitingWorker = { postMessage: jest.fn() } as unknown as ServiceWorker
    const registration = new EventTarget() as ServiceWorkerRegistration
    Object.defineProperties(registration, {
      installing: { configurable: true, value: null },
      waiting: { configurable: true, value: waitingWorker },
    })
    const serviceWorker = new EventTarget() as ServiceWorkerContainer
    Object.defineProperties(serviceWorker, {
      controller: { configurable: true, value: {} },
      register: { configurable: true, value: jest.fn().mockResolvedValue(registration) },
    })
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: serviceWorker })

    const enqueueSnackbar = jest.fn()
    mockUseSnackbar.mockReturnValue({
      closeSnackbar: jest.fn(),
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
