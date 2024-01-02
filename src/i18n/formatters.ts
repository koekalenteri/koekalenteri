import type { i18n } from 'i18next'

import { formatDateSpan, formatDistance, getDateFormatter } from './dates'

export const registerFormatters = (i18n: i18n) => {
  i18n.services.formatter?.add('dtshort', getDateFormatter('eeeeee d.M. HH:mm'))
  i18n.services.formatter?.add('wdshort', getDateFormatter('eeeeee d.M.'))
  i18n.services.formatter?.add('weekday', getDateFormatter('eeeeee'))
  i18n.services.formatter?.add('short', getDateFormatter('dd.MM.'))
  i18n.services.formatter?.add('datespan', formatDateSpan)
  i18n.services.formatter?.add('distance', formatDistance)
  i18n.services.formatter?.add('lowercase', (value) => value.toLowerCase())
  i18n.services.formatter?.add('date', getDateFormatter('d.M.yyyy'))
  i18n.services.formatter?.add('isodate', getDateFormatter('dd.MM.yyyy'))
  i18n.services.formatter?.add('long', getDateFormatter('dd.MM.yyyy HH:mm'))
}
