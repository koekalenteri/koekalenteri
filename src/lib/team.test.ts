import type { EventTeam, TeamCompetition } from '../types'
import {
  entryTeamError,
  MAX_TEAM_MEMBERS,
  normalizeTeamName,
  teamCompetitionDiffers,
  teamCompetitionErrors,
  teamErrors,
  teamMembers,
  teamsDiffer,
} from './team'

const ids = (count: number, prefix = 'dog') => Array.from({ length: count }, (_, index) => `${prefix}-${index}`)

describe('teamMembers', () => {
  const entries = new Map(ids(MAX_TEAM_MEMBERS).map((id) => [id, { id }]))

  it("codes each dog by the team's number and its place in the team", () => {
    expect(teamMembers({ registrationIds: ['dog-2', 'dog-0', 'dog-1'] }, 12, entries)).toEqual([
      { code: '12A', place: 0, registration: { id: 'dog-2' } },
      { code: '12B', place: 1, registration: { id: 'dog-0' } },
      { code: '12C', place: 2, registration: { id: 'dog-1' } },
    ])
  })

  it('gives the last of a full team the last letter', () => {
    expect(teamMembers({ registrationIds: ids(MAX_TEAM_MEMBERS) }, 3, entries).at(-1)?.code).toEqual('3Z')
  })

  it('skips an id the entries do not hold, and its letter stays taken', () => {
    expect(teamMembers({ registrationIds: ['dog-0', 'gone', 'dog-1'] }, 1, entries)).toEqual([
      { code: '1A', place: 0, registration: { id: 'dog-0' } },
      { code: '1C', place: 2, registration: { id: 'dog-1' } },
    ])
  })

  it('has no members for a team without dogs', () => {
    expect(teamMembers({ registrationIds: [] }, 1, entries)).toEqual([])
  })
})

describe('teamErrors', () => {
  it('accepts teams with each dog in one team, and a team without dogs', () => {
    const teams: EventTeam[] = [{ name: 'Loistavat Lintukoirat', registrationIds: ['a', 'b'] }, { registrationIds: [] }]

    expect(teamErrors({ teams })).toEqual([])
    expect(teamErrors({})).toEqual([])
  })

  it('refuses a dog in two teams, and twice in one', () => {
    const teams: EventTeam[] = [
      { registrationIds: ['a', 'b'] },
      { registrationIds: ['c', 'a'] },
      { registrationIds: ['b'] },
    ]

    expect(teamErrors({ teams })).toEqual([
      { kind: 'twice', registrationId: 'a' },
      { kind: 'twice', registrationId: 'b' },
    ])
    expect(teamErrors({ teams: [{ registrationIds: ['c', 'c'] }] })).toEqual([{ kind: 'twice', registrationId: 'c' }])
  })

  it('refuses a team with more dogs than there are letters', () => {
    const teams: EventTeam[] = [
      { registrationIds: ids(MAX_TEAM_MEMBERS, 'full') },
      { registrationIds: ids(MAX_TEAM_MEMBERS + 1, 'over') },
    ]

    expect(teamErrors({ teams })).toEqual([{ kind: 'tooMany', team: 1 }])
  })

  it('refuses a team in a series the competition does not have (KOE-1720)', () => {
    const teamCompetition = { series: [{ id: 'open', name: { fi: 'Avoin' } }] }
    const teams: EventTeam[] = [
      { registrationIds: ['a'], seriesId: 'open' },
      { registrationIds: ['b'], seriesId: 'gone' },
      { registrationIds: ['c'] },
    ]

    expect(teamErrors({ teamCompetition, teams })).toEqual([{ kind: 'unknownSeries', seriesId: 'gone', team: 1 }])
    expect(teamErrors({ teams: [{ registrationIds: ['a'], seriesId: 'open' }] })).toEqual([
      { kind: 'unknownSeries', seriesId: 'open', team: 0 },
    ])
  })
})

describe('teamsDiffer', () => {
  const team: EventTeam = { name: 'Team Finland 1', registrationIds: ['a', 'b'] }

  it.each<[string, EventTeam[] | null | undefined, EventTeam[] | null | undefined]>([
    ['no teams and an empty list', undefined, []],
    ['null and no teams', null, undefined],
    ['the same teams', [team], [{ name: 'Team Finland 1', registrationIds: ['a', 'b'] }]],
    ['no name and an empty one', [{ registrationIds: ['a'] }], [{ name: '', registrationIds: ['a'] }]],
    ['no run-off mark and a false one', [{ registrationIds: ['a'] }], [{ registrationIds: ['a'], runOffWon: false }]],
  ])('reads %s as the same', (_name, a, b) => {
    expect(teamsDiffer(a, b)).toBe(false)
  })

  it.each<[string, EventTeam[], EventTeam[]]>([
    ['a team added', [team], [team, { registrationIds: [] }]],
    ['a team removed', [team], []],
    ['a rename', [team], [{ ...team, name: 'Team Finland 2' }]],
    ['two dogs swapped', [team], [{ ...team, registrationIds: ['b', 'a'] }]],
    ['a dog added', [team], [{ ...team, registrationIds: ['a', 'b', 'c'] }]],
    ['two teams swapped', [team, { registrationIds: ['c'] }], [{ registrationIds: ['c'] }, team]],
    ['a run-off won', [team], [{ ...team, runOffWon: true }]],
    ['a run-off win taken away', [{ ...team, runOffWon: true }], [team]],
    ['a team moved to a series (KOE-1720)', [team], [{ ...team, seriesId: 'open' }]],
  ])('reads %s as a change', (_name, a, b) => {
    expect(teamsDiffer(a, b)).toBe(true)
  })
})

