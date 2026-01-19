import i18n from 'i18next'

import { i18nInit } from './config'
import { registerFormatters } from './formatters'

export { i18n }

try {
  await i18n.init(i18nInit)
} catch (error) {
  console.error(error)
}

//  additional formats
registerFormatters(i18n)
