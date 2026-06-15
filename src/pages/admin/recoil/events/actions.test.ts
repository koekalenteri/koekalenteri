import { eventWithStaticDates } from '../../../../__mockData__/events'
import { buildEventSavePatch } from './actions'

describe('buildEventSavePatch', () => {
  it('serializes removed top-level fields as null patch markers', () => {
    const current = { ...eventWithStaticDates, kcId: 123456 }
    const { kcId: _kcId, ...event } = current

    expect(buildEventSavePatch(event, current)).toEqual({
      id: current.id,
      kcId: null,
    })
  })
})
