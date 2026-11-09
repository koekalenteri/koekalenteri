import type { TFunction } from 'i18next'
import type { DayKey } from '../types/Day'
import type { PublicConfirmedEvent } from '../types/Event'
import type { PublicRegistration } from '../types/Registration'
import i18n from 'i18next'
import { eventWithStaticDates } from '../__mockData__/events'
import {
  formatTeamStanding,
  publicationNote,
  rowPublicationNote,
  startListTeamDays,
  teamDayNoteLines,
  teamRowPrefix,
  teamSeriesName,
} from './startListView'
import { toPublicRegistration } from './wire'

const t = i18n.getFixedT('fi') as TFunction

const DAY_1: DayKey = '2026-11-07'
const DAY_2: DayKey = '2026-11-08'

const registration = (name: string, date: DayKey, extra: Partial<PublicRegistration> = {}): PublicRegistration => ({
  breeder: '',
  class: 'AVO',
  dog: { name, regNo: name },
  group: { date, key: 'AVO' },
  handler: '',
  owner: '',
  ...extra,
})

const row = (name: string, date: DayKey, extra: Partial<PublicRegistration> = {}) => ({
  date,
  registration: registration(name, date, extra),
})

describe('publicationNote (KOE-1006)', () => {
  it.each([
    [false, false, 'startListNotPublished'],
    [false, true, 'startListNotPublished'],
    [true, false, 'startNumbersNotPublished'],
    [true, true, undefined],
  ])('published %s, numbers published %s: %s', (published, numbersPublished, expected) => {
    expect(publicationNote(published, numbersPublished)).toBe(expected)
  })
})

// A list published for both classes, the numbers only for AVO: the state before VOI's venue draw.
const event: PublicConfirmedEvent = {
  ...eventWithStaticDates,
  classes: [
    { class: 'AVO', date: DAY_1, state: 'invited' },
    { class: 'VOI', date: DAY_1, state: 'invited' },
  ],
  endDate: DAY_1,
  startDate: DAY_1,
  startListPublished: true,
  startNumbersPublished: { AVO: true, VOI: false },
  state: 'invited',
}

describe('rowPublicationNote', () => {
  it('reads the note of the class and day a row is listed under', () => {
    expect(rowPublicationNote(event, registration('Aapo', DAY_1))).toBeUndefined()
    expect(rowPublicationNote(event, registration('Bella', DAY_1, { class: 'VOI' }))).toBe('startNumbersNotPublished')
  })
})

// KOE-1715: the start list by team, read from the rows in the running order they are shown in.
describe('startListTeamDays', () => {
  const names = (rows: readonly PublicRegistration[]) => rows.map((reg) => reg.dog.name)

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

  // KOE-1720: a competition in series lists its teams series by series, the teams in none first.
  it('lists the teams series by series, in the order of the competition, the teams in no series first', () => {
    const event = {
      teamCompetition: {
        series: [
          { id: 'open', name: { fi: 'Avoin' } },
          { id: 'breed', name: { fi: 'Rotu' } },
        ],
      },
    }
    const [day] = startListTeamDays(
      [
        row('Aapo', DAY_1, { team: { code: '1A', number: 1, seriesId: 'breed' } }),
        row('Bella', DAY_1, { team: { code: '2A', number: 2, seriesId: 'open' } }),
        row('Cesar', DAY_1, { team: { code: '3A', number: 3 } }),
        row('Dora', DAY_1, { team: { code: '4A', number: 4, seriesId: 'open' } }),
      ],
      event
    )

    expect(day.teams.map((team) => [team.number, team.seriesId])).toEqual([
      [3, undefined],
      [2, 'open'],
      [4, 'open'],
      [1, 'breed'],
    ])
  })

  it('reads the team the server sent, as the page receives the rows', () => {
    const team = { code: '1A', name: 'Team Finland 1', number: 1 }
    const received = toPublicRegistration({ ...registration('Aapo', DAY_1), team })

    expect(startListTeamDays([{ date: DAY_1, registration: received }])[0].teams).toEqual([
      { name: 'Team Finland 1', number: 1, rows: [expect.objectContaining({ team })] },
    ])
  })

  it('gives a team the standing its rows carry (KOE-1717)', () => {
    const standing = { number: 1, placement: 1, points: 170, runOff: true as const }
    const [day] = startListTeamDays([
      row('Aapo', DAY_1, { team: { ...standing, code: '1A' } }),
      row('Bella', DAY_1, { team: { ...standing, code: '1B' } }),
    ])

    expect(day.teams).toEqual([{ ...standing, rows: [expect.anything(), expect.anything()] }])
  })

  it('leaves a cancelled dog out, also from the classes the day shows', () => {
    const [day] = startListTeamDays([row('Aapo', DAY_1, { cancelled: true, class: 'VOI' }), row('Bella', DAY_1)])

    expect(names(day.noTeam)).toEqual(['Bella'])
    expect(day.showClass).toBe(false)
  })

  it.each([
    ['the teams', { code: '2A', number: 2 }],
    ['a dog in no team', undefined],
  ])('names the classes where the day shows more than one, the second in %s', (_where, team) => {
    const [day] = startListTeamDays([
      row('Aapo', DAY_1, { team: { code: '1A', number: 1 } }),
      row('Bella', DAY_1, { class: 'VOI', team }),
    ])

    expect(day.showClass).toBe(true)
  })

  it("keeps each class's first row, in the order the day lists them", () => {
    const [day] = startListTeamDays([
      row('Aapo', DAY_1, { team: { code: '1A', number: 1 } }),
      row('Bella', DAY_1, { class: 'VOI' }),
      row('Cesar', DAY_1),
    ])

    expect(names(day.classRows)).toEqual(['Aapo', 'Bella'])
  })
})

