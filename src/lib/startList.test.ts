import type { TFunction } from 'i18next'
import type { PublicConfirmedEvent } from '../types/Event'
import type { PublicRegistration } from '../types/Registration'
import i18n from 'i18next'
import { eventWithStaticDates } from '../__mockData__/events'
import { legacyDayValue } from '../test-utils/finnishDays'
import { describeInTimeZone } from '../test-utils/timeZone'
import { emptyDog } from './data'
import {
  isStartListUpToDate,
  newestStartListVersion,
  parseStartListVersion,
  startListSpreadsheetRows,
  startListVersionOf,
} from './startList'
import { toPublicRegistration } from './wire'

/**
 * The real translator. The test setup already initialises i18n, so there is no need for a hand-kept
 * copy of the strings — a parallel list drifts from the locale silently, and a renamed key fails here.
 */
const t = i18n.getFixedT('en') as TFunction

describe('isStartListUpToDate (KOE-1516)', () => {
  it.each([
    { expected: true, incoming: 100, shown: undefined, what: 'anything replaces rows with no version' },
    { expected: true, incoming: undefined, shown: undefined, what: 'an unversioned list replaces an unversioned one' },
    { expected: true, incoming: 200, shown: 100, what: 'a newer version replaces an older one' },
    { expected: true, incoming: 100, shown: 100, what: 'the same millisecond: the later arrival wins' },
    { expected: false, incoming: 99, shown: 100, what: 'an older version does not' },
    { expected: false, incoming: undefined, shown: 100, what: 'nor does an unversioned one once a version was taken' },
  ])('$what', ({ expected, incoming, shown }) => {
    expect(isStartListUpToDate(shown, incoming)).toBe(expected)
  })
})

describe('startListVersionOf', () => {
  it('reads the version header, and nothing without one', () => {
    expect(startListVersionOf(new Headers({ 'X-Start-List-Version': '1234' }))).toBe(1234)
    expect(startListVersionOf(new Headers())).toBeUndefined()
  })
})

describe('newestStartListVersion', () => {
  it.each([
    { a: undefined, b: undefined, expected: undefined },
    { a: 100, b: undefined, expected: 100 },
    { a: undefined, b: 200, expected: 200 },
    { a: 300, b: 200, expected: 300 },
    { a: 100, b: 200, expected: 200 },
  ])('of $a and $b is $expected', ({ a, b, expected }) => {
    expect(newestStartListVersion(a, b)).toBe(expected)
  })
})

describe('parseStartListVersion', () => {
  it.each([
    { expected: 1234, value: '1234' },
    { expected: undefined, value: null },
    { expected: undefined, value: '' },
    { expected: undefined, value: 'soon' },
  ])('reads $value as $expected', ({ expected, value }) => {
    expect(parseStartListVersion(value)).toBe(expected)
  })
})

describe('startListSpreadsheetRows', () => {
  it('creates localized headers and typed date cells for registrations', () => {
    const event: PublicConfirmedEvent = { ...eventWithStaticDates, eventType: 'NOU', startDate: '2023-02-01' }
    const registration = {
      breeder: 'Test Breeder',
      cancelled: true,
      class: 'ALO',
      dog: {
        dam: { name: 'Dam Dog', titles: 'FI MVA' },
        dob: '2020-01-02' as const,
        name: 'Test Dog',
        regNo: 'REG1',
        results: [],
        sire: { name: 'Sire Dog', titles: 'C.I.B.' },
        titles: 'FI MVA',
      },
      group: { key: 'group', number: 2, time: 'ap' },
      handler: 'Test Handler',
      owner: 'Test Owner',
      ownerHandles: true,
    } as PublicRegistration

    expect(startListSpreadsheetRows([registration], event, t)).toEqual([
      [
        'Date',
        'Time',
        'Class',
        'Number',
        'Dog',
        'Registration number',
        'Date of birth',
        'Sire',
        'Dam',
        'Owner',
        'Handler',
        'Breeder',
        'Result',
        'Additional marks',
        'Place',
      ],
      [
        // The fixture is cancelled: since KOE-1017 a cancelled row exports its number and the
        // absent mark, nothing else — the file must match the public page it came from.
        new Date(2023, 1, 1, 12),
        'morning',
        'ALO',
        2,
        'ABSENT',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
      ],
    ])
  })
})

