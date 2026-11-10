import type { EventTeam } from '../types'
import type { AssemblyEntry } from './teamSelection'
import { teamDayPlacer, teamDraw, teamDrawPlaces, teamGroupMoves, teamSelection } from './teamSelection'

// KOE-1722: the secretary selects a team competition's dogs team by team.
const DAY = '2026-08-01' as const
const morning = { date: DAY, key: `${DAY}-ap`, time: 'ap' as const }
const afternoon = { date: DAY, key: `${DAY}-ip`, time: 'ip' as const }

const running = (id: string, eventClass = 'ALO'): AssemblyEntry => ({
  class: eventClass,
  dates: [{ date: DAY, time: 'ap' }],
  group: { ...morning, number: 1 },
  id,
})
const reserve = (id: string, eventClass = 'ALO', time: 'ap' | 'ip' = 'ap'): AssemblyEntry => ({
  class: eventClass,
  dates: [{ date: DAY, time }],
  group: { key: 'reserve', number: 1 },
  id,
})
const cancelled = (id: string): AssemblyEntry => ({ ...running(id), cancelled: true })

describe('teamSelection', () => {
  it('tells a team selected whole, in part, on the reserve list, or without a dog that runs', () => {
    const teams: EventTeam[] = [
      { registrationIds: ['a', 'b'] },
      { registrationIds: ['c', 'd'] },
      { registrationIds: ['e', 'f'] },
      { registrationIds: ['g', 'gone'] },
    ]
    const entries = [running('a'), running('b'), running('c'), reserve('d'), reserve('e'), reserve('f'), cancelled('g')]

    expect(teamSelection(teams, entries)).toEqual(['selected', 'partial', 'reserve', 'empty'])
  })

  it('reads a cancelled member as out of the team', () => {
    expect(teamSelection([{ registrationIds: ['a', 'x'] }], [running('a'), cancelled('x')])).toEqual(['selected'])
  })
})

describe('teamGroupMoves', () => {
  const groups = new Map([
    ['ALO', [morning, afternoon]],
    ['AVO', [afternoon]],
  ])

  it('moves the reserve members to the group of the day they entered, one class at a time', () => {
    const team: EventTeam = { registrationIds: ['a', 'b', 'c', 'd'] }
    const entries = [running('a'), reserve('b', 'ALO', 'ip'), reserve('c', 'AVO', 'ip'), reserve('d')]

    expect(teamGroupMoves(team, entries, 'participants', groups, {})).toEqual([
      {
        eventClass: 'ALO',
        moves: [
          { group: { date: DAY, key: afternoon.key, time: 'ip' }, id: 'b' },
          { group: { date: DAY, key: morning.key, time: 'ap' }, id: 'd' },
        ],
      },
      { eventClass: 'AVO', moves: [{ group: { date: DAY, key: afternoon.key, time: 'ip' }, id: 'c' }] },
    ])
  })

  it("moves a member to the class's first group when it entered no day the class runs", () => {
    const entry = { ...reserve('b'), dates: [{ date: '2026-08-02' as const, time: 'ap' as const }] }

    expect(teamGroupMoves({ registrationIds: ['b'] }, [entry], 'participants', groups, {})).toEqual([
      { eventClass: 'ALO', moves: [{ group: { date: DAY, key: morning.key, time: 'ap' }, id: 'b' }] },
    ])
  })

  it('moves the running members to the reserve list, and leaves a cancelled one where it is', () => {
    const team: EventTeam = { registrationIds: ['a', 'b', 'x'] }

    expect(teamGroupMoves(team, [running('a'), reserve('b'), cancelled('x')], 'reserve', groups, {})).toEqual([
      { eventClass: 'ALO', moves: [{ group: { key: 'reserve' }, id: 'a' }] },
    ])
  })

  it('leaves a member with no class where it is: no class, no group to move it to', () => {
    const noClass = { ...reserve('b'), class: null }

    expect(
      teamGroupMoves({ registrationIds: ['a', 'b'] }, [reserve('a'), noClass], 'participants', groups, {})
    ).toEqual([{ eventClass: 'ALO', moves: [{ group: { date: DAY, key: morning.key, time: 'ap' }, id: 'a' }] }])
  })

  it('leaves a reserve member where it is when its class has no group to take it, for the secretary to place', () => {
    expect(teamGroupMoves({ registrationIds: ['v'] }, [reserve('v', 'VOI')], 'participants', groups, {})).toEqual([])
  })

  // KOE-674: the moves go class by class in the event's own order, as the secretary's lists read.
  it("moves the classes in the event's order", () => {
    const ownGroups = new Map([
      ['DERBY', [morning]],
      ['VET10', [morning]],
    ])
    const event = { ownClasses: [{ code: 'VET10' }, { code: 'DERBY' }] }
    const team: EventTeam = { registrationIds: ['d', 'v'] }

    const moves = teamGroupMoves(team, [reserve('d', 'DERBY'), reserve('v', 'VET10')], 'participants', ownGroups, event)

    expect(moves.map(({ eventClass }) => eventClass)).toEqual(['VET10', 'DERBY'])
  })

  it('has no moves for a team already where it is sent', () => {
    expect(teamGroupMoves({ registrationIds: ['a'] }, [running('a')], 'participants', groups, {})).toEqual([])
  })
})

