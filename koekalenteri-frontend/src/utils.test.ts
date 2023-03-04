import { Event, EventClass } from 'koekalenteri-shared/model'

import { eventWithEntryClosing, eventWithEntryNotYetOpen, eventWithEntryOpen } from './__mockData__/events'
import {
  AnyObject,
  clone,
  entryDateColor,
  hasChanges,
  isEmpty,
  isObject,
  merge,
  parseJSON,
  registrationDates,
  validEmail,
} from './utils'

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
        pvm: new Date('2021-05-10T09:05:12.000Z'),
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
        classes: [
          {
            class: 'ALO',
            date: new Date(2020, 1, 2),
          },
        ],
      } as Event
      expect(registrationDates(event).length).toEqual(2)
    })

    it('should return each possible registration date for event with classes, for a class', () => {
      const event = {
        startDate: new Date(2020, 1, 1),
        endDate: new Date(2020, 1, 3),
        classes: [
          {
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
          },
        ],
      } as Event
      expect(registrationDates(event, 'ALO').length).toEqual(6)
      expect(registrationDates(event, 'VOI').length).toEqual(2)
    })
  })

  describe('isObject', () => {
    it.each([{}, Object.create(null), { something: 'value' }])('should return true for %p', (value) => {
      expect(isObject(value)).toEqual(true)
    })
    it.each([null, undefined, false, true, [], '', 'string'])('should return false for %p', (value) => {
      expect(isObject(value)).toEqual(false)
    })
  })

  describe('isEmpty', () => {
    it('should return true for empty object', () => {
      expect(isEmpty({})).toEqual(true)
      expect(isEmpty(Object.create(null))).toEqual(true)
    })
    it('should return false for non-empty object', () => {
      expect(isEmpty({ notEmpty: 1 })).toEqual(false)
    })
  })

  describe('hasChanges', () => {
    it('should return true when there are changes', () => {
      expect(hasChanges({ a: 'same' }, { a: 'different' })).toEqual(true)
      expect(hasChanges({ a: 'same' }, {})).toEqual(true)
      expect(hasChanges({ a: 'same' }, { b: 'same' })).toEqual(true)
      expect(hasChanges({ a: 'same' }, { a: 'same', b: undefined })).toEqual(true)
      expect(hasChanges({}, { a: 'different' })).toEqual(true)
    })

    it('should return false when objects are equal', () => {
      expect(hasChanges({}, {})).toEqual(false)
      expect(hasChanges({ a: 'same' }, { a: 'same' })).toEqual(false)
    })
  })

  describe('clone', () => {
    it('should create a shallow copy of the object', () => {
      const obj = { a: 1, b: { value: 2 } }
      const copy = clone(obj)
      expect(copy).not.toBe(obj)
      expect(copy).toEqual(obj)
      expect(copy.b).toBe(obj.b)
    })
  })

  describe('merge', () => {
    it('should create a deep merge of the objects', () => {
      const a: AnyObject = { a: 1, c: { x: 1 }, d: { z: null } }
      const b = { b: 2, c: { x: 2 } }
      const result = merge(a, b)
      expect(result).not.toBe(a)
      expect(result).not.toBe(b)
      expect(result).toEqual({ a: 1, b: 2, c: { x: 2 }, d: { z: null } })
    })
    it('should replace arrays', () => {
      const a = { arr: [1, 2] }
      const b = { arr: [3] }
      const result = merge(a, b)
      expect(result).not.toBe(a)
      expect(result).not.toBe(b)
      expect(result).toEqual({ arr: [3] })
      expect(result.arr).toBe(b.arr)
    })
    it('should merge with empty object', () => {
      const a = { value: 'string' }
      expect(merge(a, {})).toEqual({ value: 'string' })
      expect(merge({} as AnyObject, a)).toEqual({ value: 'string' })
      expect(merge(a, Object.create(null))).toEqual({ value: 'string' })
      expect(merge(Object.create(null), a)).toEqual({ value: 'string' })
    })
    it.each([true, false, undefined, null, 1, 'string', [1, 2, 3]])('should merge with %p', (value) => {
      const a: unknown = { obj: true }
      expect(merge(a, value)).toEqual(a)
      expect(merge(value, a)).toEqual(a)
    })
  })

  describe('validEmail', () => {
    it.each(['user@domain.com', 'user.name@domain.fi', 'long.user.name@long.domain.name.blog', 'user@äö.com'])(
      'should return true for %p',
      (value) => {
        expect(validEmail(value)).toEqual(true)
      }
    )
    it.each([
      '',
      '@',
      'a@b',
      'user@-domain.com',
      'user@domain.com-',
      'user@.domain.com',
      'user@domain.com.',
      'user name@domain.com',
      'something@something',
      'äö@domain.com',
      'too.many.parts.in.user.name@domain.com',
      'user@too.many.parts.in.domain.name',
      'user@localhost', // no dot in domain part
    ])('should return false for %p', (value) => {
      expect(validEmail(value)).toEqual(false)
    })
  })
})
