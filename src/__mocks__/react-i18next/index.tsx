import type { ThirdPartyModule } from 'i18next'
import type { ReactNode } from 'react'

export const useTranslation = () => {
  return {
    t: (str: string, opts: any = {}) => {
      switch (str) {
        // Values for translations that can not be just the key for tests
        case 'dateFormat.long':
          return 'dd.MM.yyyy'
        case 'dateFormat.short':
          return 'dd.MM.'
        case 'dateFormat.wdshort':
          return 'eee d.M.'
        case 'dateFormat.weekday':
          return 'eee'

        case 'dateFormatString.long':
          return 'dd.MM.yyyy'
        case 'dateFormatString.short':
          return 'dd.MM.'
        case 'datemask':
          return '__.__.____'
        default:
          return `${str}${opts && Object.keys(opts).length ? ' ' + Object.keys(opts).join(', ') : ''}`
      }
    },
    i18n: {
      language: 'fi',
      changeLanguage: () => new Promise(() => {}),
    },
  }
}

export const initReactI18next: ThirdPartyModule = {
  type: '3rdParty',
  init() {},
}

export function Trans(props: { readonly children: ReactNode }) {
  return <>{props.children}</>
}
