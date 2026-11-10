import type { DayKey, EventTeam, JsonRegistration } from '../../types'
import { findTeamCandidates, litterMismatches, teamSuggestions } from './teamAssembly'

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
  // suggestion is named after the first entry's breeder (the user's decision 10.11.2026).
  it('suggests the litters of two dogs or more where the competition asks for litters, named after the breeder', () => {
    const entries = [
      litterDog('a'),
      litterDog('b'),
      litterDog('c'),
      litterDog('d'),
      litterDog('e', 'Toinen isä'),
      litterDog('f', 'Isä', 'Emä', '2024-03-02'),
    ]

    const suggestions = teamSuggestions(event([], true), entries)

    expect(suggestions).toEqual([{ kind: 'litter', name: 'Kasvattaja a', registrationIds: ['a', 'b', 'c', 'd'] }])
  })

  it('names a litter after its parents where the first entry names no breeder', () => {
    const noBreeder = { ...litterDog('a'), breeder: { name: ' ' } }

    expect(teamSuggestions(event([], true), [noBreeder, litterDog('b')])).toEqual([
      { kind: 'litter', name: 'Isä x Emä', registrationIds: ['a', 'b'] },
    ])
  })

  it('suggests no litters where the competition does not ask for them', () => {
    expect(teamSuggestions(event(), [litterDog('a'), litterDog('b')])).toEqual([])
  })

  it('puts a dog named into a team under its name, not under its litter', () => {
    const entries = [litterDog('a'), litterDog('b'), { ...litterDog('c'), teamEntry: { name: 'Golden Ring' } }]

    expect(teamSuggestions(event([], true), entries)).toEqual([
      { kind: 'name', name: 'Golden Ring', registrationIds: ['c'] },
      { kind: 'litter', name: 'Kasvattaja a', registrationIds: ['a', 'b'] },
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

// KOE-1727: a litter team is the dogs of one litter; the page says which dog is of another.
describe('litterMismatches', () => {
  const byId = (...dogs: ReturnType<typeof litterDog>[]) => new Map(dogs.map((dog) => [dog.id, dog]))

  it('names the dogs of another litter than most of the team, and the dogs whose litter is not known', () => {
    const unknown = entry('d', { dog: { dob: DOB, name: 'd', regNo: 'd' } })
    const entries = byId(litterDog('a'), litterDog('b'), litterDog('c', 'Toinen isä'), unknown)

    expect(litterMismatches({ registrationIds: ['c', 'a', 'b', 'd'] }, entries)).toEqual([
      { kind: 'otherLitter', registrationId: 'c' },
      { kind: 'unknownLitter', registrationId: 'd' },
    ])
  })

  it("takes the first dog's litter where the litters are as many", () => {
    const entries = byId(litterDog('a'), litterDog('b', 'Toinen isä'))

    expect(litterMismatches({ registrationIds: ['b', 'a'] }, entries)).toEqual([
      { kind: 'otherLitter', registrationId: 'a' },
    ])
  })

  it('finds nothing in a team of one litter, and skips an id the entries do not hold', () => {
    expect(litterMismatches({ registrationIds: ['a', 'b', 'gone'] }, byId(litterDog('a'), litterDog('b')))).toEqual([])
  })
})

// KOE-1725: a dog is found at the trial office by its name, its handler or its start number.
describe('findTeamCandidates', () => {
  const kide = { dogName: 'Kultakuonon Kide', handler: 'Sari Saarinen', regNo: 'FI54321/24', startNumber: 12 }
  const ruska = { dogName: 'Ruska 12', handler: 'Anna Aaltonen', regNo: 'FI11223/24', startNumber: 3 }
  const myrsky = { dogName: 'Metsälän Myrsky', handler: 'Ville Virtanen', regNo: 'FI99999/24' }
  const dogs = [kide, ruska, myrsky]
  const find = (typed: string) => findTeamCandidates(dogs, typed, (dog) => dog).map((dog) => dog.dogName)

  it.each([
    ['nothing typed', '', ['Kultakuonon Kide', 'Ruska 12', 'Metsälän Myrsky']],
    ['part of a name, in any case', 'kide', ['Kultakuonon Kide']],
    ['part of a handler', 'aalto', ['Ruska 12']],
    ['part of a registration number', '54321', ['Kultakuonon Kide']],
  ])('finds the dogs by %s', (_name, typed, found) => {
    expect(find(typed)).toEqual(found)
  })

  // A number a dog wears finds that dog alone, not the names and numbers that hold its digits.
  it('finds only the dog wearing a start number typed, with spaces around or not', () => {
    expect(find('12')).toEqual(['Kultakuonon Kide'])
    expect(find(' 3 ')).toEqual(['Ruska 12'])
  })

  it('reads a number no dog wears as text: before publishing, or part of a registration number', () => {
    expect(find('99')).toEqual(['Metsälän Myrsky'])
    expect(find('112')).toEqual(['Ruska 12'])
  })

  it('finds nothing for text no dog holds', () => {
    expect(find('pentti')).toEqual([])
  })
})
