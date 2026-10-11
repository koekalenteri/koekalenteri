import type { Language } from '../types'
import { useAtom } from 'jotai'
import { useLayoutEffect } from 'react'
import { languageAtom } from '../pages/state/user/atoms'

/**
 * Shows a registrant's page in the language of their registration. The switch goes through
 * `languageAtom`, so the texts, the event name, `<html lang>`, the language menu and App's MUI and
 * date locales all follow it together (KOE-1508). A layout effect, so the page re-renders in the
 * registration's language before the first paint instead of flashing the stored one. Returns the
 * language the page is in.
 */
export const useRegistrationLanguage = (registrationLanguage: Language | undefined): Language => {
  const [language, setLanguage] = useAtom(languageAtom)

  useLayoutEffect(() => {
    if (registrationLanguage && registrationLanguage !== language) setLanguage(registrationLanguage)
  }, [language, registrationLanguage, setLanguage])

  return language
}
