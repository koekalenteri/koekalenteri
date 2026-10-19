import type { JsonRegistration } from '../types'
import { legacyDayValue } from '../test-utils/finnishDays'
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
        group: { date: '2026-06-01' as const, key: '2026-06-01-ap', number: 1, time: 'ap' as const },
      },
      {
        ...registration('anchor', 1),
        group: { date: '2026-06-01' as const, key: '2026-06-01-ip', number: 1, time: 'ip' as const },
      },
    ]
    const move = {
      beforeId: 'anchor',
      group: { date: '2026-06-01' as const, key: '2026-06-01-ap', time: 'ap' as const },
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
    const participantGroup = { date: '2026-06-01' as const, key: '2026-06-01-ap', time: 'ap' as const }
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

  /**
   * A drawn number belongs to the dog that starts under it. Left on a dog moved back to the reserve
   * list, it showed on the reserve list as the dog's number and sorted the queue by it (KOE-1428).
   */
  it('drops the drawn start number when a dog is moved to the reserve list (KOE-1428)', () => {
    const startGroup = { date: '2026-09-12' as const, key: 'ALO-AP', number: 2, time: 'ap' as const }
    const source: JsonRegistration[] = [
      { ...registration('a', 1), group: { ...startGroup, number: 1 } },
      { ...registration('b', 2), group: { ...startGroup }, startGroup },
    ]
    const result = applyRegistrationGroupMoves(source, [{ group: { key: 'reserve' }, id: 'b' }])

    expect(result.invalid).toEqual([])
    expect(result.items.find((item) => item.id === 'b')).toMatchObject({ group: { key: 'reserve', number: 1 } })
    expect(result.items.find((item) => item.id === 'b')).not.toHaveProperty('startGroup')
    // The source snapshot is the caller's: the patch is computed against it.
    expect(source[1].startGroup).toEqual(startGroup)
  })

  it('keeps the drawn start number on a cancellation and on a move within the list', () => {
    const startGroup = { date: '2026-09-12' as const, key: 'ALO-AP', number: 2, time: 'ap' as const }
    const source: JsonRegistration[] = [
      { ...registration('a', 1), group: { ...startGroup, number: 1 } },
      { ...registration('b', 2), group: { ...startGroup }, startGroup },
    ]

    const cancelled = applyRegistrationGroupMoves(source, [{ group: { key: GROUP_KEY_CANCELLED }, id: 'b' }])
    expect(cancelled.items.find((item) => item.id === 'b')?.startGroup).toEqual(startGroup)

    const moved = applyRegistrationGroupMoves(source, [
      { beforeId: 'a', group: { date: '2026-09-12' as const, key: 'ALO-AP', time: 'ap' as const }, id: 'b' },
    ])
    expect(moved.items.find((item) => item.id === 'b')?.startGroup).toEqual(startGroup)
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

describe("a WT trial's shared reserve list", () => {
  const wtRegistration = (id: string, cls: string, number: number): JsonRegistration =>
    ({
      cancelled: false,
      class: cls,
      eventId: 'event',
      eventType: 'NOWT',
      group: { key: 'reserve', number },
      id,
    }) as JsonRegistration

  it('numbers every class into one queue (KOE-912)', () => {
    const items = normalizeRegistrationGroups([
      wtRegistration('alo-1', 'ALO', 1),
      wtRegistration('avo-1', 'AVO', 1),
      wtRegistration('voi-1', 'VOI', 1),
      wtRegistration('alo-2', 'ALO', 2),
    ])

    expect(items.map((item) => [item.id, item.group?.number])).toEqual([
      ['alo-1', 1],
      ['alo-2', 2],
      ['avo-1', 3],
      ['voi-1', 4],
    ])
  })

  it('closes the gap in the other classes when a dog is raised into its own class', () => {
    const result = applyRegistrationGroupMoves(
      [wtRegistration('alo-1', 'ALO', 1), wtRegistration('avo-1', 'AVO', 2), wtRegistration('voi-1', 'VOI', 3)],
      [{ group: { date: '2021-02-10' as const, key: '2021-02-10-kp', time: 'kp' }, id: 'alo-1' }]
    )

    expect(result.invalid).toEqual([])
    expect(result.items.map((item) => [item.id, item.group?.key, item.group?.number])).toEqual([
      ['avo-1', 'reserve', 1],
      ['voi-1', 'reserve', 2],
      ['alo-1', '2021-02-10-kp', 1],
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

// A start copied by an older CopyEventFunction carries the key of the UTC day: the midnight of
// 15.8. in Helsinki is 14.8. 21:00 UTC, so it was stored as '2026-08-14-ap' while the group view
// (eventRegistrationDateKey) names the group '2026-08-15-ap' (KOE-1541).
describe('a start stored with the UTC day key', () => {
  const HELSINKI_KEY = '2026-08-15-ap'
  const HELSINKI_GROUP = { date: legacyDayValue('2026-08-14T21:00:00.000Z'), key: HELSINKI_KEY, time: 'ap' as const }

  const start = (
    id: string,
    number: number,
    key = '2026-08-14-ap',
    date = legacyDayValue('2026-08-14T21:00:00.000Z')
  ) => ({
    ...registration(id, number),
    group: { date, key, number, time: 'ap' as const },
  })
  const reserve = (id: string) => registration(id, 1)

  it('accepts a start with the UTC key as the anchor of a move', () => {
    const result = applyRegistrationGroupMoves(
      [start('a', 1), start('b', 2, HELSINKI_KEY), reserve('c')],
      [{ beforeId: 'a', group: HELSINKI_GROUP, id: 'c' }]
    )

    expect(result.invalid).toEqual([])
    expect(result.items.map((item) => [item.id, item.group?.number])).toEqual([
      ['c', 1],
      ['a', 2],
      ['b', 3],
    ])
  })

  it('accepts a payload that still names the UTC day (a cached client)', () => {
    const result = applyRegistrationGroupMoves(
      [start('a', 1), start('b', 2), reserve('c')],
      [{ beforeId: 'b', group: { ...HELSINKI_GROUP, key: '2026-08-14-ap' }, id: 'c' }]
    )

    expect(result.invalid).toEqual([])
    expect(result.items.map((item) => item.id)).toEqual(['a', 'c', 'b'])
    expect(result.items.every((item) => item.group?.key === HELSINKI_KEY)).toBe(true)
  })

  it('puts a dog moved to the end of the group last, after the UTC-keyed starts', () => {
    const result = applyRegistrationGroupMoves(
      [start('a', 1), start('b', 2), reserve('c')],
      [{ group: HELSINKI_GROUP, id: 'c' }]
    )

    expect(result.invalid).toEqual([])
    expect(result.items.map((item) => [item.id, item.group?.number])).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ])
  })

  it('moves a UTC-keyed start before another start of its group', () => {
    const result = applyRegistrationGroupMoves(
      [start('a', 1), start('b', 2), start('c', 3)],
      [{ beforeId: 'a', group: HELSINKI_GROUP, id: 'c' }]
    )

    expect(result.invalid).toEqual([])
    expect(result.items.map((item) => item.id)).toEqual(['c', 'a', 'b'])
  })

  it('treats two instants of the same Helsinki day and time as one group', () => {
    const result = applyRegistrationGroupMoves(
      [start('a', 1), start('b', 2, HELSINKI_KEY, legacyDayValue('2026-08-15T00:00:00.000Z')), reserve('c')],
      [{ group: HELSINKI_GROUP, id: 'c' }]
    )

    expect(result.invalid).toEqual([])
    expect(result.items.map((item) => [item.id, item.group?.number])).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ])
  })

  it('accepts as the anchor a start whose date is another instant of the same day', () => {
    const result = applyRegistrationGroupMoves(
      [start('a', 1), start('b', 2, HELSINKI_KEY, legacyDayValue('2026-08-15T00:00:00.000Z')), reserve('c')],
      [{ beforeId: 'b', group: HELSINKI_GROUP, id: 'c' }]
    )

    expect(result.invalid).toEqual([])
    expect(result.items.map((item) => item.id)).toEqual(['a', 'c', 'b'])
  })

  it('still rejects an anchor of another time on the same day', () => {
    const other = {
      ...start('x', 1),
      group: { date: HELSINKI_GROUP.date, key: HELSINKI_KEY, number: 1, time: 'ip' as const },
    }
    const move = { beforeId: 'x', group: HELSINKI_GROUP, id: 'c' }

    expect(applyRegistrationGroupMoves([other, reserve('c')], [move]).invalid).toEqual([move])
  })

  it('has its key respelled by normalization, keeping the order and numbers', () => {
    const normalized = normalizeRegistrationGroups([start('a', 1), start('b', 2)])

    expect(normalized.map((item) => [item.id, item.group?.key, item.group?.number])).toEqual([
      ['a', HELSINKI_KEY, 1],
      ['b', HELSINKI_KEY, 2],
    ])
  })

  it('keeps the key of a start without a time, and a cancelled entry in the cancelled group', () => {
    const noTime = {
      ...registration('n', 1),
      group: { date: legacyDayValue('2026-08-14T21:00:00.000Z'), key: 'x-key', number: 1 },
    }
    const cancelled = { ...start('k', 1), cancelled: true }

    const normalized = normalizeRegistrationGroups([noTime, cancelled])

    expect(normalized.find((item) => item.id === 'n')?.group?.key).toBe('x-key')
    expect(normalized.find((item) => item.id === 'k')?.group?.key).toBe(GROUP_KEY_CANCELLED)
  })
})
