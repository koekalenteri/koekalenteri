import type { EventTeam } from '../types'
import { MAX_TEAM_MEMBERS, teamErrors, teamMembers, teamsDiffer } from './team'

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
