import { Event, EventClass } from 'koekalenteri-shared/model'

import { eventWithEntryClosing, eventWithEntryNotYetOpen, eventWithEntryOpen } from './__mockData__/events'
import { entryDateColor, parseJSON, registrationDates } from './utils'

describe('utils', () => {
  describe('entryDateColor', () => {
    it('should return proper values based on event status', () => {
      expect(entryDateColor(eventWithEntryNotYetOpen)).toEqual('text.primary')
      expect(entryDateColor(eventWithEntryOpen)).toEqual('success.main')
      expect(entryDateColor(eventWithEntryClosing)).toEqual('warning.main')
    })
  })

  describe('parseJSON', () => {
    it('should parse empty string, null and undefined to undefined', () => {
      expect(parseJSON('')).toBeUndefined()
    })

    it('should revive dates', () => {
      expect(parseJSON('{"pvm":"2021-05-10T09:05:12.000Z"}')).toEqual({
        pvm: new Date("2021-05-10T09:05:12.000Z"),
      })
      expect(parseJSON('{"date":"2021-05-10T00:00:00"}').date).toBeInstanceOf(Date)
    })
  })

  describe('registrationDates', () => {
    it('should return each possible registration date for event without classes', () => {
      const event = {
        startDate: new Date(2020, 1, 1),
        endDate: new Date(2020, 1, 2),
        classes: [] as EventClass[],
      } as Event
      expect(registrationDates(event).length).toEqual(4)
    })

    it('should return each possible registration date for event with classes', () => {
      const event = {
        startDate: new Date(2020, 1, 1),
        endDate: new Date(2020, 1, 3),
        classes: [{
          class: 'ALO',
          date: new Date(2020, 1, 2),
        }],
      } as Event
      expect(registrationDates(event).length).toEqual(2)
    })

    it('should return each possible registration date for event with classes, for a class', () => {
      const event = {
        startDate: new Date(2020, 1, 1),
        endDate: new Date(2020, 1, 3),
        classes: [{
          class: 'ALO',
          date: new Date(2020, 1, 1),
        },
        {
          class: 'ALO',
          date: new Date(2020, 1, 2),
        },
        {
          class: 'ALO',
          date: new Date(2020, 1, 3),
        },
        {
          class: 'VOI',
          date: new Date(2020, 1, 3),
        }],
      } as Event
      expect(registrationDates(event, 'ALO').length).toEqual(6)
      expect(registrationDates(event, 'VOI').length).toEqual(2)
    })

  })
})