describe('teamCompetitionErrors (KOE-1720)', () => {
  it('accepts series with their own ids and a Finnish name, and no competition settings', () => {
    expect(
      teamCompetitionErrors({
        series: [
          { id: 'open', name: { fi: 'Avoin' } },
          { id: 'breed', name: { en: 'Breed', fi: 'Rotu' } },
        ],
      })
    ).toEqual([])
    expect(teamCompetitionErrors(undefined)).toEqual([])
    expect(teamCompetitionErrors({})).toEqual([])
  })

  it('refuses two series with one id, and a series without a Finnish name', () => {
    expect(
      teamCompetitionErrors({
        series: [
          { id: 'open', name: { fi: 'Avoin' } },
          { id: 'open', name: { fi: 'Toinen' } },
          { id: 'breed', name: { en: 'Breed' } },
          { id: 'blank', name: { fi: ' ' } },
        ],
      })
    ).toEqual([
      { kind: 'seriesTwice', seriesId: 'open' },
      { kind: 'seriesUnnamed', seriesId: 'breed' },
      { kind: 'seriesUnnamed', seriesId: 'blank' },
    ])
  })
})

describe('teamCompetitionDiffers (KOE-1720)', () => {
  const series = [{ id: 'open', name: { fi: 'Avoin' } }]

  it.each<[string, TeamCompetition | undefined, TeamCompetition]>([
    ['no settings and empty ones', undefined, {}],
    [
      'a renamed series, since a row names its series by id',
      { series },
      { series: [{ id: 'open', name: { fi: 'Uusi' } }] },
    ],
    ['an added series no team is in', { series }, { series: [...series, { id: 'breed', name: { fi: 'Rotu' } }] }],
    ['the question at entry', {}, { askAtEntry: true }],
    ['the litter suggestions', {}, { litters: true }],
  ])('reads %s as the same list', (_name, a, b) => {
    expect(teamCompetitionDiffers(a, b)).toBe(false)
  })

  it.each<[string, TeamCompetition, TeamCompetition]>([
    ['counted days set', {}, { days: ['2026-08-01'] }],
    ['a counted day removed', { days: ['2026-08-01', '2026-08-02'] }, { days: ['2026-08-01'] }],
  ])('reads %s as a change of the list', (_name, a, b) => {
    expect(teamCompetitionDiffers(a, b)).toBe(true)
  })
})

// KOE-1721: the team a participant names at entry, when the event asks for one.
describe('normalizeTeamName (KOE-1721)', () => {
  it('trims the name and keeps one space between its words', () => {
    expect(normalizeTeamName('  Savon \t Nuuskut\u00a0 1 ')).toBe('Savon Nuuskut 1')
    expect(normalizeTeamName(' ')).toBe('')
  })
})

describe('entryTeamError (KOE-1721)', () => {
  const asks = { teamCompetition: { askAtEntry: true } }

  it('accepts a named team where the event asks for one, and no team anywhere', () => {
    expect(entryTeamError(asks, { name: 'Savon Nuuskut 1' })).toBeUndefined()
    expect(entryTeamError(asks, { name: 'Savon Nuuskut 1', primary: true })).toBeUndefined()
    expect(entryTeamError(asks, { name: ` ${'N'.repeat(60)} ` })).toBeUndefined()
    expect(entryTeamError({}, undefined)).toBeUndefined()
    expect(entryTeamError({}, null)).toBeUndefined()
  })

  it.each([
    ['without asking for it', {}, { name: 'Savon Nuuskut 1' }, 'notAsked'],
    ['with the question off', { teamCompetition: { askAtEntry: false } }, { name: 'Savon Nuuskut 1' }, 'notAsked'],
    ['without a name', asks, { name: '  ' }, 'noName'],
    ['with a name longer than sixty characters', asks, { name: 'N'.repeat(61) }, 'tooLong'],
    ['with a name that is not text', asks, { name: 1 }, 'invalid'],
    ['with a first-team mark that is not true', asks, { name: 'Savon Nuuskut 1', primary: false }, 'invalid'],
  ])('refuses a team named %s', (_name, event, teamEntry, error) => {
    expect(entryTeamError(event, teamEntry)).toBe(error)
  })

  it('keeps a stored team as it is where the event no longer asks for one', () => {
    const stored = { name: 'Savon Nuuskut 1' }

    expect(entryTeamError({}, { name: ' Savon  Nuuskut 1' }, stored)).toBeUndefined()
    expect(entryTeamError({}, { name: 'Savon Nuuskut 2' }, stored)).toBe('notAsked')
  })
})
