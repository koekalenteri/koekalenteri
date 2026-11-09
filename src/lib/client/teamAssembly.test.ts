import type { DayKey, EventTeam, JsonRegistration } from '../../types'
import { teamSuggestions } from './teamAssembly'

const DOB: DayKey = '2024-03-01'

/** A finished entry of an event still taking entries: a team candidate (KOE-1725). */
const entry = (
  id: string,
  extra: Partial<Pick<JsonRegistration, 'cancelled' | 'teamEntry' | 'dog' | 'breeder'>> = {}
): Pick<JsonRegistration, 'id' | 'cancelled' | 'class' | 'group' | 'state' | 'teamEntry' | 'dog' | 'breeder'> => ({
  breeder: { location: 'Akaa', name: `Kasvattaja ${id}` },
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
  classes: [{ class: 'AVO', state: 'confirmed' as const }],
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
    const unknown = (id: string) => entry(id, { dog: { dob: DOB, name: id, regNo: id, sire: { name: 'Isä' } } })

    expect(teamSuggestions(event([], true), [unknown('a'), unknown('b')])).toEqual([])
  })
})
