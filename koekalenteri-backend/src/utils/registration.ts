import { JsonConfirmedEvent, JsonRegistration } from 'koekalenteri-shared/model'

import { i18n } from '../i18n/index'

import { formatDate, formatDateSpan } from './dates'
import { reverseName } from './string'

export function emailTo(registration: JsonRegistration) {
  const to: string[] = [registration.handler.email]
  if (registration.owner.email !== registration.handler.email) {
    to.push(registration.owner.email)
  }
  return to
}

export function registrationEmailTemplateData(
  registration: JsonRegistration,
  confirmedEvent: JsonConfirmedEvent,
  origin: string | undefined,
  context: string
) {
  const t = i18n.getFixedT(registration.language)

  const eventDate = formatDateSpan(confirmedEvent.startDate, confirmedEvent.endDate)
  const reserveText = t(`registration.reserveChoises.${registration.reserve}`)
  const dogBreed = t(`breed:${registration.dog.breedCode}`)
  const regDates = registration.dates
    .map((d) => t('dateFormat.weekday', { date: d.date }) + (d.time ? ' ' + t(`registration.time.${d.time}`) : ''))
    .join(', ')
  const link = `${origin}/registration/${registration.eventType}/${registration.eventId}/${registration.id}`
  const qualifyingResults = registration.qualifyingResults.map((r) => ({
    ...r,
    date: formatDate(r.date, 'd.M.yyyy'),
  }))
  const groupDate = registration.group?.date ? t('dateFormat.wdshort', { date: registration.group.date }) : ''
  const groupTime = registration.group?.time ? t(`registration.time.${registration.group.time}`) : ''

  // Friendly name for secretary (and official) (KOE-350)
  confirmedEvent.secretary.name = reverseName(confirmedEvent.secretary.name)
  confirmedEvent.official.name = reverseName(confirmedEvent.official.name)

  return {
    subject: t('registration.email.subject', { context }),
    title: t('registration.email.title', { context }),
    dogBreed,
    link,
    event: confirmedEvent,
    eventDate,
    qualifyingResults,
    reg: registration,
    regDates,
    reserveText,
    groupDate,
    groupTime,
  }
}
