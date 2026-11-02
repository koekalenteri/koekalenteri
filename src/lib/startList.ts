import type { TFunction } from 'i18next'
import type { DayKey } from '../types/Day'
import type { PublicConfirmedEvent } from '../types/Event'
import type { PublicRegistration } from '../types/Registration'
import { dayParts } from './day'
import { formatDogName } from './dog'
import { formatResultMarks, shownTotals } from './results'

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

/** The version a start list response carries in its header, if any. */
export const startListVersionOf = (headers: Headers): number | undefined =>
  parseStartListVersion(headers.get(START_LIST_VERSION_HEADER))

/**
 * Whether rows with version `incoming` may replace the rows on screen, which have version `shown`.
 * Live messages and fetches race each other, so the page keeps the highest version it has accepted.
 * Equal versions are accepted, so of two reads in the same millisecond the later arrival wins.
 *
 * Nothing versioned shown yet means anything goes, versionless included: a backend deployed before
 * versions sends none. Once a version has been accepted, a versionless one is no longer trusted.
 */
export const isStartListUpToDate = (shown: number | undefined, incoming: number | undefined): boolean =>
  shown === undefined || (incoming !== undefined && incoming >= shown)

/** The newer of two versions, either of which may be missing. */
export const newestStartListVersion = (a: number | undefined, b: number | undefined): number | undefined => {
  if (a === undefined) return b
  if (b === undefined) return a
  return Math.max(a, b)
}

/**
 * The exported sheet's columns, each header with its width in characters. The header row and the
 * widths are both read from this list, so a column added to one is in the other (KOE-1673).
 */
const START_LIST_COLUMNS = [
  ['startListExport.date', 12],
  ['startListExport.time', 14],
  ['startListExport.class', 10],
  ['startListExport.number', 8],
  ['startListExport.dog', 28],
  ['startListExport.registrationNumber', 18],
  ['startListExport.dateOfBirth', 14],
  ['startListExport.sire', 24],
  ['startListExport.dam', 24],
  ['startListExport.owner', 24],
  ['startListExport.handler', 24],
  ['startListExport.breeder', 24],
  ['startListExport.result', 12],
  ['startListExport.points', 8],
  ['startListExport.maxPoints', 8],
  ['startListExport.percentage', 6],
  ['startListExport.marks', 16],
  ['results.column.placement', 8],
] as const

/** The widths of the exported sheet's columns, in the order of its header. */
export const startListColumnWidths: number[] = START_LIST_COLUMNS.map(([, width]) => width)

export function startListSpreadsheetRows(
  participants: PublicRegistration[],
  event: PublicConfirmedEvent,
  t: TFunction
) {
  return [
    START_LIST_COLUMNS.map(([key]) => t(key)),
    ...participants.map((registration) =>
      // A cancelled row carries its frozen number and the mark, nothing else (KOE-1017).
      registration.cancelled
        ? [
            spreadsheetDay(registration.group.date ?? event.startDate),
            registration.group.time ? t(`registration.timeLong.${registration.group.time}`) : '',
            registration.class ?? '',
            registration.group.number ?? '',
            t('startList.absent'),
            ...Array.from({ length: START_LIST_COLUMNS.length - 5 }, () => ''),
          ]
        : [
            spreadsheetDay(registration.group.date ?? event.startDate),
            registration.group.time ? t(`registration.timeLong.${registration.group.time}`) : '',
            registration.class ?? '',
            registration.group.number ?? '',
            [registration.dog.titles, registration.dog.name].filter(Boolean).join(' '),
            registration.dog.regNo,
            registration.dog.dob ? spreadsheetDay(registration.dog.dob) : '',
            formatDogName(registration.dog.sire),
            formatDogName(registration.dog.dam),
            registration.owner,
            registration.ownerHandles ? registration.owner : registration.handler,
            registration.breeder,
            registration.result ?? '',
            ...totalsCells(registration),
            // Koiranet keeps these apart from the result, and so does the sheet someone types into it.
            formatResultMarks(registration.marks, t),
            registration.placement ?? '',
          ]
    ),
  ]
}

/** The points, the maximum and the percentage as the result line shows them, or three empty cells. */
function totalsCells(registration: PublicRegistration): (number | string)[] {
  const shown = shownTotals(registration)
  return shown ? [shown.points, shown.maxPoints, shown.percentage] : ['', '', '']
}

/** A day as the sheet library takes one: the host's local noon of it, since it writes a Date's local day parts. */
function spreadsheetDay(day: DayKey): Date {
  const { year, month, day: date } = dayParts(day)
  return new Date(year, month - 1, date, 12)
}
