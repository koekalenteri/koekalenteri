import type { Language } from '../types'
import { useAtomValue, useSetAtom } from 'jotai'
import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router'
import { isRegistrationLanguageSettled, settleRegistrationLanguage } from '../lib/client/storage'
import { languageAtom } from '../pages/state/user/atoms'
import { isFromAdmin } from '../routeConfig'

/** A registration saved before the language field existed has none, and then the page keeps the stored one. */
interface RegistrationLanguage {
  readonly id: string
  readonly language?: Language
}

/**
 * Shows a registrant's page in the language of their registration, once per registration and tab
 * (KOE-1512). The first time the registration loads in a tab its language is switched to, unless the
 * page was opened from the admin side (`Path.registrationFromAdmin`), which keeps the secretary's
 * language; either way the decision is then settled, so a language picked from the menu afterwards
 * stays on the registration and payment pages, over a reload and the payment provider's return.
 *
 * The switch goes through `languageAtom`, so the texts, the event name, `<html lang>`, the language
 * menu and App's MUI and date locales all follow it together (KOE-1508). A layout effect, so the page
 * re-renders in the registration's language before the first paint instead of flashing the stored
 * one. A tab opened in the background cannot store the language (`atomWithStoredValue` writes only
 * from a visible tab), so there the switch is made again and settled once the tab is shown. Returns
 * the language the page is in.
 */
export const useRegistrationLanguage = (registration: RegistrationLanguage | null | undefined): Language => {
  const language = useAtomValue(languageAtom)
  const setLanguage = useSetAtom(languageAtom)
  const fromAdmin = isFromAdmin(useLocation().search)
  const registrationId = registration?.id
  const registrationLanguage = registration?.language

  useLayoutEffect(() => {
    if (!registrationId || !registrationLanguage || isRegistrationLanguageSettled(registrationId)) return
    if (fromAdmin) {
      settleRegistrationLanguage(registrationId)
      return
    }
    setLanguage(registrationLanguage)
    if (document.visibilityState === 'visible') {
      settleRegistrationLanguage(registrationId)
      return
    }
    const storeWhenShown = () => {
      if (document.visibilityState !== 'visible') return
      document.removeEventListener('visibilitychange', storeWhenShown)
      setLanguage(registrationLanguage)
      settleRegistrationLanguage(registrationId)
    }
    document.addEventListener('visibilitychange', storeWhenShown)
    return () => document.removeEventListener('visibilitychange', storeWhenShown)
  }, [fromAdmin, registrationId, registrationLanguage, setLanguage])

  return language
}
