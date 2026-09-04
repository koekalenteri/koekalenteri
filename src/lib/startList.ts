import type { TFunction } from 'i18next'
import type { PublicConfirmedEvent } from '../types/Event'
import type { PublicRegistration } from '../types/Registration'
import { zonedDateString } from '../i18n/dates'
import { formatDogName } from './dog'
import { formatResultMarks } from './results'

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
      t('startListExport.marks'),
    ],
    ...participants.map((registration) =>
      // A cancelled row carries its frozen number and the mark, nothing else (KOE-1017).
      registration.cancelled
        ? [
            spreadsheetDate(registration.group.date ?? event.startDate),
            registration.group.time ? t(`registration.timeLong.${registration.group.time}`) : '',
            registration.class ?? '',
            registration.group.number ?? '',
            t('startList.absent'),
            ...Array.from({ length: 9 }, () => ''),
          ]
        : [
            spreadsheetDate(registration.group.date ?? event.startDate),
            registration.group.time ? t(`registration.timeLong.${registration.group.time}`) : '',
            registration.class ?? '',
            registration.group.number ?? '',
            [registration.dog.titles, registration.dog.name].filter(Boolean).join(' '),
            registration.dog.regNo,
            registration.dog.dob ? spreadsheetDate(registration.dog.dob) : '',
            formatDogName(registration.dog.sire),
            formatDogName(registration.dog.dam),
            registration.owner,
            registration.ownerHandles ? registration.owner : registration.handler,
            registration.breeder,
            registration.result ?? '',
            // Koiranet keeps these apart from the result, and so does the sheet someone types into it.
            formatResultMarks(registration.marks, t),
          ]
    ),
  ]
}

function spreadsheetDate(date: Date): Date {
  const [year, month, day] = zonedDateString(date).split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}
