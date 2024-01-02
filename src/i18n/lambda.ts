import type { Language } from '../types'
import type { fi } from './locales'

import i18n from 'i18next'

import { i18nInit } from './config'
import { locales } from './dates'
import { registerFormatters } from './formatters'

export { locales }
export { i18n }
export type { Language }
export type ValidationErrorKey = typeof fi.validation

i18n.init(i18nInit).catch((reason) => console.error(reason))

//  additional formats
registerFormatters(i18n)
