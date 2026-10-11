import type { ReactNode } from 'react'
import type { Language, Registration } from '../types'
import { act, renderHook } from '@testing-library/react'
import i18n from 'i18next'
import { createStore, Provider } from 'jotai'
import { MemoryRouter } from 'react-router'
import { languageStorageKey } from '../lib/client/storage'
import { languageAtom } from '../pages/state'
import { Path } from '../routeConfig'
import { useRegistrationLanguage } from './useRegistrationLanguage'

type RegistrationLanguage = Pick<Registration, 'eventId' | 'id'> & Partial<Pick<Registration, 'language'>>

const english: RegistrationLanguage = { eventId: 'event-1', id: 'registration-1', language: 'en' }

const storedLanguage = () => localStorage.getItem(languageStorageKey)

/** One page load of a registrant's page in a tab: the store and the tab's storage are shared between them. */
const renderPage = (
  store: ReturnType<typeof createStore>,
  registration: RegistrationLanguage | null | undefined,
  path = Path.registration(english)
) => {
  const wrapper = ({ children }: { readonly children: ReactNode }) => (
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
    </Provider>
  )
  return renderHook(() => useRegistrationLanguage(registration), { wrapper })
}

/** A store as App boots it: the stored language, Finnish here. */
const finnishStore = () => {
  localStorage.setItem(languageStorageKey, JSON.stringify('fi'))
  return createStore()
}

const pickFromMenu = (store: ReturnType<typeof createStore>, language: Language) =>
  act(() => store.set(languageAtom, language))

describe('useRegistrationLanguage', () => {
  afterEach(async () => {
    vi.restoreAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    document.documentElement.lang = 'fi'
    await i18n.changeLanguage('fi')
  })

  it('switches to the registration language when opened from a link, and stores it', () => {
    const store = finnishStore()

    const { result } = renderPage(store, english)

    expect(result.current).toBe('en')
    expect(i18n.language).toBe('en')
    expect(storedLanguage()).toBe(JSON.stringify('en'))
  })

  it('keeps a language picked from the menu afterwards', () => {
    const store = finnishStore()
    const { result } = renderPage(store, english)

    pickFromMenu(store, 'fi')

    expect(result.current).toBe('fi')
    expect(storedLanguage()).toBe(JSON.stringify('fi'))
  })

  it('keeps the picked language when the page is opened again in the tab', () => {
    const store = finnishStore()
    renderPage(store, english).unmount()
    pickFromMenu(store, 'fi')

    // The payment page and back, or a reload: a new mount, the same tab.
    const { result } = renderPage(store, english, Path.payment(english))

    expect(result.current).toBe('fi')
    expect(storedLanguage()).toBe(JSON.stringify('fi'))
  })

  it('keeps the language when opened from the admin side, also on the next page', () => {
    const store = finnishStore()

    renderPage(store, english, Path.registrationFromAdmin(english)).unmount()
    // An in-app move drops the mark from the URL; the decision was made on entry.
    const { result } = renderPage(store, english, Path.payment(english))

    expect(result.current).toBe('fi')
    expect(i18n.language).toBe('fi')
    expect(storedLanguage()).toBe(JSON.stringify('fi'))
  })

  it.each<[string, RegistrationLanguage | null | undefined]>([
    ['no registration yet', undefined],
    ['a registration that was not found', null],
    // A registration saved before the language field existed has none.
    ['a registration without a language', { eventId: 'event-1', id: 'registration-old' }],
  ])('leaves the language alone for %s', (_name, registration) => {
    const store = finnishStore()

    const { result } = renderPage(store, registration)

    expect(result.current).toBe('fi')
    expect(storedLanguage()).toBe(JSON.stringify('fi'))
  })

  it('switches again after sign-out, which forgets the tab decisions', () => {
    const store = finnishStore()
    renderPage(store, english).unmount()
    pickFromMenu(store, 'fi')

    // signOut clears the session storage (state/user/actions.ts), and with it what this tab decided.
    sessionStorage.clear()
    const { result } = renderPage(store, english)

    expect(result.current).toBe('en')
  })

  it('keeps the picked language across pages when the session storage cannot be written', () => {
    // Blocked site data: every touch of the session storage throws.
    const { getItem, setItem } = Storage.prototype
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key) {
      if (this === sessionStorage) throw new DOMException('blocked', 'SecurityError')
      return getItem.call(this, key)
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (this === sessionStorage) throw new DOMException('blocked', 'SecurityError')
      setItem.call(this, key, value)
    })
    const store = finnishStore()
    const registration = { ...english, id: 'registration-no-session-storage' }

    renderPage(store, registration).unmount()
    pickFromMenu(store, 'fi')
    const { result } = renderPage(store, registration, Path.payment(registration))

    expect(result.current).toBe('fi')
  })

  describe('in a tab opened in the background', () => {
    const showTab = () =>
      act(() => {
        vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
        document.dispatchEvent(new Event('visibilitychange'))
      })

    beforeEach(() => {
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    })

    it('shows the registration language, but switches again on reload until it could be stored', () => {
      const store = finnishStore()

      const { result, unmount } = renderPage(store, english)
      expect(result.current).toBe('en')
      // A hidden tab never writes to storage, so a reload would boot in Finnish.
      expect(storedLanguage()).toBe(JSON.stringify('fi'))
      unmount()

      const reloaded = renderPage(createStore(), english)
      expect(reloaded.result.current).toBe('en')
    })

    it('stores the language and settles once the tab is shown', () => {
      const store = finnishStore()
      renderPage(store, english)

      // A visibility change that leaves the tab hidden still cannot store anything.
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'))
      })
      expect(storedLanguage()).toBe(JSON.stringify('fi'))

      showTab()
      expect(storedLanguage()).toBe(JSON.stringify('en'))

      pickFromMenu(store, 'fi')
      const { result } = renderPage(store, english, Path.payment(english))
      expect(result.current).toBe('fi')
    })

    it('does nothing when shown after the page has gone', () => {
      const store = finnishStore()
      renderPage(store, english).unmount()

      showTab()

      expect(storedLanguage()).toBe(JSON.stringify('fi'))
    })
  })
})
