import type { JsonRegistration } from '../types'
import { GROUP_KEY_CANCELLED } from './registration'
import { applyRegistrationGroupMoves, normalizeRegistrationGroups } from './registrationGroups'

const registration = (id: string, number: number): JsonRegistration =>
  ({
    cancelled: false,
    class: 'ALO',
    eventId: 'event',
    eventType: 'NOME-B',
    group: { key: 'reserve', number },
    id,
  }) as JsonRegistration

describe('applyRegistrationGroupMoves', () => {
  it('inserts before an anchor and normalizes the complete snapshot', () => {
    const result = applyRegistrationGroupMoves(
      [registration('a', 1), registration('b', 2), registration('c', 3)],
      [{ beforeId: 'a', group: { key: 'reserve' }, id: 'c' }]
    )

    expect(result.invalid).toEqual([])
    expect(result.items.map((item) => [item.id, item.group?.number])).toEqual([
      ['c', 1],
      ['a', 2],
      ['b', 3],
    ])
  })

  it('reports an invalid anchor without changing the snapshot', () => {
    const source = [registration('a', 1)]
    const move = { beforeId: 'missing', group: { key: 'reserve' }, id: 'a' }
    const result = applyRegistrationGroupMoves(source, [move])

    expect(result.invalid).toEqual([move])
    expect(result.items).toEqual(source)
  })

  it('rejects an anchor from another reserve numbering group', () => {
    const source = [registration('alo', 1), { ...registration('avo', 1), class: 'AVO' as const }]
    const move = { beforeId: 'avo', group: { key: 'reserve' }, id: 'alo' }

    const result = applyRegistrationGroupMoves(source, [move])

    expect(result.invalid).toEqual([move])
    expect(result.items).toEqual(source)
  })

  it('rejects an anchor in another participant date or time group', () => {
    const source = [
      {
        ...registration('target', 1),
        group: { date: '2026-06-01', key: '2026-06-01-ap', number: 1, time: 'ap' as const },
      },
      {
        ...registration('anchor', 1),
        group: { date: '2026-06-01', key: '2026-06-01-ip', number: 1, time: 'ip' as const },
      },
    ]
    const move = {
      beforeId: 'anchor',
      group: { date: '2026-06-01', key: '2026-06-01-ap', time: 'ap' as const },
      id: 'target',
    }

    const result = applyRegistrationGroupMoves(source, [move])

    expect(result.invalid).toEqual([move])
    expect(result.items.find((item) => item.id === 'target')?.group).toEqual(source[0].group)
  })

  it('keeps registrations without a group in the reserve group', () => {
    const source = [{ ...registration('unassigned', 1), group: undefined }, registration('moved', 1)]

    const result = applyRegistrationGroupMoves(source, [{ group: { key: 'reserve' }, id: 'moved' }])

    expect(result.items.find((item) => item.id === 'unassigned')?.group?.key).toBe('reserve')
  })

  it('uses the cancelled group key for cancelled registrations', () => {
    const source = [
      { ...registration('cancelled', 1), cancelled: true, group: { key: 'reserve', number: 1 } },
      registration('moved', 1),
    ]

    const result = applyRegistrationGroupMoves(source, [{ group: { key: 'reserve' }, id: 'moved' }])

    expect(result.items.find((item) => item.id === 'cancelled')?.group?.key).toBe(GROUP_KEY_CANCELLED)
  })

  it('clears the cancellation reason when moving out of the cancelled group', () => {
    const source = [
      {
        ...registration('cancelled', 1),
        cancelled: true,
        cancelReason: 'Unable to attend',
        group: { key: 'cancelled', number: 1 },
      },
    ]

    const result = applyRegistrationGroupMoves(source, [{ group: { key: 'reserve' }, id: 'cancelled' }])

    expect(result.items[0]).toMatchObject({ cancelled: false, group: { key: 'reserve' } })
    expect(result.items[0]).not.toHaveProperty('cancelReason')
  })

  it('keeps the established ordering when registrations have no class', () => {
    const participantGroup = { date: '2026-06-01', key: '2026-06-01-ap', time: 'ap' as const }
    const source = [
      { ...registration('first', 1), class: undefined, eventType: 'ZZZ', group: { ...participantGroup, number: 1 } },
      { ...registration('second', 2), class: undefined, eventType: 'AAA', group: { ...participantGroup, number: 2 } },
      { ...registration('moved', 3), class: undefined, eventType: 'ZZZ', group: { ...participantGroup, number: 3 } },
    ]

    const result = applyRegistrationGroupMoves(source, [{ group: participantGroup, id: 'moved' }])

    expect(result.items.map((item) => [item.id, item.group?.number])).toEqual([
      ['first', 1],
      ['second', 2],
      ['moved', 3],
    ])
  })

  it('moves a registration across groups and clears cancellation', () => {
    const source = [
      registration('reserve', 1),
      { ...registration('participant', 1), group: { key: '2026-01-01-ap', number: 1 } },
    ]

    const result = applyRegistrationGroupMoves(source, [
      { beforeId: 'participant', group: { key: '2026-01-01-ap' }, id: 'reserve' },
    ])

    expect(result.items.find((item) => item.id === 'reserve')).toMatchObject({
      cancelled: false,
      group: { key: '2026-01-01-ap', number: 1 },
    })
  })

  it('moves a registration to cancelled with its reason', () => {
    const result = applyRegistrationGroupMoves(
      [registration('a', 1)],
      [{ cancelReason: 'withdrawn', group: { key: GROUP_KEY_CANCELLED }, id: 'a' }]
    )

    expect(result.items[0]).toMatchObject({
      cancelled: true,
      cancelReason: 'withdrawn',
      group: { key: GROUP_KEY_CANCELLED, number: 1 },
    })
  })

  it('applies a batch of moves before normalizing all affected groups', () => {
    const source = [registration('a', 1), registration('b', 2), registration('c', 3)]

    const result = applyRegistrationGroupMoves(source, [
      { beforeId: 'a', group: { key: 'reserve' }, id: 'c' },
      { group: { key: 'reserve' }, id: 'b' },
    ])

    expect(result.items.map((item) => [item.id, item.group?.number])).toEqual([
      ['c', 1],
      ['a', 2],
      ['b', 3],
    ])
  })

  it('preserves move order when multiple moves share an anchor', () => {
    const source = [registration('a', 1), registration('b', 2), registration('c', 3), registration('d', 4)]

    const result = applyRegistrationGroupMoves(source, [
      { beforeId: 'a', group: { key: 'reserve' }, id: 'c' },
      { beforeId: 'a', group: { key: 'reserve' }, id: 'd' },
    ])

    expect(result.items.map((item) => [item.id, item.group?.number])).toEqual([
      ['c', 1],
      ['d', 2],
      ['a', 3],
      ['b', 4],
    ])
  })
})

describe('normalizeRegistrationGroups', () => {
  it('uses the same missing-number ordering as move normalization', () => {
    const source = [
      registration('numbered', 1000),
      { ...registration('unassigned', 1), group: { key: 'reserve' } as JsonRegistration['group'] },
    ]

    const normalized = normalizeRegistrationGroups(source)
    const moved = applyRegistrationGroupMoves(
      [
        registration('numbered', 1000),
        { ...registration('unassigned', 1), group: { key: 'reserve' } as JsonRegistration['group'] },
      ],
      [{ group: { key: 'reserve' }, id: 'numbered' }]
    ).items

    expect(normalized.map((item) => item.id)).toEqual(['numbered', 'unassigned'])
    expect(moved.map((item) => item.id)).toEqual(['numbered', 'unassigned'])
  })
})