describe('teamDraw', () => {
  /** Draws in the order the teams are listed: a random number that never moves one. */
  const inOrder = () => 0
  const teams: EventTeam[] = [
    { registrationIds: ['a1', 'a2'] },
    { primary: true, registrationIds: ['b1', 'b2'] },
    { registrationIds: ['c1', 'c2'] },
    { primary: true, registrationIds: ['d1', 'd2'] },
  ]
  const entries = ['a1', 'a2', 'b1', 'b2', 'c1', 'c2', 'd1', 'd2'].map((id) => reserve(id))

  it('draws the first teams before the others, as many as the places hold', () => {
    const free = { byClass: new Map([['ALO', 6]]), trial: 6 }

    expect(teamDraw(teams, entries, free, inOrder)).toEqual([1, 3, 0])
  })

  it('skips a team its class has no room for, and takes the next that fits', () => {
    const mixed = [...entries.slice(0, 6), reserve('d1', 'AVO'), reserve('d2', 'AVO')]
    const free = {
      byClass: new Map([
        ['ALO', 4],
        ['AVO', 1],
      ]),
      trial: 6,
    }

    expect(teamDraw(teams, mixed, free, inOrder)).toEqual([1, 0])
  })

  it('counts no place for a member with no class, so a team of such members waits for none', () => {
    const noClass: AssemblyEntry[] = entries.map((entry) =>
      entry.id.startsWith('b') || entry.id === 'a2' ? { ...entry, class: undefined } : entry
    )
    const free = { byClass: new Map([['ALO', 1]]), trial: 1 }

    expect(teamDraw(teams, noClass, free, inOrder)).toEqual([0])
  })

  it('holds to the places of the whole trial too', () => {
    const free = { byClass: new Map([['ALO', 8]]), trial: 3 }

    expect(teamDraw(teams, entries, free, inOrder)).toEqual([1])
  })

  it('leaves a team out of the draw once its dogs are selected', () => {
    const selectedB = entries.map((entry) => (entry.id.startsWith('b') ? running(entry.id) : entry))
    const free = { byClass: new Map([['ALO', 8]]), trial: 8 }

    expect(teamDraw(teams, selectedB, free, inOrder)).toEqual([3, 0, 2])
  })

  it('orders the teams by the random numbers it is given', () => {
    const numbers = [0.9, 0.1, 0.5, 0.3]
    let next = 0
    const random = () => numbers[next++ % numbers.length]
    const free = { byClass: new Map([['ALO', 8]]), trial: 8 }

    expect(teamDraw(teams, entries, free, random)).toEqual(expect.arrayContaining([0, 1, 2, 3]))
    expect(teamDraw(teams, entries, free, random).slice(0, 2).sort()).toEqual([1, 3])
  })
})

