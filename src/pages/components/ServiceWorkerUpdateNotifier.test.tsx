import { render } from '@testing-library/react'
import { useSnackbar } from 'notistack'
import { useTranslation } from 'react-i18next'
import {
  activateServiceWorkerUpdate,
  consumeServiceWorkerUpdated,
  subscribeToServiceWorkerUpdates,
} from '../../serviceWorkerRegistration'
import ServiceWorkerUpdateNotifier from './ServiceWorkerUpdateNotifier'

jest.mock('notistack', () => ({
  useSnackbar: jest.fn(),
}))
jest.mock('react-i18next', () => ({
  useTranslation: jest.fn(),
}))
jest.mock('../../serviceWorkerRegistration', () => ({
  activateServiceWorkerUpdate: jest.fn(),
  consumeServiceWorkerUpdated: jest.fn(),
  subscribeToServiceWorkerUpdates: jest.fn(),
}))

const mockUseSnackbar = useSnackbar as jest.MockedFunction<typeof useSnackbar>
const mockUseTranslation = useTranslation as jest.MockedFunction<typeof useTranslation>
const mockActivateUpdate = activateServiceWorkerUpdate as jest.MockedFunction<typeof activateServiceWorkerUpdate>
const mockConsumeUpdated = consumeServiceWorkerUpdated as jest.MockedFunction<typeof consumeServiceWorkerUpdated>
const mockSubscribe = subscribeToServiceWorkerUpdates as jest.MockedFunction<typeof subscribeToServiceWorkerUpdates>

describe('ServiceWorkerUpdateNotifier', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockConsumeUpdated.mockReturnValue(undefined)
  })

  it('activates only once for the same waiting worker when the translation changes', () => {
    const enqueueSnackbar = jest.fn()
    const registration = {} as ServiceWorkerRegistration
    const worker = {} as ServiceWorker
    let translate = (key: string) => `fi:${key}`

    mockUseSnackbar.mockReturnValue({ closeSnackbar: jest.fn(), enqueueSnackbar })
    mockUseTranslation.mockImplementation(
      () =>
        ({
          t: translate,
        }) as ReturnType<typeof useTranslation>
    )
    mockSubscribe.mockImplementation((listener) => {
      listener(registration, worker)
      return jest.fn()
    })

    const { rerender } = render(<ServiceWorkerUpdateNotifier />)

    translate = (key: string) => `en:${key}`
    rerender(<ServiceWorkerUpdateNotifier />)

    expect(mockSubscribe).toHaveBeenCalledTimes(2)
    expect(mockActivateUpdate).toHaveBeenCalledTimes(1)
    expect(mockActivateUpdate).toHaveBeenCalledWith(registration, worker)
    expect(enqueueSnackbar).not.toHaveBeenCalled()
  })

  it('activates successive workers on the same registration', () => {
    const enqueueSnackbar = jest.fn()
    const registration = {} as ServiceWorkerRegistration
    const firstWorker = {} as ServiceWorker
    const secondWorker = {} as ServiceWorker

    mockUseSnackbar.mockReturnValue({ closeSnackbar: jest.fn(), enqueueSnackbar })
    mockUseTranslation.mockReturnValue({ t: (key: string) => key } as ReturnType<typeof useTranslation>)
    mockSubscribe.mockImplementation((listener) => {
      listener(registration, firstWorker)
      listener(registration, secondWorker)
      return jest.fn()
    })

    render(<ServiceWorkerUpdateNotifier />)

    expect(mockActivateUpdate).toHaveBeenCalledTimes(2)
  })

  it('notifies after an update has been applied', () => {
    const enqueueSnackbar = jest.fn()
    mockConsumeUpdated.mockReturnValue({ from: '1.10.2', to: '1.10.3' })
    mockUseSnackbar.mockReturnValue({ closeSnackbar: jest.fn(), enqueueSnackbar })
    mockUseTranslation.mockReturnValue({
      t: (key: string, options?: Record<string, string>) => `${key}:${options?.from}→${options?.to}`,
    } as ReturnType<typeof useTranslation>)
    mockSubscribe.mockReturnValue(jest.fn())

    render(<ServiceWorkerUpdateNotifier />)

    expect(enqueueSnackbar).toHaveBeenCalledWith('app.updated:1.10.2→1.10.3', { variant: 'success' })
  })
})
