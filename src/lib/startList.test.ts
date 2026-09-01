import type { TFunction } from 'i18next'
import type { PublicConfirmedEvent } from '../types/Event'
import type { PublicRegistration } from '../types/Registration'
import i18n from 'i18next'
import { startListSpreadsheetRows } from './startList'

/**
 * The real translator. The test setup already initialises i18n, so there is no need for a hand-kept
 * copy of the strings — a parallel list drifts from the locale silently, and a renamed key fails here.
 */
const t = i18n.getFixedT('en') as TFunction

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
      ],
    ])
  })
})

describe('a published result on the exported list', () => {
  it('travels with the row, so the file matches what the screen shows', () => {
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
    expect(row.at(-1)).toBe('ALO1')
  })
})
