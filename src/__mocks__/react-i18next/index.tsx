import type { ThirdPartyModule } from 'i18next'
import type { ReactNode } from 'react'

export const useTranslation = () => {
  return {
    i18n: {
      changeLanguage: () => new Promise(() => {}),
      language: 'fi',
    },
    t: (str: string, opts: Record<string, unknown> = {}) => {
      switch (str) {
        // Values for translations that can not be just the key for tests
        case 'dateFormat.long':
          return 'dd.MM.yyyy'
        case 'dateFormat.short':
          return 'dd.MM.'
        case 'dateFormat.wdshort2':
          return 'eeeeee d.M.'
        case 'dateFormat.wdshort3':
          return 'eee d.M.'
        case 'dateFormat.weekday2':
          return 'eeeeee'
        case 'dateFormat.weekday3':
          return 'eee'

        case 'dateFormatString.long':
          return 'dd.MM.yyyy'
        case 'dateFormatString.short':
          return 'dd.MM.'
        case 'datemask':
          return '__.__.____'
        default:
          return `${str}${opts && Object.keys(opts).length ? ` ${Object.keys(opts).join(', ')}` : ''}`
      }
    },
  }
}

export const initReactI18next: ThirdPartyModule = {
  init() {},
  type: '3rdParty',
}

export function Trans(props: { readonly children: ReactNode }) {
  return <>{props.children}</>
}