// KOE-1722: the places a draw fills, read from the event and the dogs already selected.
describe('teamDrawPlaces', () => {
  const event = {
    classes: [
      { class: 'ALO', date: DAY, places: 4 },
      { class: 'AVO', date: DAY },
    ],
    places: 10,
  }

  it("counts each class's places and the trial's, less the dogs already selected", () => {
    const entries = [running('a'), running('b'), reserve('c'), cancelled('d'), running('e', 'AVO')]
    const free = teamDrawPlaces(event, entries)

    expect(free.trial).toBe(7)
    expect(free.byClass.get('ALO')).toBe(2)
  })

  it('holds a class without places of its own only to the places of the trial', () => {
    expect(teamDrawPlaces(event, []).byClass.get('AVO')).toBe(Number.POSITIVE_INFINITY)
  })

  it('holds a trial without places to its classes only', () => {
    expect(teamDrawPlaces({ ...event, places: 0 }, []).trial).toBe(Number.POSITIVE_INFINITY)
  })
})

// The draw does not read the places of a day (placesPerDay); placing a team it tries does.
describe('teamDayPlacer', () => {
  const DAY2 = '2026-08-02' as const
  const secondDay = { date: DAY2, key: `${DAY2}-ap`, time: 'ap' as const }
  const groups = new Map([['ALO', [morning, secondDay]]])
  const both = (id: string): AssemblyEntry => ({
    ...reserve(id),
    dates: [
      { date: DAY, time: 'ap' },
      { date: DAY2, time: 'ap' },
    ],
  })
  const onSecondDay = (id: string): AssemblyEntry => ({ ...reserve(id), dates: [{ date: DAY2, time: 'ap' }] })
  const teams: EventTeam[] = [{ registrationIds: ['a1', 'a2'] }, { registrationIds: ['b1', 'b2'] }]

  it("moves a team's dogs to the participants, to the group of the day they entered", () => {
    const place = teamDayPlacer(
      teams,
      ['a1', 'a2', 'b1', 'b2'].map((id) => reserve(id)),
      groups,
      {}
    )

    expect(place(1)?.moves).toEqual([{ eventClass: 'ALO', moves: [move('b1'), move('b2')] }])
  })

  it("puts a dog on another day it entered once a day's places are taken, and takes the places only once kept", () => {
    const entries = [both('a1'), both('a2'), reserve('b1')]
    const twoAndOne: EventTeam[] = [teams[0], { registrationIds: ['b1'] }]
    const place = teamDayPlacer(twoAndOne, entries, groups, { placesPerDay: { [DAY]: 1, [DAY2]: 1 } })

    const first = place(0)
    expect(first?.moves).toEqual([{ eventClass: 'ALO', moves: [move('a1'), move('a2', secondDay)] }])
    // Not kept yet: the places are still free for another team.
    expect(place(1)).toBeDefined()
    first?.keep()
    expect(place(1)).toBeUndefined()
  })

  it('places no team with a dog that fits none of its days', () => {
    const entries = [reserve('a1'), reserve('a2')]
    const place = teamDayPlacer(teams, entries, groups, { placesPerDay: { [DAY]: 1, [DAY2]: 5 } })

    expect(place(0)).toBeUndefined()
  })

  // KOE-1722: the draw takes a team's places only once its placing keeps it, so a team passed for its
  // days leaves them to the next team.
  it('leaves the places of a team passed for its days to the next team that fits', () => {
    const satOnly = [reserve('a1'), reserve('a2')]
    const sunday = [onSecondDay('b1'), onSecondDay('b2')]
    const entries = [...satOnly, ...sunday, running('x1'), running('x2')]
    const event = { placesPerDay: { [DAY]: 2, [DAY2]: 2 } }
    const place = teamDayPlacer(teams, entries, groups, event)
    const passed: number[] = []
    const accept = (index: number) => {
      const placed = place(index)
      if (!placed) passed.push(index)
      placed?.keep()
      return !!placed
    }
    const free = { byClass: new Map([['ALO', 2]]), trial: 2 }

    expect(teamDraw(teams, entries, free, () => 0, accept)).toEqual([1])
    expect(passed).toEqual([0])
  })
})

/** A move to a participant group, the first day's morning unless told. */
function move(id: string, group: { date: string; key: string; time?: string } = morning) {
  return { group: { date: group.date, key: group.key, time: group.time }, id }
}
