import type { TFunction } from 'i18next'
import type { PublicConfirmedEvent } from '../types/Event'
import type { PublicRegistration } from '../types/Registration'
import { zonedDateString } from '../i18n/dates'
import { formatDogName } from './dog'
import { formatResultMarks } from './results'

/**
 * The response header that carries a fetched start list's version: the server time taken just
 * before the rows were read, the same clock as the `version` of a live `public:start-list` message
 * (KOE-1516). A header rather than a field keeps the response body the plain array it has been.
 */
export const START_LIST_VERSION_HEADER = 'X-Start-List-Version'

/** The version a fetch's header carries; absent or unreadable is no version. */
export const parseStartListVersion = (value: string | null): number | undefined => {
  if (!value) return undefined
  const version = Number(value)
  return Number.isFinite(version) ? version : undefined
}

/**
 * Whether rows with version `incoming` may replace the rows on screen, which have version `shown`.
 * Live messages and fetches race each other, so the page keeps the highest version it has accepted.
 * Equal versions are accepted, so of two reads in the same millisecond the later arrival wins.
 *
 * Nothing versioned shown yet means anything goes, versionless included: a backend deployed before
 * versions sends none. Once a version has been accepted, a versionless one is no longer trusted.
 */
/** The version a start list response carries in its header, if any. */
export const startListVersionOf = (headers: Headers): number | undefined =>
  parseStartListVersion(headers.get(START_LIST_VERSION_HEADER))

export const isStartListUpToDate = (shown: number | undefined, incoming: number | undefined): boolean =>
  shown === undefined || (incoming !== undefined && incoming >= shown)

/** The newer of two versions, either of which may be missing. */
export const newestStartListVersion = (a: number | undefined, b: number | undefined): number | undefined => {
  if (a === undefined) return b
  if (b === undefined) return a
  return Math.max(a, b)
}

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
