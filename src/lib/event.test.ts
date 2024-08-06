import type { DogEvent, EventClass, RegistrationDate, RegistrationTime } from '../types'

import {
  applyNewGroupsToDogEventClass,
  applyNewGroupsToDogEventDates,
  getEventClassesByDays,
  getEventDays,
  getUniqueEventClasses,
} from './event'

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

  describe('applyNewGroupsToDogEventClass and applyNewGroupsToDogEventDates', () => {
    const date = new Date(2024, 3, 1)
    const date2 = new Date(2024, 3, 2)
    const defaultGroups: RegistrationTime[] = ['ap', 'ip']

    it.each`
      classes                                                     | eventClass | defaultGroups   | newDates                                        | expected
      ${[]}                                                       | ${'ALO'}   | ${[]}           | ${[]}                                           | ${{ classes: [], dates: undefined }}
      ${[{ class: 'ALO', date }]}                                 | ${'ALO'}   | ${['ap', 'ip']} | ${[{ date, time: 'kp' }]}                       | ${{ classes: [{ class: 'ALO', date, groups: ['kp'] }], dates: undefined }}
      ${[{ class: 'ALO', date }]}                                 | ${'ALO'}   | ${['ap', 'ip']} | ${[{ date, time: 'ap' }, { date, time: 'kp' }]} | ${{ classes: [{ class: 'ALO', date, groups: ['kp'] }], dates: undefined }}
      ${[{ class: 'ALO', date, groups: [{ date, time: 'kp' }] }]} | ${'ALO'}   | ${['ap', 'ip']} | ${[{ date, time: 'ap' }]}                       | ${{ classes: [{ class: 'ALO', date, groups: ['ap'] }], dates: undefined }}
    `(
      'returns $expected.classes when classes are $classes, eventClass is $eventClass, defaultGroups are $defaultGroups, newDates are $devDates',
      ({ classes, eventClass, defaultGroups, newDates, expected }) => {
        expect(applyNewGroupsToDogEventClass({ classes }, eventClass, defaultGroups, newDates)).toEqual(expected)
      }
    )

    describe('applyNewGroupsToDogEventClass', () => {
      it('should apply defaults to other classes without groups', () => {
        const classes: EventClass[] = [
          { class: 'ALO', date },
          { class: 'AVO', date, groups: ['ip'] },
          { class: 'VOI', date, groups: ['kp'] },
          { class: 'VOI', date: date2, groups: [] },
        ]
        expect(
          applyNewGroupsToDogEventClass({ classes }, 'VOI', defaultGroups, [{ date, time: 'ap' }, { date: date2 }])
        ).toEqual({
          classes: [
            { class: 'ALO', date, groups: defaultGroups },
            { class: 'AVO', date, groups: ['ip'] },
            { class: 'VOI', date, groups: ['ap'] },
            { class: 'VOI', date: date2, groups: [...defaultGroups] },
          ],
          dates: undefined,
        })
      })
    })

    describe('single class', () => {
      const eventClass = 'ALO'

      it.each`
        existing         | selected              | expected
        ${[]}            | ${[]}                 | ${defaultGroups}
        ${[]}            | ${['ap']}             | ${['ap']}
        ${[]}            | ${['ap', 'ip']}       | ${['ap', 'ip']}
        ${[]}            | ${['ip']}             | ${['ip']}
        ${[]}            | ${['ip', 'kp']}       | ${['kp']}
        ${[]}            | ${['kp']}             | ${['kp']}
        ${[]}            | ${['ap', 'kp']}       | ${['kp']}
        ${[]}            | ${['ap', 'ip', 'kp']} | ${['kp']}
        ${['kp']}        | ${[]}                 | ${defaultGroups}
        ${['kp']}        | ${['ap']}             | ${['ap']}
        ${['kp']}        | ${['ap', 'ip']}       | ${['ap', 'ip']}
        ${['kp']}        | ${['ip']}             | ${['ip']}
        ${['kp']}        | ${['ip', 'kp']}       | ${['ip']}
        ${['kp']}        | ${['kp']}             | ${['kp']}
        ${['kp']}        | ${['ap', 'kp']}       | ${['ap']}
        ${['kp']}        | ${['ap', 'ip', 'kp']} | ${['ap', 'ip']}
        ${defaultGroups} | ${[]}                 | ${['kp']}
        ${defaultGroups} | ${['ap']}             | ${['ap']}
        ${defaultGroups} | ${['ap', 'ip']}       | ${['ap', 'ip']}
        ${defaultGroups} | ${['ip']}             | ${['ip']}
        ${defaultGroups} | ${['ip', 'kp']}       | ${['kp']}
        ${defaultGroups} | ${['kp']}             | ${['kp']}
        ${defaultGroups} | ${['ap', 'kp']}       | ${['kp']}
        ${defaultGroups} | ${['ap', 'ip', 'kp']} | ${['kp']}
      `(
        'it should return groups: $expected when existing=$existing, selected=$selected',
        ({ existing, selected, expected }) => {
          const classes: EventClass[] = [{ class: eventClass, date, groups: existing }]
          const dates: RegistrationDate[] = existing.map((time: RegistrationTime) => ({ date, time }))
          const newDates: RegistrationDate[] = selected.map((time: RegistrationTime) => ({ date, time }))

          expect(applyNewGroupsToDogEventClass({ classes }, eventClass, defaultGroups, newDates)).toEqual({
            classes: [{ class: eventClass, date, groups: expected }],
            dates: undefined,
          })

          expect(
            applyNewGroupsToDogEventDates({ dates, startDate: date, endDate: date }, defaultGroups, newDates)
          ).toEqual({
            classes: [],
            dates: expected.map((time: RegistrationTime) => ({ date, time })),
          })

          // date without any groups selected should receive defaultGroups
          expect(
            applyNewGroupsToDogEventDates({ dates, startDate: date, endDate: date2 }, defaultGroups, newDates)
          ).toEqual({
            classes: [],
            dates: [
              ...expected.map((time: RegistrationTime) => ({ date, time })),
              ...defaultGroups.map((time) => ({ date: date2, time })),
            ],
          })
        }
      )
    })
  })
})
