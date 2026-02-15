import type { DogEvent, EventClass, EventState, RegistrationDate, RegistrationTime } from '../types'
import { TZDate } from '@date-fns/tz'
import { addDays, differenceInDays } from 'date-fns'
import { eventWithEntryClosing, eventWithParticipantsInvited } from '../__mockData__/events'
import { formatDate, TIME_ZONE } from '../i18n/dates'
import {
  applyNewGroupsToDogEventClass,
  applyNewGroupsToDogEventDates,
  copyDogEvent,
  defaultEntryEndDate,
  defaultEntryStartDate,
  eventRegistrationDateKey,
  getEventClassesByDays,
  getEventDays,
  getUniqueEventClasses,
  isDetaultEntryEndDate,
  isDetaultEntryStartDate,
  isEventDeletable,
  isStartListAvailable,
  newEventEntryEndDate,
  newEventEntryStartDate,
  newEventStartDate,
  sanitizeDogEvent,
} from './event'

describe('lib/event', () => {
  describe('isStartListPublished', () => {
    it.each<EventState>([
      'invited',
      'started',
      'ended',
      'completed',
    ])('Should return true when state is %p and startListPublished is undefined or true', (state) => {
      expect(isStartListAvailable({ state })).toEqual(true)
      expect(isStartListAvailable({ startListPublished: true, state })).toEqual(true)
    })

    it.each<EventState>([
      'invited',
      'started',
      'ended',
      'completed',
    ])('Should return false when state is %p and startListPublished is false', (state) => {
      expect(isStartListAvailable({ startListPublished: false, state })).toEqual(false)
    })

    it.each<EventState>([
      'draft',
      'tentative',
      'cancelled',
      'confirmed',
      'picked',
    ])('Should return false when state is %p', (state) => {
      expect(isStartListAvailable({ state })).toEqual(false)
    })
  })

  describe('isEventDeletable', () => {
    it.each<EventState>(['draft', 'tentative', 'cancelled'])('Should return true when event state is %p', (state) => {
      expect(isEventDeletable({ state })).toEqual(true)
    })
    it.each<EventState>([
      'completed',
      'confirmed',
      'ended',
      'invited',
      'picked',
      'started',
    ])('Should return false when event state is %p', (state) => {
      expect(isEventDeletable({ state })).toEqual(false)
    })
    it('should return false when event is undefined', () => {
      expect(isEventDeletable()).toEqual(false)
    })
  })

  describe('eventDays', () => {
    it.each`
      startDate                | endDate                  | expected
      ${new Date(2023, 0, 1)}  | ${new Date(2023, 0, 1)}  | ${[new TZDate(2023, 0, 1, TIME_ZONE)]}
      ${new Date(2023, 1, 15)} | ${new Date(2023, 1, 16)} | ${[new TZDate(2023, 1, 15, TIME_ZONE), new TZDate(2023, 1, 16, TIME_ZONE)]}
      ${new Date(2023, 2, 10)} | ${new Date(2023, 2, 12)} | ${[new TZDate(2023, 2, 10, TIME_ZONE), new TZDate(2023, 2, 11, TIME_ZONE), new TZDate(2023, 2, 12, TIME_ZONE)]}
    `('returns $expected when event startDate=$startDate and endDate=$endDate', ({ startDate, endDate, expected }) => {
      expect(getEventDays({ endDate, startDate })).toEqual(expected)
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

    it('should return empty array when there are no classes', () => {
      expect(getUniqueEventClasses({} as any)).toEqual([])
    })
  })

  describe('getEventClassesByDays', () => {
    describe('for single day event', () => {
      const date = new TZDate(2023, 11, 24, TIME_ZONE)

      it.each`
        classes                     | expected
        ${[]}                       | ${[{ classes: [], day: date }]}
        ${[{ class: 'ALO' }]}       | ${[{ classes: [{ class: 'ALO' }], day: date }]}
        ${[{ class: 'ALO', date }]} | ${[{ classes: [{ class: 'ALO', date }], day: date }]}
      `(
        'returns day: $expected.0.day, classes.length: $expected.0.classes.length for test $#',
        ({ classes, expected }: { classes: DogEvent['classes']; expected: any }) => {
          expect(getEventClassesByDays({ classes, endDate: date, startDate: date })).toEqual(expected)
        }
      )
    })

    describe('for two day event', () => {
      const startDate = new TZDate(2023, 11, 23, TIME_ZONE)
      const endDate = new TZDate(2023, 11, 24, TIME_ZONE)

      it.each`
        classes                                                                 | expected
        ${[]}                                                                   | ${[{ classes: [], day: startDate }, { classes: [], day: endDate }]}
        ${[{ class: 'ALO' }]}                                                   | ${[{ classes: [{ class: 'ALO' }], day: startDate }, { classes: [], day: endDate }]}
        ${[{ class: 'ALO', date: startDate }]}                                  | ${[{ classes: [{ class: 'ALO', date: startDate }], day: startDate }, { classes: [], day: endDate }]}
        ${[{ class: 'ALO', date: startDate }, { class: 'ALO', date: endDate }]} | ${[{ classes: [{ class: 'ALO', date: startDate }], day: startDate }, { classes: [{ class: 'ALO', date: endDate }], day: endDate }]}
        ${[{ class: 'ALO', date: endDate }, { class: 'AVO', date: endDate }]} | ${[{ classes: [], day: startDate }, { classes: [{ class: 'ALO', date: endDate }, { class: 'AVO', date: endDate }], day: endDate }]}
        ${[{ class: 'ALO', date: endDate }, { class: 'AVO', date: endDate }, { class: 'VOI', date: startDate }]} | ${[{ classes: [{ class: 'VOI', date: startDate }], day: startDate }, { classes: [{ class: 'ALO', date: endDate }, { class: 'AVO', date: endDate }], day: endDate }]}
      `(
        'returns day: $expected.0.day, classes.length: $expected.0.classes.length, day: $expected.1.day, classes.length: $expected.1.classes.length for test $#',
        ({ classes, expected }: { classes: DogEvent['classes']; expected: any }) => {
          expect(getEventClassesByDays({ classes, endDate, startDate })).toEqual(expected)
        }
      )
    })

    it('should return empty empty array as classes when classes is missing', () => {
      const date = new TZDate(2025, 2, 27, TIME_ZONE)
      expect(getEventClassesByDays({ endDate: date, startDate: date } as any)).toEqual([{ classes: [], day: date }])
    })
  })

  describe('applyNewGroupsToDogEventClass and applyNewGroupsToDogEventDates', () => {
    const date = new TZDate(2024, 3, 1, TIME_ZONE)
    const date2 = new TZDate(2024, 3, 2, TIME_ZONE)
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
            applyNewGroupsToDogEventDates({ dates, endDate: date, startDate: date }, defaultGroups, newDates)
          ).toEqual({
            classes: [],
            dates: expected.map((time: RegistrationTime) => ({ date, time })),
          })

          // date without any groups selected should receive defaultGroups
          expect(
            applyNewGroupsToDogEventDates({ dates, endDate: date2, startDate: date }, defaultGroups, newDates)
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

  describe('copyDogEvent', () => {
    it('should remove id', () => expect(copyDogEvent(eventWithParticipantsInvited).id).toEqual(''))
    it('should add "Kopio - " to name', () =>
      expect(copyDogEvent(eventWithParticipantsInvited).name.startsWith('Kopio -')).toBeTruthy())
    it('should set state to draft', () => expect(copyDogEvent(eventWithParticipantsInvited).state).toEqual('draft'))
    it('should reset entries and members', () => {
      const copy = copyDogEvent({ ...eventWithParticipantsInvited, entries: 15, members: 10 })
      expect(copy.entries).toBe(0)
      expect(copy.members).toBe(0)
    })
    it('should set startDate', () =>
      expect(copyDogEvent(eventWithParticipantsInvited).startDate).toEqual(newEventStartDate))
    it('should set endDate', () =>
      expect(copyDogEvent(eventWithParticipantsInvited).endDate).toEqual(newEventStartDate))
    it('should set endDate on two day event', () =>
      expect(copyDogEvent(eventWithEntryClosing).endDate).toEqual(addDays(newEventStartDate, 1)))
    it('should set entryStartDate / entryEndDate', () => {
      const copy = copyDogEvent({ ...eventWithParticipantsInvited, entryOrigEndDate: new Date() })
      expect(copy.entryStartDate).toEqual(newEventEntryStartDate)
      expect(copy.entryEndDate).toEqual(newEventEntryEndDate)
      expect(copy.entryOrigEndDate).toBeUndefined()
    })
    it('should update classes', () => {
      const copy = copyDogEvent(eventWithParticipantsInvited)
      expect(copy.classes.length).toBe(2)
      for (let i = 0; i < 2; i++) {
        expect(copy.classes[i].places).toBe(eventWithParticipantsInvited.classes[i].places)
        expect(copy.classes[i].entries).toBe(0)
        expect(copy.classes[i].members).toBe(0)
        expect(copy.classes[i].date).toEqual(newEventStartDate)
      }
    })
    it('should update class dates on muptiple day event', () => {
      const copy = copyDogEvent({
        ...eventWithEntryClosing,
        classes: [
          { class: 'ALO', date: eventWithEntryClosing.startDate, places: 2 },
          { class: 'ALO', date: eventWithEntryClosing.endDate, places: 12 },
        ],
      })
      expect(copy.classes[0].date).toEqual(copy.startDate)
      expect(copy.classes[1].date).toEqual(copy.endDate)
    })

    it('should update dates', () => {
      const copy = copyDogEvent({
        ...eventWithEntryClosing,
        dates: [
          { date: eventWithEntryClosing.startDate, time: 'ap' },
          { date: eventWithEntryClosing.endDate, time: 'ip' },
        ],
      })

      expect(copy.dates?.length).toBe(2)
      expect(copy.dates?.[0].date).toEqual(copy.startDate)
      expect(copy.dates?.[1].date).toEqual(copy.endDate)
    })

    it('should copy and adjust placesPerDay', () => {
      // Create an event with placesPerDay
      const origStartDate = new Date(2023, 5, 15) // June 15, 2023
      const origEndDate = new Date(2023, 5, 16) // June 16, 2023
      const event = {
        ...eventWithEntryClosing,
        endDate: origEndDate,
        placesPerDay: {
          '2023-06-15': 10, // First day
          '2023-06-16': 15, // Second day
        },
        startDate: origStartDate,
      }

      const copy = copyDogEvent(event)

      // Calculate expected dates based on the day difference
      const dayDiff = differenceInDays(newEventStartDate, origStartDate)
      const expectedFirstDate = formatDate(addDays(origStartDate, dayDiff), 'yyyy-MM-dd')
      const expectedSecondDate = formatDate(addDays(origEndDate, dayDiff), 'yyyy-MM-dd')

      // Verify placesPerDay was copied and dates were adjusted
      expect(copy.placesPerDay).toBeDefined()
      expect(Object.keys(copy.placesPerDay!).length).toBe(2)
      expect(copy.placesPerDay?.[expectedFirstDate]).toBe(10)
      expect(copy.placesPerDay?.[expectedSecondDate]).toBe(15)
    })
  })
})

describe('defaultEntryStartDate and defaultEntryEndDate', () => {
  it('should calculate correct entry start date', () => {
    const eventStartDate = new Date(2023, 5, 15) // June 15, 2023
    const expectedStartDate = new Date(2023, 5, 15)
    expectedStartDate.setDate(expectedStartDate.getDate() - 6 * 7) // 6 weeks before

    expect(defaultEntryStartDate(eventStartDate).getTime()).toEqual(expectedStartDate.getTime())
  })

  it('should calculate correct entry end date', () => {
    const eventStartDate = new Date(2023, 5, 15) // June 15, 2023
    const expectedEndDate = new Date(2023, 5, 15)
    expectedEndDate.setDate(expectedEndDate.getDate() - 3 * 7) // 3 weeks before

    expect(defaultEntryEndDate(eventStartDate).getTime()).toEqual(expectedEndDate.getTime())
  })
})

describe('isDetaultEntryStartDate and isDetaultEntryEndDate', () => {
  it('should return true when date is undefined', () => {
    const eventStartDate = new Date(2023, 5, 15)
    expect(isDetaultEntryStartDate(undefined, eventStartDate)).toBe(true)
    expect(isDetaultEntryEndDate(undefined, eventStartDate)).toBe(true)
  })

  it('should return true when date matches default entry start date', () => {
    const eventStartDate = new Date(2023, 5, 15)
    const entryStartDate = defaultEntryStartDate(eventStartDate)

    expect(isDetaultEntryStartDate(entryStartDate, eventStartDate)).toBe(true)
  })

  it('should return true when date matches default entry end date', () => {
    const eventStartDate = new Date(2023, 5, 15)
    const entryEndDate = defaultEntryEndDate(eventStartDate)

    expect(isDetaultEntryEndDate(entryEndDate, eventStartDate)).toBe(true)
  })

  it('should return false when date does not match default entry start date', () => {
    const eventStartDate = new Date(2023, 5, 15)
    const nonDefaultDate = new Date(2023, 4, 1) // May 1, 2023

    expect(isDetaultEntryStartDate(nonDefaultDate, eventStartDate)).toBe(false)
  })

  it('should return false when date does not match default entry end date', () => {
    const eventStartDate = new Date(2023, 5, 15)
    const nonDefaultDate = new Date(2023, 4, 1) // May 1, 2023

    expect(isDetaultEntryEndDate(nonDefaultDate, eventStartDate)).toBe(false)
  })
})

describe('eventRegistrationDateKey', () => {
  it('should generate a key in the format date-time', () => {
    const date = new Date(2023, 5, 15, 12) // June 15, 2023
    const time = 'ap'
    const registrationDate: RegistrationDate = { date, time }

    // Expected format: YYYY-MM-DD-time
    const expected = '2023-06-15-ap'

    expect(eventRegistrationDateKey(registrationDate)).toEqual(expected)
  })

  it('should use event timezone (Europe/Helsinki) day, not UTC day', () => {
    // Helsinki summer time is +03:00.
    // This instant is June 15th in Helsinki, but still June 14th in UTC.
    const date = new Date('2023-06-15T00:30:00+03:00')
    expect(date.toISOString().slice(0, 10)).toEqual('2023-06-14') // would be wrong key if used

    expect(eventRegistrationDateKey({ date, time: 'ap' })).toEqual('2023-06-15-ap')
  })

  it('should handle different times', () => {
    const date = new Date(2023, 5, 15, 12)

    expect(eventRegistrationDateKey({ date, time: 'ap' })).toEqual('2023-06-15-ap')
    expect(eventRegistrationDateKey({ date, time: 'ip' })).toEqual('2023-06-15-ip')
    expect(eventRegistrationDateKey({ date, time: 'kp' })).toEqual('2023-06-15-kp')
  })

  it('should handle different dates', () => {
    const time = 'ap'

    expect(eventRegistrationDateKey({ date: new Date(2023, 0, 1, 12), time })).toEqual('2023-01-01-ap')
    expect(eventRegistrationDateKey({ date: new Date(2023, 11, 31, 12), time })).toEqual('2023-12-31-ap')
  })
})

describe('sanitizeDogEvent', () => {
  it('should remove private fields from event', () => {
    const event = {
      createdBy: 'user-1',
      deletedAt: new Date(),
      deletedBy: 'user-2',
      headquarters: { zipCode: '12345' },
      id: 'event-1',
      invitationAttachment: 'attachment.pdf',
      kcId: 12345,
      modifiedBy: 'user-3',
      name: 'Test Event',
      official: 'official-info',
      publicField1: 'public-value-1',
      publicField2: 'public-value-2',
      secretary: 'secretary-info',
    }

    const sanitized = sanitizeDogEvent(event as any)

    // Check that private fields are removed
    expect(sanitized.createdBy).toBeUndefined()
    expect(sanitized.deletedAt).toBeUndefined()
    expect(sanitized.deletedBy).toBeUndefined()
    expect(sanitized.headquarters).toBeUndefined()
    expect(sanitized.kcId).toBeUndefined()
    expect(sanitized.invitationAttachment).toBeUndefined()
    expect(sanitized.modifiedBy).toBeUndefined()
    expect(sanitized.secretary).toBeUndefined()
    expect(sanitized.official).toBeUndefined()

    // Check that public fields are preserved
    expect(sanitized.id).toEqual('event-1')
    expect(sanitized.name).toEqual('Test Event')
    expect((sanitized as any).publicField1).toEqual('public-value-1')
    expect((sanitized as any).publicField2).toEqual('public-value-2')
  })

  it('should handle empty event object', () => {
    const event = { id: 'event-1' }
    const sanitized = sanitizeDogEvent(event as any)

    expect(sanitized).toEqual({ id: 'event-1' })
  })

  it('should handle event with only private fields', () => {
    const event = {
      createdBy: 'user-1',
      deletedAt: new Date(),
      deletedBy: 'user-2',
      headquarters: { zipCode: '12345' },
      invitationAttachment: 'attachment.pdf',
      kcId: 12345,
      modifiedBy: 'user-3',
      official: 'official-info',
      secretary: 'secretary-info',
    }

    const sanitized = sanitizeDogEvent(event as any)

    expect(sanitized).toEqual({})
  })
})
