import i18n from 'i18next'

import { i18nInit } from './config'
import { registerFormatters } from './formatters'

export { i18n }

i18n.init(i18nInit).catch((reason) => console.error(reason))

//  additional formats
registerFormatters(i18n)
