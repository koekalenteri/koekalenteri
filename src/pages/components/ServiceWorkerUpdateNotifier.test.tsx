import type { ReactNode } from 'react'
import { act, render, screen } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import {
  activateServiceWorkerUpdate,
  consumeServiceWorkerUpdated,
  subscribeToServiceWorkerUpdates,
} from '../../serviceWorkerRegistration'
import AppSnackbarProvider from './AppSnackbarProvider'
import ServiceWorkerUpdateNotifier from './ServiceWorkerUpdateNotifier'

vi.mock('react-i18next', () => ({
  useTranslation: vi.fn(),
}))
vi.mock('../../serviceWorkerRegistration', () => ({
  activateServiceWorkerUpdate: vi.fn(),
  consumeServiceWorkerUpdated: vi.fn(),
  subscribeToServiceWorkerUpdates: vi.fn(),
}))

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

type Translate = (key: string, options?: Record<string, string>) => string

/**
 * The translation `useTranslation()` hands out. Switching it re-renders every component that took
 * one, as react-i18next does on i18next's `languageChanged`.
 */
let translate: Translate = (key) => key
const languageListeners = new Set<() => void>()
const subscribeToLanguage = (listener: () => void) => {
  languageListeners.add(listener)
  return () => languageListeners.delete(listener)
}
const switchLanguage = (next: Translate) => {
  translate = next
  for (const listener of languageListeners) listener()
}
const useMockTranslation = () => ({ t: useSyncExternalStore(subscribeToLanguage, () => translate) })

const Providers = ({ children }: { readonly children: ReactNode }) => (
  <AppSnackbarProvider autoHideDuration={null}>{children}</AppSnackbarProvider>
)

const renderNotifier = () => render(<ServiceWorkerUpdateNotifier />, { wrapper: Providers })

describe('ServiceWorkerUpdateNotifier', () => {
  beforeEach(() => {
    // The real one is one-shot: it removes the stored change as it reads it, so a test hands the
    // change out once and every later call finds nothing.
    mockConsumeUpdated.mockReturnValue(undefined)
    mockSubscribe.mockReturnValue(vi.fn())
    switchLanguage((key) => key)
    mockUseTranslation.mockImplementation(() => useMockTranslation() as ReturnType<typeof useTranslation>)
  })

  it('activates only once when the same waiting worker is reported again', () => {
    const registration = {} as ServiceWorkerRegistration
    const worker = {} as ServiceWorker
    mockSubscribe.mockImplementation((listener) => {
      listener(registration, worker)
      listener(registration, worker)
      return vi.fn()
    })

    renderNotifier()

    expect(mockActivateUpdate).toHaveBeenCalledTimes(1)
    expect(mockActivateUpdate).toHaveBeenCalledWith(registration, worker)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('activates successive workers on the same registration', () => {
    const registration = {} as ServiceWorkerRegistration
    const firstWorker = {} as ServiceWorker
    const secondWorker = {} as ServiceWorker
    mockSubscribe.mockImplementation((listener) => {
      listener(registration, firstWorker)
      listener(registration, secondWorker)
      return vi.fn()
    })

    renderNotifier()

    expect(mockActivateUpdate).toHaveBeenCalledTimes(2)
  })

  it('notifies after an update has been applied', async () => {
    mockConsumeUpdated.mockReturnValueOnce({ from: '1.10.2', to: '1.10.3' })
    switchLanguage((key, options) => `${key}:${options?.from}→${options?.to}`)

    renderNotifier()

    expect(await screen.findByText('app.updated:1.10.2→1.10.3')).toBeInTheDocument()
  })

  // The notice stays on screen while the reader may switch the language, so its text is translated
  // when it renders, not when it is enqueued (KOE-1457).
  it.each([
    { key: 'app.updated', name: 'version change', versionChange: { from: '1.10.2', to: '1.10.3' } },
    { key: 'app.updatedBuild', name: 'build time', versionChange: { from: '1.10.3', to: '1.10.3' } },
  ])('shows the $name notice in the language switched to after it was enqueued', async ({ versionChange, key }) => {
    mockConsumeUpdated.mockReturnValueOnce(versionChange)
    switchLanguage((k) => `fi:${k}`)

    renderNotifier()
    expect(await screen.findByText(`fi:${key}`)).toBeInTheDocument()

    act(() => switchLanguage((k) => `en:${k}`))

    expect(await screen.findByText(`en:${key}`)).toBeInTheDocument()
    expect(screen.queryByText(`fi:${key}`)).not.toBeInTheDocument()
  })

  // The notice is the one moment a reader is told the application changed, so it has to lead
  // straight to what changed (KOE-1398).
  it('links the notice to the new version’s release notes', async () => {
    mockConsumeUpdated.mockReturnValueOnce({ from: '1.10.2', to: '1.10.3' })

    renderNotifier()

    expect(await screen.findByRole('link', { name: 'app.whatsNew' })).toHaveAttribute('href', '/whats-new#1.10.3')
  })

  it('reports the build time when the version number did not change', async () => {
    mockConsumeUpdated.mockReturnValueOnce({ from: '1.10.3', to: '1.10.3' })
    switchLanguage((key, options) => `${key}:${options?.to}:${options?.date} ${options?.time}`)

    renderNotifier()

    // The formatted build time follows the runner's timezone, so only its shape is asserted.
    expect(await screen.findByText(/^app\.updatedBuild:1\.10\.3:\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/)).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
