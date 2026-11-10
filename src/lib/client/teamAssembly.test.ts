import type { DayKey, EventTeam, JsonRegistration } from '../../types'
import { matchesTeamSearch, teamSuggestions } from './teamAssembly'

const DOB: DayKey = '2024-03-01'

/** A finished entry of an event still taking entries: a team candidate (KOE-1725). */
const entry = (
  id: string,
  extra: Partial<Pick<JsonRegistration, 'cancelled' | 'teamEntry' | 'dog' | 'breeder'>> = {}
): Pick<JsonRegistration, 'id' | 'cancelled' | 'class' | 'group' | 'state' | 'teamEntry' | 'dog' | 'breeder'> => ({
  breeder: { name: `Kasvattaja ${id}` },
  cancelled: false,
  class: 'AVO',
  dog: { dob: DOB, name: `Koira ${id}`, regNo: `FI${id}/24` },
  group: { key: 'reserve', number: 1 },
  id,
  state: 'ready',
  ...extra,
})

const litterDog = (id: string, sire = 'Isä', dam = 'Emä', dob: DayKey = DOB) =>
  entry(id, { dog: { dam: { name: dam }, dob, name: `Pentu ${id}`, regNo: `FI${id}/24`, sire: { name: sire } } })

const event = (teams: EventTeam[] = [], litters = false) => ({
  // The class is not picked yet, so every finished entry may join a team.
  classes: [{ class: 'AVO' }],
  state: 'confirmed' as const,
  teamCompetition: { litters },
  teams,
})

