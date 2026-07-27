import type { ConfirmedEvent, Registration, RegistrationClass } from '../types'
import { formatDate } from '../i18n/dates'

export type InvitationAttachmentItem = Pick<ConfirmedEvent | Registration, 'eventType' | 'invitationAttachment'> & {
  class?: RegistrationClass | null
  dates?: Array<{ date: Date | string }>
  startDate?: Date | string
}

export const invitationAttachmentFileName = (item: InvitationAttachmentItem): string => {
  const date = item.dates?.[0]?.date ?? item.startDate
  const parts = ['koekutsu', formatDate(date ?? '', 'yyyyMMdd'), item.eventType, item.class].filter(Boolean)

  return `${parts.join('-')}.pdf`
}

export const startListFileName = (item: Pick<ConfirmedEvent, 'eventType' | 'startDate'>): string => {
  const parts = ['starttilista', formatDate(item.startDate, 'yyyyMMdd'), item.eventType].filter(Boolean)

  return `${parts.join('-')}.xlsx`
}
