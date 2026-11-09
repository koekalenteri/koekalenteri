import type { EventTeam, JsonEventResult } from '../types'
import { teamStandings, withRunOffWinner } from './teamStandings'

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
