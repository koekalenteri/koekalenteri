import { render } from '@testing-library/react'
import { useSnackbar } from 'notistack'
import { useTranslation } from 'react-i18next'
import {
  activateServiceWorkerUpdate,
  consumeServiceWorkerUpdated,
  subscribeToServiceWorkerUpdates,
} from '../../serviceWorkerRegistration'
import ServiceWorkerUpdateNotifier from './ServiceWorkerUpdateNotifier'

vi.mock('notistack', () => ({
  useSnackbar: vi.fn(),
}))
vi.mock('react-i18next', () => ({
  useTranslation: vi.fn(),
}))
vi.mock('../../serviceWorkerRegistration', () => ({
  activateServiceWorkerUpdate: vi.fn(),
  consumeServiceWorkerUpdated: vi.fn(),
  subscribeToServiceWorkerUpdates: vi.fn(),
}))

const mockUseSnackbar = useSnackbar as import('vitest').MockedFunction<typeof useSnackbar>
const mockUseTranslation = useTranslation as import('vitest').MockedFunction<typeof useTranslation>
const mockActivateUpdate = activateServiceWorkerUpdate as import('vitest').MockedFunction<
  typeof activateServiceWorkerUpdate
>
const mockConsumeUpdated = consumeServiceWorkerUpdated as import('vitest').MockedFunction<
  typeof consumeServiceWorkerUpdated
>
const mockSubscribe = subscribeToServiceWorkerUpdates as import('vitest').MockedFunction<
  typeof subscribeToServiceWorkerUpdates
>

describe('ServiceWorkerUpdateNotifier', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConsumeUpdated.mockReturnValue(undefined)
  })

  it('activates only once for the same waiting worker when the translation changes', () => {
    const enqueueSnackbar = vi.fn()
    const registration = {} as ServiceWorkerRegistration
    const worker = {} as ServiceWorker
    let translate = (key: string) => `fi:${key}`

    mockUseSnackbar.mockReturnValue({ closeSnackbar: vi.fn(), enqueueSnackbar })
    mockUseTranslation.mockImplementation(() => ({ t: translate }) as ReturnType<typeof useTranslation>)
    mockSubscribe.mockImplementation((listener) => {
      listener(registration, worker)
      return vi.fn()
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
    const enqueueSnackbar = vi.fn()
    const registration = {} as ServiceWorkerRegistration
    const firstWorker = {} as ServiceWorker
    const secondWorker = {} as ServiceWorker

    mockUseSnackbar.mockReturnValue({ closeSnackbar: vi.fn(), enqueueSnackbar })
    mockUseTranslation.mockReturnValue({ t: (key: string) => key } as ReturnType<typeof useTranslation>)
    mockSubscribe.mockImplementation((listener) => {
      listener(registration, firstWorker)
      listener(registration, secondWorker)
      return vi.fn()
    })

    render(<ServiceWorkerUpdateNotifier />)

    expect(mockActivateUpdate).toHaveBeenCalledTimes(2)
  })

  it('notifies after an update has been applied', () => {
    const enqueueSnackbar = vi.fn()
    mockConsumeUpdated.mockReturnValue({ from: '1.10.2', to: '1.10.3' })
    mockUseSnackbar.mockReturnValue({ closeSnackbar: vi.fn(), enqueueSnackbar })
    mockUseTranslation.mockReturnValue({
      t: (key: string, options?: Record<string, string>) => `${key}:${options?.from}→${options?.to}`,
    } as ReturnType<typeof useTranslation>)
    mockSubscribe.mockReturnValue(vi.fn())

    render(<ServiceWorkerUpdateNotifier />)

    expect(enqueueSnackbar).toHaveBeenCalledWith('app.updated:1.10.2→1.10.3', { variant: 'success' })
  })

  it('reports the build time when the version number did not change', () => {
    const enqueueSnackbar = vi.fn()
    mockConsumeUpdated.mockReturnValue({ buildTime: 0, from: '1.10.3', to: '1.10.3' })
    mockUseSnackbar.mockReturnValue({ closeSnackbar: vi.fn(), enqueueSnackbar })
    mockUseTranslation.mockReturnValue({
      t: (key: string, options?: Record<string, string>) => `${key}:${options?.to}:${options?.date} ${options?.time}`,
    } as ReturnType<typeof useTranslation>)
    mockSubscribe.mockReturnValue(vi.fn())

    render(<ServiceWorkerUpdateNotifier />)

    // The formatted build time follows the runner's timezone, so only its shape is asserted.
    expect(enqueueSnackbar).toHaveBeenCalledWith(
      expect.stringMatching(/^app\.updatedBuild:1\.10\.3:\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/),
      { variant: 'success' }
    )
  })

  it('reports the version change when the build time is unknown', () => {
    const enqueueSnackbar = vi.fn()
    mockConsumeUpdated.mockReturnValue({ from: '1.10.3', to: '1.10.3' })
    mockUseSnackbar.mockReturnValue({ closeSnackbar: vi.fn(), enqueueSnackbar })
    mockUseTranslation.mockReturnValue({
      t: (key: string, options?: Record<string, string>) => `${key}:${options?.from}→${options?.to}`,
    } as ReturnType<typeof useTranslation>)
    mockSubscribe.mockReturnValue(vi.fn())

    render(<ServiceWorkerUpdateNotifier />)

    expect(enqueueSnackbar).toHaveBeenCalledWith('app.updated:1.10.3→1.10.3', { variant: 'success' })
  })
})
