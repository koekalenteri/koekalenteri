import type { i18n as I18n } from 'i18next'
import { languageStorageKey } from '../lib/client/storage'

/**
 * Initializes a fresh i18next the way the client entry does, with `stored` (raw, as localStorage
 * holds it) in place before the module runs. The setup file has already initialized the shared
 * instance, so the module registry is reset to give this one its own.
 */
const bootWith = async (stored: string | null): Promise<I18n> => {
  if (stored === null) localStorage.removeItem(languageStorageKey)
  else localStorage.setItem(languageStorageKey, stored)
  vi.resetModules()
  const { default: i18n } = await import('i18next')
  await import('./index')
  return i18n
}

describe('client i18n initialization', () => {
  afterEach(() => {
    localStorage.clear()
  })

  // A component's mount effect runs before App's, which realigns i18next with the stored choice, so
  // whatever it translates there must already be in the reader's language (KOE-1457).
  it('boots in the stored language, before any component renders', async () => {
    const i18n = await bootWith(JSON.stringify('en'))

    expect(i18n.language).toBe('en')
    expect(i18n.t('app.updated', { from: '1.10.2', to: '1.10.3' })).toBe('App updated: 1.10.2 → 1.10.3')
  })

  it.each([
    { name: 'nothing stored', stored: null },
    { name: 'Finnish stored', stored: JSON.stringify('fi') },
    { name: 'an unknown language', stored: JSON.stringify('sv') },
    { name: 'unreadable JSON', stored: '{' },
  ])('boots in Finnish with $name', async ({ stored }) => {
    const i18n = await bootWith(stored)

    expect(i18n.language).toBe('fi')
    expect(i18n.t('app.updated', { from: '1.10.2', to: '1.10.3' })).toBe('Sovellus päivitetty: 1.10.2 → 1.10.3')
  })
})