describe('teamSuggestions', () => {
  // KOE-1721: names that differ only in case and spacing are one team.
  it('suggests a team for each name given at entry, the spellings of a name taken as one', () => {
    const entries = [
      entry('a', { teamEntry: { name: 'Golden Ring' } }),
      entry('b', { teamEntry: { name: 'golden  ring ' } }),
      entry('c', { teamEntry: { name: 'Pirkan Damit' } }),
      entry('d'),
    ]

    expect(teamSuggestions(event(), entries)).toEqual([
      { kind: 'name', name: 'Golden Ring', registrationIds: ['a', 'b'] },
      { kind: 'name', name: 'Pirkan Damit', registrationIds: ['c'] },
    ])
  })

  // KOE-1721, KOE-1722: a team a member named its club's or kennel's first team is suggested as one.
  it('marks a suggestion the first team where a dog naming it marked it so', () => {
    const entries = [
      entry('a', { teamEntry: { name: 'Golden Ring' } }),
      entry('b', { teamEntry: { name: 'golden ring', primary: true } }),
      entry('c', { teamEntry: { name: 'Pirkan Damit' } }),
    ]

    expect(teamSuggestions(event(), entries)).toEqual([
      { kind: 'name', name: 'Golden Ring', primary: true, registrationIds: ['a', 'b'] },
      { kind: 'name', name: 'Pirkan Damit', registrationIds: ['c'] },
    ])
  })

  // The admin list comes in the order of the table's keys, so the entry made first names the team.
  it('names a team as the first entry made spelled it, and lists its dogs in the order they entered', () => {
    const entries = [
      { ...entry('late', { teamEntry: { name: 'golden ring' } }), createdAt: new Date('2026-11-02T10:00:00Z') },
      { ...entry('early', { teamEntry: { name: 'Golden Ring' } }), createdAt: '2026-11-01T10:00:00.000Z' },
    ]

    expect(teamSuggestions(event(), entries)).toEqual([
      { kind: 'name', name: 'Golden Ring', registrationIds: ['early', 'late'] },
    ])
  })

  it('reads an event without teams as one whose dogs are in none', () => {
    const { teams: _teams, ...noTeams } = event()

    expect(teamSuggestions(noTeams, [entry('a', { teamEntry: { name: 'Golden Ring' } })])).toEqual([
      { kind: 'name', name: 'Golden Ring', registrationIds: ['a'] },
    ])
  })

  it('leaves out the dogs already in a team, and those that may not join one', () => {
    const entries = [
      entry('a', { teamEntry: { name: 'Golden Ring' } }),
      entry('b', { teamEntry: { name: 'Golden Ring' } }),
      entry('c', { cancelled: true, teamEntry: { name: 'Golden Ring' } }),
    ]

    expect(teamSuggestions(event([{ registrationIds: ['a'] }]), entries)).toEqual([
      { kind: 'name', name: 'Golden Ring', registrationIds: ['b'] },
    ])
  })

  // KOE-1727: a litter is the dogs of one sire and dam born on one day, named after the parents; the
  // breeder's name is never part of a suggestion.
  it('suggests the litters of two dogs or more where the competition asks for litters, named after the parents', () => {
    const entries = [
      litterDog('a'),
      litterDog('b'),
      litterDog('c'),
      litterDog('d'),
      litterDog('e', 'Toinen isä'),
      litterDog('f', 'Isä', 'Emä', '2024-03-02'),
    ]

    const suggestions = teamSuggestions(event([], true), entries)

    expect(suggestions).toEqual([{ kind: 'litter', name: 'Isä x Emä', registrationIds: ['a', 'b', 'c', 'd'] }])
    expect(JSON.stringify(suggestions)).not.toContain('Kasvattaja')
  })

  it('suggests no litters where the competition does not ask for them', () => {
    expect(teamSuggestions(event(), [litterDog('a'), litterDog('b')])).toEqual([])
  })

  it('puts a dog named into a team under its name, not under its litter', () => {
    const entries = [litterDog('a'), litterDog('b'), { ...litterDog('c'), teamEntry: { name: 'Golden Ring' } }]

    expect(teamSuggestions(event([], true), entries)).toEqual([
      { kind: 'name', name: 'Golden Ring', registrationIds: ['c'] },
      { kind: 'litter', name: 'Isä x Emä', registrationIds: ['a', 'b'] },
    ])
  })

  it('takes a litter only from dogs whose parents and birth day are all known', () => {
    const noDam = (id: string) => entry(id, { dog: { dob: DOB, name: id, regNo: id, sire: { name: 'Isä' } } })
    const noSire = (id: string) => entry(id, { dog: { dam: { name: 'Emä' }, dob: DOB, name: id, regNo: id } })
    const noBirthDay = (id: string) =>
      entry(id, { dog: { dam: { name: 'Emä' }, name: id, regNo: id, sire: { name: 'Isä' } } })

    expect(
      teamSuggestions(event([], true), [
        noDam('a'),
        noDam('b'),
        noSire('c'),
        noSire('d'),
        noBirthDay('e'),
        noBirthDay('f'),
      ])
    ).toEqual([])
  })
})

// KOE-1725: a dog is found at the trial office by its name, its handler or its start number.
describe('matchesTeamSearch', () => {
  const dog = { dogName: 'Kultakuonon Kide', handler: 'Sari Saarinen', regNo: 'FI54321/24', startNumber: 12 }

  it.each([
    ['nothing typed', ''],
    ['part of its name, in any case', 'kide'],
    ['part of its handler', 'saari'],
    ['part of its registration number', '54321'],
    ['its start number', '12'],
    ['its start number with spaces around', ' 12 '],
  ])('finds a dog by %s', (_name, typed) => {
    expect(matchesTeamSearch(dog, typed)).toBe(true)
  })

  it.each([
    ['another start number', '13'],
    ['text it does not hold', 'myrsky'],
  ])('does not find a dog by %s', (_name, typed) => {
    expect(matchesTeamSearch(dog, typed)).toBe(false)
  })

  it('finds a dog without a start number only by its name, number or handler', () => {
    expect(matchesTeamSearch({ ...dog, startNumber: undefined }, '12')).toBe(false)
  })
})
