import { TransProps } from 'react-i18next'
import { DefaultNamespace } from 'react-i18next/TransWithoutContext'
import { format } from 'date-fns'
import { fi } from 'date-fns/locale'
import { KeyPrefix, Namespace, TFuncKey, ThirdPartyModule } from 'i18next'

const formatDate = (date: Date | undefined, fmt: string) => (date ? format(date, fmt, { locale: fi }) : fmt)

export const useTranslation = () => {
  return {
    t: (str: string, { date }: { date?: Date } = {}) => {
      switch (str) {
        case 'dateFormat.long':
          return formatDate(date, 'dd.MM.yyyy')
        case 'dateFormat.short':
          return formatDate(date, 'dd.MM.')
        case 'dateFormat.wdshort':
          return formatDate(date, 'eeeeee d.M.')
        case 'dateFormat.weekday':
          return formatDate(date, 'eeeeee')
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
