import type { JsonConfirmedEvent, JsonRegistration } from '../../types'

import { i18n } from '../../i18n/lambda'

export type RegistrationTemplateContext = '' | 'cancel' | 'confirm' | 'receipt' | 'update'

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
  context: RegistrationTemplateContext
) {
  const t = i18n.getFixedT(registration.language)

  const eventDate = t('dateFormat.datespan', { start: confirmedEvent.startDate, end: confirmedEvent.endDate })
  const reserveText = t(`registration.reserveChoises.${registration.reserve || 'ANY'}`)
  const dogBreed = registration.dog.breedCode ? t(`${registration.dog.breedCode}`, { ns: 'breed' }) : '?'
  const regDates = registration.dates
    .map((d) => t('dateFormat.short', { date: d.date }) + (d.time ? ' ' + t(`registration.time.${d.time}`) : ''))
    .join(', ')
  const link = `${origin}/r/${registration.eventId}/${registration.id}`
  const paymentLink = `${origin}/p/${registration.eventId}/${registration.id}`
  const qualifyingResults = registration.qualifyingResults.map((r) => ({
    ...r,
    date: t('dateFormat.date', { date: r.date }),
  }))
  const groupDate = registration.group?.date ? t('dateFormat.wdshort', { date: registration.group.date }) : ''
  const groupTime = registration.group?.time ? t(`registration.timeLong.${registration.group.time}`) : ''
  const invitationLink = `${origin}/r/${registration.eventId}/${registration.id}/invitation`

  return {
    subject: t('registration.email.subject', { context, defaultValue: '' }),
    title: t('registration.email.title', { context, defaultValue: '' }),
    dogBreed,
    link,
    paymentLink,
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
