import { eventWithStaticDates } from '@/__mockData__/events'
import {
  buildEventSavePatch,
  buildResultsPublishedPatch,
  buildStartListClassPublishedPatch,
  buildStartListPublishedPatch,
} from './actions'

describe('buildEventSavePatch', () => {
  it('serializes removed top-level fields as null patch markers', () => {
    const current = { ...eventWithStaticDates, kcId: 123456 }
    const { kcId: _kcId, ...event } = current

    expect(buildEventSavePatch(event, current)).toEqual({
      id: current.id,
      kcId: null,
    })
  })

  it('materializes arrays from sparse form diffs', () => {
    const current = {
      ...eventWithStaticDates,
      classes: [{ class: 'ALO' as const, date: eventWithStaticDates.startDate, places: 1 }],
    }
    const event = {
      ...current,
      classes: [{ class: 'ALO' as const, date: eventWithStaticDates.startDate, places: 2 }],
    }

    // Deliberately an object where the type wants an array, as DynamoDB marshalling can produce
    expect(
      buildEventSavePatch(event, current, { classes: { 0: { places: 2 } } } as unknown as Parameters<
        typeof buildEventSavePatch
      >[2])
    ).toEqual({
      classes: event.classes,
      id: current.id,
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

describe('buildResultsPublishedPatch', () => {
  it('uses an event-level boolean for events without classes (KOE-1464)', () => {
    expect(buildResultsPublishedPatch(eventWithStaticDates, undefined, true)).toEqual({
      id: eventWithStaticDates.id,
      resultsPublished: true,
    })
  })

  it('keeps the other classes when publishing one', () => {
    const event = {
      ...eventWithStaticDates,
      classes: [
        { class: 'ALO' as const, date: eventWithStaticDates.startDate },
        { class: 'AVO' as const, date: eventWithStaticDates.startDate },
      ],
      resultsPublished: { AVO: true },
    }

    expect(buildResultsPublishedPatch(event, 'ALO', true)).toEqual({
      id: eventWithStaticDates.id,
      resultsPublished: { ALO: true, AVO: true },
    })
  })
})
