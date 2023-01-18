import { ThirdPartyModule } from "i18next"

export const useTranslation = () => {
  return {
    t: (str: string) => {
      switch(str) {
        case 'dateFormat.long': return 'dd.MM.yyyy'
        case 'dateFormat.short': return 'dd.MM.'
        case 'dateFormat.wdshort': return 'wd d.M.'
        case 'dateFormat.weekday': return 'weekday'
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
