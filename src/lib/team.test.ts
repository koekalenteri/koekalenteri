import type { EventTeam, JsonEventResult } from '../types'
import { MAX_TEAM_MEMBERS, teamErrors, teamMembers, teamStandings, teamsDiffer, withRunOffWinner } from './team'

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

    expect(teamErrors(teams)).toEqual([])
    expect(teamErrors(undefined)).toEqual([])
  })

  it('refuses a dog in two teams, and twice in one', () => {
    const teams: EventTeam[] = [
      { registrationIds: ['a', 'b'] },
      { registrationIds: ['c', 'a'] },
      { registrationIds: ['b'] },
    ]

    expect(teamErrors(teams)).toEqual([
      { kind: 'twice', registrationId: 'a' },
      { kind: 'twice', registrationId: 'b' },
    ])
    expect(teamErrors([{ registrationIds: ['c', 'c'] }])).toEqual([{ kind: 'twice', registrationId: 'c' }])
  })

  it('refuses a team with more dogs than there are letters', () => {
    const teams: EventTeam[] = [
      { registrationIds: ids(MAX_TEAM_MEMBERS, 'full') },
      { registrationIds: ids(MAX_TEAM_MEMBERS + 1, 'over') },
    ]

    expect(teamErrors(teams)).toEqual([{ kind: 'tooMany', team: 1 }])
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
  ])('reads %s as a change', (_name, a, b) => {
    expect(teamsDiffer(a, b)).toBe(true)
  })
})

