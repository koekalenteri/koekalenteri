import { TransProps } from 'react-i18next'
import { DefaultNamespace } from 'react-i18next/TransWithoutContext'
import { KeyPrefix, Namespace, TFuncKey, ThirdPartyModule } from 'i18next'

export const useTranslation = () => {
  return {
    t: (str: string, { date }: { date?: Date } = {}) => {
      switch (str) {
        // Values for translations that can not be just the key for tests
        case 'dateFormat.long':
          return 'dd.MM.yyyy'
        case 'dateFormat.short':
          return 'dd.MM.'
        case 'dateFormat.wdshort':
          return 'eeeeee d.M.'
        case 'dateFormat.weekday':
          return 'eeeeee'

        case 'dateFormatString.long':
          return 'dd.MM.yyyy'
        case 'dateFormatString.short':
          return 'dd.MM.'
        case 'datemask':
          return '__.__.____'
        default:
          return str
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

export function Trans<
  K extends TFuncKey<N, TKPrefix> extends infer A ? A : never,
  N extends Namespace = DefaultNamespace,
  TKPrefix extends KeyPrefix<N> = undefined,
  E = React.HTMLProps<HTMLDivElement>
>(props: TransProps<K, N, TKPrefix, E>) {
  return <>{props.children}</>
}
