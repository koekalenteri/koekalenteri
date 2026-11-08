import type { EventTeam } from '../types'
import { MAX_TEAM_MEMBERS, teamErrors, teamMemberCode } from './team'

const ids = (count: number, prefix = 'dog') => Array.from({ length: count }, (_, index) => `${prefix}-${index}`)

describe('teamMemberCode', () => {
  it.each([
    [1, 0, '1A'],
    [1, 2, '1C'],
    [12, 1, '12B'],
    [3, MAX_TEAM_MEMBERS - 1, '3Z'],
  ])('team %i, place %i reads %s', (number, place, code) => {
    expect(teamMemberCode(number, place)).toEqual(code)
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
