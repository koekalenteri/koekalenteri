import { eventWithStaticDates } from '../../../../__mockData__/events'
import { buildEventSavePatch, buildStartListClassPublishedPatch, buildStartListPublishedPatch } from './actions'

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

describe('buildStartListClassPublishedPatch', () => {
  it('preserves legacy event-level published state for other classes when unpublishing one class', () => {
    expect(
      buildStartListClassPublishedPatch(
        {
          ...eventWithStaticDates,
          classes: [
            { class: 'ALO', date: eventWithStaticDates.startDate },
            { class: 'AVO', date: eventWithStaticDates.startDate },
          ],
          startListPublished: true,
        },
        'ALO',
        false
      )
    ).toEqual({
      id: eventWithStaticDates.id,
      startListPublished: { ALO: false, AVO: true },
    })
  })
})

describe('buildStartListPublishedPatch', () => {
  it('uses an event-level boolean for events without classes', () => {
    expect(buildStartListPublishedPatch(eventWithStaticDates, false)).toEqual({
      id: eventWithStaticDates.id,
      startListPublished: false,
    })
  })
})
