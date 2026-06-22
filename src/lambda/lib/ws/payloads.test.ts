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
    const viewers = [
      { name: 'User One', userId: 'u1' },
      { name: 'User Two', userId: 'u2' },
    ]
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

  it('toEventViewers returns distinct viewers in connection order', () => {
    const connections = [
      { connectionId: 'c1', userId: 'matti', userName: 'Matti Meikäläinen' },
      { connectionId: 'c2' },
      { connectionId: 'c3', userEmail: 'anna@example.com', userId: 'anna' },
      { connectionId: 'c4', userEmail: 'other@example.com', userId: 'matti', userName: 'Other Matti' },
      { connectionId: 'c5', userId: 'åke' },
    ] as any

    expect(toEventViewers(connections)).toEqual([
      { name: 'Matti Meikäläinen', userId: 'matti' },
      { name: 'anna@example.com', userId: 'anna' },
      { name: 'åke', userId: 'åke' },
    ])
  })
})