describe('teamStandings', () => {
  const NOWT = { eventType: 'NOWT' }
  const day1 = '2026-08-01'
  const day2 = '2026-08-02'

  // A stored row holds more of its result than the standings read: the whole result, as stored.
  type Entry = Parameters<typeof teamStandings>[2][number] & {
    class: string
    eventResult?: Omit<JsonEventResult, 'updatedAt' | 'updatedBy'>
  }
  const dog = (id: string, points: number | undefined, extra: Partial<Entry> = {}): Entry => ({
    class: 'AVO',
    eventResult: points === undefined ? undefined : { maxPoints: 100, points, result: 'AVO1' },
    group: { date: day1, key: 'participants', number: 1 },
    id,
    ...extra,
  })

  it('sums the points of every running member and ranks the teams 1, 2, 2, 4', () => {
    const teams: EventTeam[] = [
      { registrationIds: ['a1', 'a2'] },
      { registrationIds: ['b1', 'b2'] },
      { registrationIds: ['c1', 'c2'] },
      { registrationIds: ['d1', 'd2'] },
    ]
    const entries = [
      dog('a1', 90),
      dog('a2', 80),
      dog('b1', 85),
      dog('b2', 70),
      // A member with no result yet counts as 0.
      dog('c1', 155),
      dog('c2', undefined),
      dog('d1', 60),
      dog('d2', 40),
    ]

    expect(teamStandings(NOWT, teams, entries)).toEqual([
      { placement: 1, points: 170, team: 0 },
      { placement: 2, points: 155, team: 1 },
      { placement: 2, points: 155, team: 2 },
      { placement: 4, points: 100, team: 3 },
    ])
  })

  it('sums the whole trial: members in different classes and on different days', () => {
    const teams: EventTeam[] = [{ registrationIds: ['a1', 'a2', 'a3'] }, { registrationIds: ['b1', 'b2'] }]
    const entries = [
      dog('a1', 90),
      dog('a2', 50, { class: 'ALO', group: { date: day2, key: 'participants', number: 1 } }),
      dog('a3', 40, { class: 'VOI', group: { date: day2, key: 'participants', number: 2 } }),
      dog('b1', 80),
      dog('b2', 70, { group: { date: day2, key: 'participants', number: 3 } }),
    ]

    expect(teamStandings(NOWT, teams, entries)).toEqual([
      { placement: 1, points: 180, team: 0 },
      { placement: 2, points: 150, team: 1 },
    ])
  })

  it('counts what a nought or a dash earned, and nothing of a round without a result yet', () => {
    const teams: EventTeam[] = [{ registrationIds: ['a1', 'a2', 'a3', 'a4', 'a5'] }]
    const entries = [
      dog('a1', 90),
      dog('a2', 40, {
        eventResult: { elimination: { fault: 'harshHandling' }, maxPoints: 100, points: 40, result: 'AVO0' },
      }),
      dog('a3', 30, { eventResult: { maxPoints: 100, points: 30, result: 'AVO-', retirement: { cause: 'injury' } } }),
      // A half-entered scorecard: its points are not the dog's result yet.
      dog('a4', 50, { eventResult: { maxPoints: 100, points: 50 } }),
      // A result stored without points adds none.
      dog('a5', undefined, { eventResult: { result: 'AVO1' } }),
    ]

    expect(teamStandings(NOWT, teams, entries)).toEqual([{ placement: 1, points: 160, team: 0 }])
  })

  it('leaves out the cancelled and the reserves, and a team with no dog running', () => {
    const teams: EventTeam[] = [{ registrationIds: ['a1', 'a2', 'a3'] }, { registrationIds: ['b1'] }]
    const entries = [
      dog('a1', 90),
      dog('a2', 50, { cancelled: true }),
      dog('a3', 50, { group: { date: day1, key: 'reserve', number: 1 } }),
      dog('b1', 50, { cancelled: true }),
    ]

    expect(teamStandings(NOWT, teams, entries)).toEqual([{ placement: 1, points: 90, team: 0 }])
  })

  it('shares first place while the run-off is not recorded', () => {
    const teams: EventTeam[] = [{ registrationIds: ['a'] }, { registrationIds: ['b'] }, { registrationIds: ['c'] }]

    expect(teamStandings(NOWT, teams, [dog('a', 90), dog('b', 90), dog('c', 80)])).toEqual([
      { placement: 1, points: 90, runOff: true, team: 0 },
      { placement: 1, points: 90, runOff: true, team: 1 },
      { placement: 3, points: 80, team: 2 },
    ])
  })

  it('puts the winner of the run-off first and the other tied teams after it on a shared place', () => {
    const teams: EventTeam[] = [
      { registrationIds: ['a'] },
      { registrationIds: ['b'], runOffWon: true },
      { registrationIds: ['c'] },
      { registrationIds: ['d'] },
    ]
    const entries = [dog('a', 90), dog('b', 90), dog('c', 90), dog('d', 80)]

    expect(teamStandings(NOWT, teams, entries)).toEqual([
      { placement: 1, points: 90, runOff: true, team: 1 },
      { placement: 2, points: 90, runOff: true, team: 0 },
      { placement: 2, points: 90, runOff: true, team: 2 },
      { placement: 4, points: 80, team: 3 },
    ])
  })

  it('gives the run-off to the first team in the list when two tied teams are marked as its winner', () => {
    const teams: EventTeam[] = [
      { registrationIds: ['a'] },
      { registrationIds: ['b'], runOffWon: true },
      { registrationIds: ['c'], runOffWon: true },
    ]

    expect(teamStandings(NOWT, teams, [dog('a', 90), dog('b', 90), dog('c', 90)])).toEqual([
      { placement: 1, points: 90, runOff: true, team: 1 },
      { placement: 2, points: 90, runOff: true, team: 0 },
      { placement: 2, points: 90, runOff: true, team: 2 },
    ])
  })

  it('reads a run-off win only while the team is tied for first', () => {
    const teams: EventTeam[] = [{ registrationIds: ['a'] }, { registrationIds: ['b'], runOffWon: true }]

    expect(teamStandings(NOWT, teams, [dog('a', 90), dog('b', 85)])).toEqual([
      { placement: 1, points: 90, team: 0 },
      { placement: 2, points: 85, team: 1 },
    ])
  })

  it('has no standings before any counted dog has a result', () => {
    const teams: EventTeam[] = [{ registrationIds: ['a'] }, { registrationIds: ['b'] }]

    expect(teamStandings(NOWT, teams, [dog('a', undefined), dog('b', 50, { eventResult: { points: 50 } })])).toEqual([])
  })

  it('has no standings in a format without points, nor without teams', () => {
    expect(teamStandings({ eventType: 'NOME-B' }, [{ registrationIds: ['a'] }], [dog('a', 90)])).toEqual([])
    expect(teamStandings(NOWT, undefined, [dog('a', 90)])).toEqual([])
  })
})

describe('withRunOffWinner', () => {
  it('marks one team the winner of the run-off and clears the mark from the others', () => {
    const teams: EventTeam[] = [
      { name: 'Team Finland 1', registrationIds: ['a'], runOffWon: true },
      { registrationIds: ['b'] },
    ]

    expect(withRunOffWinner(teams, 1, true)).toEqual([
      { name: 'Team Finland 1', registrationIds: ['a'] },
      { registrationIds: ['b'], runOffWon: true },
    ])
  })

  it('takes the win away, and stores no mark', () => {
    const teams: EventTeam[] = [{ registrationIds: ['a'], runOffWon: true }, { registrationIds: ['b'] }]

    const [first] = withRunOffWinner(teams, 0, false)

    expect(first).toEqual({ registrationIds: ['a'] })
    expect(first).not.toHaveProperty('runOffWon')
  })
})
