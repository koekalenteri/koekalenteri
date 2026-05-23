import {
  buildConnectionCountPayload,
  buildEventPatchPayload,
  buildEventViewersPayload,
  buildRegistrationPatchPayload,
  toEventViewers,
} from './payloads'

describe('ws/payloads', () => {
  it('buildEventPatchPayload returns event id with patch fields', () => {
    const result = buildEventPatchPayload('e1', {
      classes: [{ id: 'c1' }] as any,
      entries: [{ id: 'entry-1' }] as any,
    })

    expect(result).toEqual({
      classes: [{ id: 'c1' }],
      entries: [{ id: 'entry-1' }],
      eventId: 'e1',
    })
  })

  it('buildRegistrationPatchPayload wraps patch array with event id', () => {
    const patch = [{ dog: { name: 'Nelli' }, id: 'r1' }] as any
    expect(buildRegistrationPatchPayload('e1', patch)).toEqual({ eventId: 'e1', patch })
  })

  it('buildEventViewersPayload returns admin scope payload', () => {
    const viewers = [{ userId: 'u1' }, { userId: 'u2' }]
    expect(buildEventViewersPayload('e1', viewers)).toEqual({
      eventId: 'e1',
      scope: 'admin:event-viewers',
      viewers,
    })
  })

  it('buildConnectionCountPayload returns public scoped count object', () => {
    expect(buildConnectionCountPayload('public:connection-count', 3)).toEqual({
      count: 3,
      scope: 'public:connection-count',
    })
  })

  it('buildConnectionCountPayload returns admin scoped count object', () => {
    expect(buildConnectionCountPayload('admin:connection-count', 2)).toEqual({
      count: 2,
      scope: 'admin:connection-count',
    })
  })

  it('toEventViewers filters missing ids, deduplicates, and sorts by user id', () => {
    const connections = [
      { connectionId: 'c1', userId: 'matti' },
      { connectionId: 'c2' },
      { connectionId: 'c3', userId: 'anna' },
      { connectionId: 'c4', userId: 'matti' },
      { connectionId: 'c5', userId: 'åke' },
    ] as any

    expect(toEventViewers(connections)).toEqual([{ userId: 'anna' }, { userId: 'matti' }, { userId: 'åke' }])
  })
})
