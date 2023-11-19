import type { DogEvent } from '../types'

import { getEventClassesByDays, getEventDays, getUniqueEventClasses } from './event'

describe('lib/event', () => {
  describe('eventDays', () => {
    it.each`
      startDate                | endDate                  | expected
      ${new Date(2023, 0, 1)}  | ${new Date(2023, 0, 1)}  | ${[new Date(2023, 0, 1)]}
      ${new Date(2023, 1, 15)} | ${new Date(2023, 1, 16)} | ${[new Date(2023, 1, 15), new Date(2023, 1, 16)]}
      ${new Date(2023, 2, 10)} | ${new Date(2023, 2, 12)} | ${[new Date(2023, 2, 10), new Date(2023, 2, 11), new Date(2023, 2, 12)]}
    `('returns $expected when event startDate=$startDate and endDate=$endDate', ({ startDate, endDate, expected }) => {
      expect(getEventDays({ startDate, endDate })).toEqual(expected)
    })
  })

  describe('getUniqueEventClasses', () => {
    it.each`
      classes                                                                     | expected
      ${[]}                                                                       | ${[]}
      ${[null, undefined, NaN, {}]}                                               | ${[]}
      ${[{ class: 'ALO' }]}                                                       | ${['ALO']}
      ${[{ class: 'ALO' }, { class: 'ALO' }]}                                     | ${['ALO']}
      ${[{ class: 'ALO' }, { class: 'AVO' }]}                                     | ${['ALO', 'AVO']}
      ${[{ class: 'ALO' }, { class: 'AVO' }, { class: 'AVO' }, { class: 'VOI' }]} | ${['ALO', 'AVO', 'VOI']}
    `('returns $expected for test array #$# ($classes.length items)', ({ classes, expected }) => {
      expect(getUniqueEventClasses({ classes })).toEqual(expected)
    })
  })

  describe('eventClassesByDays', () => {
    describe('for single day event', () => {
      const date = new Date(2023, 11, 24)

      it.each`
        classes                     | expected
        ${[]}                       | ${[{ day: date, classes: [] }]}
        ${[{ class: 'ALO' }]}       | ${[{ day: date, classes: [{ class: 'ALO' }] }]}
        ${[{ class: 'ALO', date }]} | ${[{ day: date, classes: [{ class: 'ALO', date }] }]}
      `(
        'returns day: $expected.0.day, classes.length: $expected.0.classes.length for test $#',
        ({ classes, expected }: { classes: DogEvent['classes']; expected: any }) => {
          expect(getEventClassesByDays({ startDate: date, endDate: date, classes })).toEqual(expected)
        }
      )
    })

    describe('for two day event', () => {
      const startDate = new Date(2023, 11, 23)
      const endDate = new Date(2023, 11, 24)

      it.each`
        classes                                                                                                  | expected
        ${[]}                                                                                                    | ${[{ day: startDate, classes: [] }, { day: endDate, classes: [] }]}
        ${[{ class: 'ALO' }]}                                                                                    | ${[{ day: startDate, classes: [{ class: 'ALO' }] }, { day: endDate, classes: [] }]}
        ${[{ class: 'ALO', date: startDate }]}                                                                   | ${[{ day: startDate, classes: [{ class: 'ALO', date: startDate }] }, { day: endDate, classes: [] }]}
        ${[{ class: 'ALO', date: startDate }, { class: 'ALO', date: endDate }]}                                  | ${[{ day: startDate, classes: [{ class: 'ALO', date: startDate }] }, { day: endDate, classes: [{ class: 'ALO', date: endDate }] }]}
        ${[{ class: 'ALO', date: endDate }, { class: 'AVO', date: endDate }]}                                    | ${[{ day: startDate, classes: [] }, { day: endDate, classes: [{ class: 'ALO', date: endDate }, { class: 'AVO', date: endDate }] }]}
        ${[{ class: 'ALO', date: endDate }, { class: 'AVO', date: endDate }, { class: 'VOI', date: startDate }]} | ${[{ day: startDate, classes: [{ class: 'VOI', date: startDate }] }, { day: endDate, classes: [{ class: 'ALO', date: endDate }, { class: 'AVO', date: endDate }] }]}
      `(
        'returns day: $expected.0.day, classes.length: $expected.0.classes.length, day: $expected.1.day, classes.length: $expected.1.classes.length for test $#',
        ({ classes, expected }: { classes: DogEvent['classes']; expected: any }) => {
          expect(getEventClassesByDays({ startDate, endDate, classes })).toEqual(expected)
        }
      )
    })
  })
})
