import type { TFunction } from 'i18next'
import type { PublicConfirmedEvent } from '../types/Event'
import type { PublicRegistration } from '../types/Registration'
import i18n from 'i18next'
import { isStartListUpToDate, parseStartListVersion, startListSpreadsheetRows } from './startList'

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
    const event = { eventType: 'NOU', startDate: new Date('2023-02-01') } as PublicConfirmedEvent
    const registration = {
      breeder: 'Test Breeder',
      cancelled: true,
      class: 'ALO',
      dog: {
        dam: { name: 'Dam Dog', titles: 'FI MVA' },
        dob: new Date('2020-01-02'),
        name: 'Test Dog',
        regNo: 'REG1',
        sire: { name: 'Sire Dog', titles: 'C.I.B.' },
        titles: 'FI MVA',
      },
      group: { number: 2, time: 'ap' },
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
      ],
    ])
  })
})

describe('a published result on the exported list', () => {
  it('travels with the row, so the file matches what the screen shows', () => {
    // The exporter reads only classes and startDate; the minimal event converts here.
    const event = { classes: [], startDate: new Date('2023-02-01') } as unknown as PublicConfirmedEvent
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
    expect(row.at(-2)).toBe('ALO1')
    expect(row.at(-1)).toBe('')
  })

  it("keeps a stopped trial's mark in its own column, the way Koiranet asks for it", () => {
    const event = { classes: [], startDate: new Date('2023-02-01') } as unknown as PublicConfirmedEvent
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

    expect(row.at(-2)).toBe('AVO0')
    expect(row.at(-1)).toBe('Stopped')
  })
})
