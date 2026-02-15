import i18n from 'i18next'
import { i18nInit } from './config'
import { registerFormatters } from './formatters'

export { default as i18n } from 'i18next'

i18n.init(i18nInit).catch((error_) => console.error(error_))

//  additional formats
registerFormatters(i18n)
