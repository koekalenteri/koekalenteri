import type { Language } from '@/types'
import i18n from 'i18next'
import { afterEach, beforeEach, describe } from 'vitest'

/**
 * Switches the page to the language the way the app's language menu does: i18next, which every
 * label reads, and the document's `lang`. A fresh atom store reads `languageAtom` from i18next too,
 * so a component that formats by the atom agrees with its labels. The MUI and date-fns locales are
 * the frame's to pass (`muiLocales[language]` and `locales[language]`, as App.tsx does).
 */
const switchLanguage = async (language: Language): Promise<void> => {
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
