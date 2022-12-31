import { ThirdPartyModule } from "i18next"

export const useTranslation = () => {
  return {
    t: (str: string) => {
      switch(str) {
        case 'dateformat': return 'dd.MM.yyyy'
        case 'dateformatS': return 'dd.MM.'
        case 'datemask': return "__.__.____"
        default: return str
      }
    },
    i18n: {
      changeLanguage: () => new Promise(() => {}),
    },
  }
}

export const initReactI18next: ThirdPartyModule = {
  type: '3rdParty',
  init() {},
}