describe('teamDayNoteLines', () => {
  it('notes each class of the day whose numbers are not out yet', () => {
    const [day] = startListTeamDays([
      row('Aapo', DAY_1, { team: { code: '1A', number: 1 } }),
      row('Bella', DAY_1, { class: 'VOI', team: { code: '1B', number: 1 } }),
    ])

    expect(teamDayNoteLines(event, day, t)).toEqual(['VOI (starttijärjestystä ei ole vielä vahvistettu)'])
  })

  it('notes a classless day without a class', () => {
    const classless = { ...event, classes: [], startNumbersPublished: false }
    const [day] = startListTeamDays([row('Aapo', DAY_1, { class: undefined, team: { code: '1A', number: 1 } })])

    expect(teamDayNoteLines(classless, day, t)).toEqual(['(starttijärjestystä ei ole vielä vahvistettu)'])
  })

  it('has no lines once the numbers are out', () => {
    const [day] = startListTeamDays([row('Aapo', DAY_1, { team: { code: '1A', number: 1 } })])

    expect(teamDayNoteLines(event, day, t)).toEqual([])
  })
})

describe('teamRowPrefix', () => {
  it.each([
    ['the code', registration('Aapo', DAY_1, { team: { code: '1A', number: 1 } }), false, '1A'],
    ['the class and the code', registration('Aapo', DAY_1, { team: { code: '1A', number: 1 } }), true, 'AVO 1A'],
    ['the class of a dog in no team', registration('Aapo', DAY_1), true, 'AVO'],
    ['nothing for a dog in no team', registration('Aapo', DAY_1), false, ''],
    [
      'the code of a classless dog',
      registration('Aapo', DAY_1, { class: null, team: { code: '1A', number: 1 } }),
      true,
      '1A',
    ],
  ])('names %s', (_what, reg, showClass, expected) => {
    expect(teamRowPrefix(reg, showClass)).toBe(expected)
  })
})

describe('formatTeamStanding (KOE-1717)', () => {
  it.each([
    ['a placing', { placement: 3, points: 150 }, '3. sija, 150 pistettä'],
    [
      'a team tied for first',
      { placement: 1, points: 170, runOff: true as const },
      '1. sija, 170 pistettä (uusintatehtävä)',
    ],
    ['no standing while it is not public', {}, undefined],
  ])('writes %s', (_what, standing, expected) => {
    expect(formatTeamStanding(standing, t)).toBe(expected)
  })
})

describe('teamSeriesName (KOE-1720)', () => {
  const event = {
    teamCompetition: {
      series: [
        { id: 'open', name: { en: 'Open', fi: 'Avoin' } },
        { id: 'breed', name: { fi: 'Rotu' } },
      ],
    },
  }

  it("names a series in the viewer's language, in Finnish without one, and by its id once it is gone", () => {
    expect(teamSeriesName(event, 'open', 'en')).toBe('Open')
    expect(teamSeriesName(event, 'breed', 'en')).toBe('Rotu')
    expect(teamSeriesName(event, 'gone', 'fi')).toBe('gone')
    expect(teamSeriesName({}, 'open', 'fi')).toBe('open')
  })
})
