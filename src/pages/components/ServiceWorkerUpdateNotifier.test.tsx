import { render } from '@testing-library/react'
import { useSnackbar } from 'notistack'
import { useTranslation } from 'react-i18next'
import { subscribeToServiceWorkerUpdates } from '../../serviceWorkerRegistration'
import ServiceWorkerUpdateNotifier from './ServiceWorkerUpdateNotifier'

jest.mock('notistack', () => ({
  useSnackbar: jest.fn(),
}))
jest.mock('react-i18next', () => ({
  useTranslation: jest.fn(),
}))
jest.mock('../../serviceWorkerRegistration', () => ({
  activateServiceWorkerUpdate: jest.fn(),
  subscribeToServiceWorkerUpdates: jest.fn(),
}))

const mockUseSnackbar = useSnackbar as jest.MockedFunction<typeof useSnackbar>
const mockUseTranslation = useTranslation as jest.MockedFunction<typeof useTranslation>
const mockSubscribe = subscribeToServiceWorkerUpdates as jest.MockedFunction<typeof subscribeToServiceWorkerUpdates>

describe('ServiceWorkerUpdateNotifier', () => {
  it('notifies only once for the same waiting worker when the translation changes', () => {
    const enqueueSnackbar = jest.fn()
    const registration = {} as ServiceWorkerRegistration
    const worker = {} as ServiceWorker
    let translate = (key: string) => `fi:${key}`

    mockUseSnackbar.mockReturnValue({ closeSnackbar: jest.fn(), enqueueSnackbar })
    mockUseTranslation.mockImplementation(() => ({ t: translate }) as ReturnType<typeof useTranslation>)
    mockSubscribe.mockImplementation((listener) => {
      listener(registration, worker)
      return jest.fn()
    })

    const { rerender } = render(<ServiceWorkerUpdateNotifier />)

    translate = (key: string) => `en:${key}`
    rerender(<ServiceWorkerUpdateNotifier />)

    expect(mockSubscribe).toHaveBeenCalledTimes(2)
    expect(enqueueSnackbar).toHaveBeenCalledTimes(1)
    expect(enqueueSnackbar).toHaveBeenCalledWith('fi:app.updateAvailable', expect.any(Object))
  })

  it('notifies for successive workers on the same registration', () => {
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

    expect(enqueueSnackbar).toHaveBeenCalledTimes(2)
  })
})
