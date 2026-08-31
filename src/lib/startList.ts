import type { TFunction } from 'i18next'
import type { PublicConfirmedEvent } from '../types/Event'
import type { PublicRegistration } from '../types/Registration'
import { zonedDateString } from '../i18n/dates'
import { formatDogName } from './dog'

export function startListSpreadsheetRows(
  participants: PublicRegistration[],
  event: PublicConfirmedEvent,
  t: TFunction
) {
  return [
    [
      t('startListExport.date'),
      t('startListExport.time'),
      t('startListExport.class'),
      t('startListExport.number'),
      t('startListExport.dog'),
      t('startListExport.registrationNumber'),
      t('startListExport.dateOfBirth'),
      t('startListExport.sire'),
      t('startListExport.dam'),
      t('startListExport.owner'),
      t('startListExport.handler'),
      t('startListExport.breeder'),
      t('startListExport.result'),
    ],
    ...participants.map((registration) => [
      spreadsheetDate(registration.group.date ?? event.startDate),
      registration.group.time ? t(`registration.timeLong.${registration.group.time}`) : '',
      registration.class ?? '',
      registration.group.number,
      [registration.dog.titles, registration.dog.name].filter(Boolean).join(' '),
      registration.dog.regNo,
      registration.dog.dob ? spreadsheetDate(registration.dog.dob) : '',
      formatDogName(registration.dog.sire),
      formatDogName(registration.dog.dam),
      registration.owner,
      registration.ownerHandles ? registration.owner : registration.handler,
      registration.breeder,
      registration.result ?? '',
    ]),
  ]
}

function spreadsheetDate(date: Date): Date {
  const [year, month, day] = zonedDateString(date).split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}