describe('a published result on the exported list', () => {
  it('travels with the row, so the file matches what the screen shows', () => {
    // The exporter reads only classes and startDate; the minimal event converts here.
    const event = { classes: [], startDate: '2023-02-01' } as unknown as PublicConfirmedEvent
    const registration = {
      breeder: 'Test Breeder',
      class: 'ALO',
      dog: { name: 'Test Dog', regNo: 'REG1' },
      group: { key: 'ALO', number: 2 },
      handler: 'Test Handler',
      owner: 'Test Owner',
      result: 'ALO1',
    } as PublicRegistration

    const [, row] = startListSpreadsheetRows([registration], event, t)

    // The download is what gets circulated, so a result missing here is a file that disagrees with
    // the page it came from.
    expect(row.at(-3)).toBe('ALO1')
    expect(row.at(-2)).toBe('')
    expect(row.at(-1)).toBe('')
  })

  it('carries the placement in its own column', () => {
    const event: PublicConfirmedEvent = { ...eventWithStaticDates, classes: [] }
    const registration: PublicRegistration = {
      breeder: 'Test Breeder',
      class: 'ALO',
      dog: { ...emptyDog, name: 'Test Dog', regNo: 'REG1' },
      group: { key: 'ALO', number: 2 },
      handler: 'Test Handler',
      owner: 'Test Owner',
      placement: 2,
      result: 'ALO1',
    }

    const [header, row] = startListSpreadsheetRows([registration], event, t)

    expect(header.at(-1)).toBe('Place')
    expect(row.at(-1)).toBe(2)
  })

  it("keeps a stopped trial's mark in its own column, the way Koiranet asks for it", () => {
    const event = { classes: [], startDate: '2023-02-01' } as unknown as PublicConfirmedEvent
    const registration = {
      breeder: 'Test Breeder',
      class: 'AVO',
      dog: { name: 'Test Dog', regNo: 'REG1' },
      group: { key: 'AVO', number: 2 },
      handler: 'Test Handler',
      marks: ['interrupted'],
      owner: 'Test Owner',
      result: 'AVO0',
    } as PublicRegistration

    const [, row] = startListSpreadsheetRows([registration], event, t)

    expect(row.at(-3)).toBe('AVO0')
    expect(row.at(-2)).toBe('Stopped')
  })
})

// Kennelliitto's birth date has no zone, and the lists and the sheet show it in Finnish time: read as
// the browser's midnight, it was 31.12.2020 east of Finland (KOE-1548).
describe.each(['Europe/Helsinki', 'America/New_York', 'Asia/Tokyo'])("the dog's birth date in %s", (zone) => {
  describeInTimeZone(zone, () => {
    const registration = () =>
      toPublicRegistration({
        breeder: 'b',
        dog: { dob: legacyDayValue('2021-01-01T00:00:00'), name: 'Dog', regNo: 'REG1' },
        group: { key: 'group', number: 1 },
        handler: 'h',
        owner: 'o',
      })

    it('is 1.1.2021 on the list', () => {
      expect(i18n.getFixedT('fi')('dateFormat.isodate', { date: registration().dog.dob })).toBe('01.01.2021')
    })

    it('is 1.1.2021 in the sheet', () => {
      const event = { classes: [], startDate: eventWithStaticDates.startDate } as unknown as PublicConfirmedEvent
      const [, row] = startListSpreadsheetRows([registration()], event, t)

      expect(row[6]).toEqual(new Date(2021, 0, 1, 12))
    })
  })
})
