import type { EventTeam } from '../types'
import { MAX_TEAM_MEMBERS, teamErrors, teamMembers } from './team'

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
