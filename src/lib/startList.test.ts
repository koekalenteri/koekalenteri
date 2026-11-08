import type { TFunction } from 'i18next'
import type { DayKey } from '../types/Day'
import type { PublicConfirmedEvent } from '../types/Event'
import type { PublicRegistration } from '../types/Registration'
import i18n from 'i18next'
import { eventWithStaticDates } from '../__mockData__/events'
import { legacyDayValue } from '../test-utils/finnishDays'
import { describeInTimeZone } from '../test-utils/timeZone'
import {
  isStartListUpToDate,
  newestStartListVersion,
  parseStartListVersion,
  startListColumnWidths,
  startListSpreadsheetRows,
  startListTeamDays,
  startListVersionOf,
  teamRowPrefix,
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
        'Points',
        'Maximum',
        '%',
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
    expect(row.at(-6)).toBe('ALO1')
    expect(row.at(-2)).toBe('')
    expect(row.at(-1)).toBe('')
  })

  it('carries the placement in its own column', () => {
    const event: PublicConfirmedEvent = { ...eventWithStaticDates, classes: [] }
    const registration: PublicRegistration = {
      breeder: 'Test Breeder',
      class: 'ALO',
      dog: { name: 'Test Dog', regNo: 'REG1' },
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

    expect(row.at(-6)).toBe('AVO0')
    expect(row.at(-2)).toBe('Stopped')
  })

  describe('the points, the maximum and the percentage (KOE-1673)', () => {
    const event: PublicConfirmedEvent = { ...eventWithStaticDates, classes: [] }
    const scored: PublicRegistration = {
      breeder: 'Test Breeder',
      class: 'ALO',
      dog: { name: 'Test Dog', regNo: 'REG1' },
      group: { key: 'ALO', number: 2 },
      handler: 'Test Handler',
      maxPoints: 80,
      owner: 'Test Owner',
      percentage: 81.25,
      placement: 2,
      points: 65,
      result: 'ALO1',
    }

    it('come after the result as plain numbers, the percentage rounded as the line shows it', () => {
      const [header, row] = startListSpreadsheetRows([scored], event, t)

      expect(header.slice(-6)).toEqual(['Result', 'Points', 'Maximum', '%', 'Additional marks', 'Place'])
      expect(row.slice(-6)).toEqual(['ALO1', 65, 80, 81, '', 2])
    })

    it('are empty cells for a result without them', () => {
      const { maxPoints, percentage, points, ...qualitative } = scored
      const [, row] = startListSpreadsheetRows([{ ...qualitative, placement: undefined }], event, t)

      expect(row.slice(-6)).toEqual(['ALO1', '', '', '', '', ''])
    })

    it('each have a width of their own, so the marks and the place keep theirs', () => {
      const [header] = startListSpreadsheetRows([], event, t)

      expect(startListColumnWidths).toHaveLength(header.length)
      expect(startListColumnWidths.slice(-6)).toEqual([12, 8, 8, 6, 16, 8])
    })

    it('are empty cells on a cancelled row, which is as wide as the header', () => {
      const [header, row] = startListSpreadsheetRows([{ ...scored, cancelled: true }], event, t)

      expect(row).toHaveLength(header.length)
      expect(row.slice(-6)).toEqual(['', '', '', '', '', ''])
    })
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

// KOE-1715: the start list by team, read from the rows in the running order they are shown in.
describe('startListTeamDays', () => {
  const row = (name: string, date: DayKey, extra: Partial<PublicRegistration> = {}) => ({
    date,
    registration: {
      breeder: '',
      class: 'AVO',
      dog: { name, regNo: name },
      group: { date, key: 'AVO' },
      handler: '',
      owner: '',
      ...extra,
    },
  })
  const names = (rows: readonly PublicRegistration[]) => rows.map((reg) => reg.dog.name)
  const DAY_1: DayKey = '2026-11-07'
  const DAY_2: DayKey = '2026-11-08'

  it('lists each day its teams in number order and their dogs by letter, then the rest in the order given', () => {
    const days = startListTeamDays([
      row('Dora', DAY_1),
      row('Cesar', DAY_1, { team: { code: '2A', number: 2 } }),
      row('Bella', DAY_1, { team: { code: '1B', name: 'Team Finland 1', number: 1 } }),
      row('Aapo', DAY_1, { team: { code: '1A', name: 'Team Finland 1', number: 1 } }),
      row('Eetu', DAY_1),
      row('Fanni', DAY_2, { team: { code: '2B', number: 2 } }),
    ])

    expect(
      days.map(({ date, noTeam, showClass, teams }) => ({
        date,
        noTeam: names(noTeam),
        showClass,
        teams: teams.map((team) => ({ name: team.name, number: team.number, rows: names(team.rows) })),
      }))
    ).toEqual([
      {
        date: DAY_1,
        noTeam: ['Dora', 'Eetu'],
        showClass: false,
        teams: [
          { name: 'Team Finland 1', number: 1, rows: ['Aapo', 'Bella'] },
          { name: undefined, number: 2, rows: ['Cesar'] },
        ],
      },
      { date: DAY_2, noTeam: [], showClass: false, teams: [{ name: undefined, number: 2, rows: ['Fanni'] }] },
    ])
  })

  it('reads the team the server sent, as the page receives the rows', () => {
    const team = { code: '1A', name: 'Team Finland 1', number: 1 }
    const received = toPublicRegistration({ ...row('Aapo', DAY_1).registration, team })

    expect(startListTeamDays([{ date: DAY_1, registration: received }])[0].teams).toEqual([
      { name: 'Team Finland 1', number: 1, rows: [expect.objectContaining({ team })] },
    ])
  })

  it('leaves a cancelled dog out', () => {
    const [day] = startListTeamDays([row('Aapo', DAY_1, { cancelled: true }), row('Bella', DAY_1)])

    expect(names(day.noTeam)).toEqual(['Bella'])
  })

  it('names the classes where the day teams hold more than one', () => {
    const [day] = startListTeamDays([
      row('Aapo', DAY_1, { team: { code: '1A', number: 1 } }),
      row('Bella', DAY_1, { class: 'VOI', team: { code: '2A', number: 2 } }),
    ])

    expect(day.showClass).toBe(true)
  })

  it('reads only the team rows for the classes', () => {
    const [day] = startListTeamDays([
      row('Aapo', DAY_1, { team: { code: '1A', number: 1 } }),
      row('Bella', DAY_1, { class: 'VOI' }),
    ])

    expect(day.showClass).toBe(false)
  })
})

describe('teamRowPrefix', () => {
  const reg = (extra: Partial<PublicRegistration>): PublicRegistration => ({
    breeder: '',
    class: 'AVO',
    dog: { name: 'Aapo', regNo: 'FI1/26' },
    group: { key: 'AVO' },
    handler: '',
    owner: '',
    ...extra,
  })

  it.each([
    ['the code', reg({ team: { code: '1A', number: 1 } }), false, '1A'],
    ['the class and the code', reg({ team: { code: '1A', number: 1 } }), true, 'AVO 1A'],
    ['the class of a dog in no team', reg({}), true, 'AVO'],
    ['nothing for a dog in no team', reg({}), false, ''],
    ['the code of a classless dog', reg({ class: null, team: { code: '1A', number: 1 } }), true, '1A'],
  ])('names %s', (_what, registration, showClass, expected) => {
    expect(teamRowPrefix(registration, showClass)).toBe(expected)
  })
})
