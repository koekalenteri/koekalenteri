import type { EventTeam, TeamCompetition } from '../types'
import {
  isTeamCandidate,
  isTeamCountedDay,
  MAX_TEAM_MEMBERS,
  pruneTeamDays,
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

// KOE-1725: once a dog's class is picked, only the dogs picked into it may join a team.
describe('team candidates (KOE-1725)', () => {
  const participant = {
    class: 'ALO',
    group: { key: 'ALO-2026-08-01-ap', number: 1 },
    id: 'run',
    state: 'ready' as const,
  }
  const reserve = { class: 'ALO', group: { key: 'reserve', number: 1 }, id: 'wait', state: 'ready' as const }
  const unplaced = { class: 'ALO', id: 'new', state: 'ready' as const }
  const cancelled = { ...participant, cancelled: true, id: 'gone' }
  const event = (state?: 'picked' | 'invited' | 'started') => ({
    classes: [{ class: 'ALO', ...(state ? { state } : {}) }],
    eventType: 'NOWT',
    state: 'confirmed' as const,
  })

  describe('isTeamCandidate', () => {
    it('takes every dog that has not cancelled while its class is not picked yet', () => {
      expect([participant, reserve, unplaced, cancelled].map((entry) => isTeamCandidate(event(), entry))).toEqual([
        true,
        true,
        true,
        false,
      ])
    })

    it.each(['picked', 'invited', 'started'] as const)('takes only the picked dogs once the class is %s', (state) => {
      expect([participant, reserve, unplaced, cancelled].map((entry) => isTeamCandidate(event(state), entry))).toEqual([
        true,
        false,
        false,
        false,
      ])
    })

    it('takes no entry that is not finished, whatever its class', () => {
      expect(isTeamCandidate(event(), { ...unplaced, state: 'creating' })).toBe(false)
      expect(isTeamCandidate(event('picked'), { ...participant, state: 'creating' })).toBe(false)
    })

    it("reads a classless trial's own state", () => {
      const classless = { classes: [], eventType: 'NOU', state: 'picked' as const }

      expect(isTeamCandidate(classless, { ...reserve, class: undefined })).toBe(false)
      expect(isTeamCandidate(classless, { ...participant, class: undefined })).toBe(true)
    })
  })

  describe('teamErrors with the entries', () => {
    const entries = [participant, reserve, cancelled]

    it('refuses a dog joining a team that is no candidate, or that the entries do not hold', () => {
      const teams: EventTeam[] = [{ registrationIds: ['run', 'wait', 'nobody'] }]

      expect(teamErrors({ ...event('picked'), teams }, entries, [])).toEqual([
        { kind: 'notCandidate', registrationId: 'wait' },
        { kind: 'notCandidate', registrationId: 'nobody' },
      ])
    })

    it('keeps a dog that was in a team before, whatever became of its entry since', () => {
      const before: EventTeam[] = [{ registrationIds: ['wait', 'gone'] }]
      const teams: EventTeam[] = [{ registrationIds: ['run'] }, { registrationIds: ['gone', 'wait'] }]

      expect(teamErrors({ ...event('picked'), teams }, entries, before)).toEqual([])
    })

    it('reads no candidates without the entries', () => {
      expect(teamErrors({ ...event('picked'), teams: [{ registrationIds: ['wait'] }] })).toEqual([])
    })
  })
})

// KOE-1726: the days of the trial whose results the teams count.
describe('the counted days (KOE-1726)', () => {
  const trial = {
    classes: [
      { class: 'ALO' as const, date: '2026-08-01' as const },
      { class: 'AVO' as const, date: '2026-08-02' as const },
    ],
    endDate: '2026-08-02' as const,
    startDate: '2026-08-01' as const,
  }

  describe('isTeamCountedDay', () => {
    const days = ['2026-07-31', '2026-08-01', '2026-08-02', undefined] as const

    it.each<[string, TeamCompetition | undefined, boolean[]]>([
      ['every dog without a choice, also one on no day', undefined, [true, true, true, true]],
      ['every dog for an empty choice', { days: [] }, [true, true, true, true]],
      ['the dogs of the chosen days', { days: ['2026-08-01'] }, [false, true, false, false]],
      [
        'the dogs of the chosen days the trial still has',
        { days: ['2026-07-31', '2026-08-02'] },
        [false, false, true, false],
      ],
      ['every dog when the trial has none of the chosen', { days: ['2026-07-31'] }, [true, true, true, true]],
    ])('counts %s', (_name, teamCompetition, expected) => {
      expect(days.map(isTeamCountedDay({ ...trial, teamCompetition }))).toEqual(expected)
    })

    it('reads the days of a trial without classes from its dates', () => {
      const counts = isTeamCountedDay({
        classes: [],
        endDate: '2026-08-03',
        startDate: '2026-08-01',
        teamCompetition: { days: ['2026-08-03'] },
      })

      expect([counts('2026-08-02'), counts('2026-08-03')]).toEqual([false, true])
    })
  })

  describe('pruneTeamDays', () => {
    it('drops a day the trial no longer has, and keeps the other settings', () => {
      const teamCompetition: TeamCompetition = { askAtEntry: true, days: ['2026-08-02', '2026-08-03'] }

      expect(pruneTeamDays({ ...trial, teamCompetition })).toEqual({ askAtEntry: true, days: ['2026-08-02'] })
    })

    it('removes the choice once none of its days is left, so every day counts', () => {
      const pruned = pruneTeamDays({ ...trial, teamCompetition: { askAtEntry: true, days: ['2026-07-31'] } })

      expect(pruned).toEqual({ askAtEntry: true })
      expect(pruned).not.toHaveProperty('days')
    })

    it('gives the same settings back when every chosen day is still in the trial', () => {
      const teamCompetition: TeamCompetition = { days: ['2026-08-02', '2026-08-01'] }

      expect(pruneTeamDays({ ...trial, teamCompetition })).toBe(teamCompetition)
      expect(pruneTeamDays({ ...trial, teamCompetition: undefined })).toBeUndefined()
    })
  })
})
