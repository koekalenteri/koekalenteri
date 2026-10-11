import type { Language } from '@/types'
import i18n from 'i18next'
import { afterEach, beforeEach, describe, vi } from 'vitest'

/**
 * Switches the page to the language the way the app's language menu does: i18next, which every
 * label reads, and the document's `lang`. A fresh atom store reads `languageAtom` from i18next too,
 * so a component that formats by the atom agrees with its labels. The MUI and date-fns locales are
 * the frame's to pass (`muiLocales[language]` and `locales[language]`, as App.tsx does).
 */
export const switchLanguage = async (language: Language): Promise<void> => {
  document.documentElement.lang = language
  await i18n.changeLanguage(language)
}

/**
 * The tests inside see the view in `language`; the file's other tests keep their Finnish references.
 *
 * The guide's English page shows a picture's `-en` variant, taken by the same test in English, and
 * `npm run check-docs` refuses an English page whose picture has none (KOE-1437).
 */
export const describeInLanguage = (language: Language, tests: () => void): void => {
  describe(`in ${language}`, () => {
    beforeEach(() => switchLanguage(language))
    afterEach(() => switchLanguage('fi'))
    tests()
  })
}

/**
 * A `vi.mock('react-i18next', …)` factory whose `useTranslation` is a spy around the one the project
 * gives (keys only in the frontend project), so `describeWithTranslations` can switch it to the
 * app's real text. vi.mock is hoisted above imports, so the file reaches this through a dynamic import:
 *
 * ```ts
 * vi.mock('react-i18next', async (importOriginal) =>
 *   (await import('@/test-utils/language')).spyOnUseTranslation(importOriginal)
 * )
 * ```
 */
export const spyOnUseTranslation = async (importOriginal: () => Promise<typeof import('react-i18next')>) => {
  const original = await importOriginal()
  return { ...original, useTranslation: vi.fn(original.useTranslation) }
}

/**
 * The tests inside see the view in `language` with the app's real text, where the file's other tests
 * read keys: the page switches to `language` as `describeInLanguage` does, and `useTranslation` gives
 * that language's `t`. Needs the file to mock react-i18next with `spyOnUseTranslation`. The module is
 * read when a test starts, not imported here: that mock's factory imports this file, and a static
 * import of the module it is still building would wait on itself.
 */
export const describeWithTranslations = (language: Language, tests: () => void): void => {
  describe(`in ${language}, with the app's text`, () => {
    const spiedUseTranslation = async () => vi.mocked((await import('react-i18next')).useTranslation)
    beforeEach(async () => {
      await switchLanguage(language)
      const useTranslation = await spiedUseTranslation()
      useTranslation.mockImplementation(() => {
        const t = i18n.getFixedT(language)
        const response: [typeof t, typeof i18n, boolean] = [t, i18n, true]
        return Object.assign(response, { i18n, ready: true, t })
      })
    })
    // Back to the factory's own useTranslation, whatever the test queued on it.
    afterEach(async () => {
      const useTranslation = await spiedUseTranslation()
      useTranslation.mockReset()
      await switchLanguage('fi')
    })
    tests()
  })
}
