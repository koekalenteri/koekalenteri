import type { JsonConfirmedEvent, JsonRegistration } from '../../types'

import { i18n } from '../../i18n'

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

  const eventDate = t('daterange', { start: confirmedEvent.startDate, end: confirmedEvent.endDate })
  const reserveText = t(`registration.reserveChoises.${registration.reserve || 'ANY'}`)
  const dogBreed = registration.dog.breedCode ? t(`${registration.dog.breedCode}`, { ns: 'breed' }) : '?'
  const regDates = registration.dates
    .map((d) => t('dateFormat.short', { date: d.date }) + (d.time ? ' ' + t(`registration.time.${d.time}`) : ''))
    .join(', ')
  const link = `${origin}/r/${registration.eventId}/${registration.id}`
  const qualifyingResults = registration.qualifyingResults.map((r) => ({
    ...r,
    date: t('dateFormat.date', { date: r.date }),
  }))
  const groupDate = registration.group?.date ? t('dateFormat.wdshort', { date: registration.group.date }) : ''
  const groupTime = registration.group?.time ? t(`registration.timeLong.${registration.group.time}`) : ''
  const invitationLink = confirmedEvent.invitationAttachment
    ? `${origin}/r/${registration.eventId}/${registration.id}/invitation`
    : ''

  // Friendly name for secretary (and official) (KOE-350)
  confirmedEvent.secretary.name = reverseName(confirmedEvent.secretary.name)
  confirmedEvent.official.name = reverseName(confirmedEvent.official.name)

  return {
    subject: t('registration.email.subject', '', { context }),
    title: t('registration.email.title', '', { context }),
    dogBreed,
    link,
    event: confirmedEvent,
    eventDate,
    invitationLink,
    qualifyingResults,
    reg: registration,
    regDates,
    reserveText,
    groupDate,
    groupTime,
  }
}
