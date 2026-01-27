import { subMinutes } from 'date-fns'

import { createDogUpdateFromFormValues, isValidDob, shouldAllowRefresh } from './dog'

describe('dog utility functions', () => {
  describe('shouldAllowRefresh', () => {
    it('should return false if dog has no regNo', () => {
      expect(shouldAllowRefresh({})).toBe(false)
      expect(shouldAllowRefresh({ name: 'Test Dog' })).toBe(false)
    })

    it('should return false if dog was refreshed less than 5 minutes ago', () => {
      const refreshDate = subMinutes(new Date(), 3)
      expect(shouldAllowRefresh({ regNo: 'TEST-123', refreshDate })).toBe(false)
    })

    it('should return true if dog has regNo and refreshDate older than 5 minutes', () => {
      const refreshDate = subMinutes(new Date(), 10)
      expect(shouldAllowRefresh({ regNo: 'TEST-123', refreshDate })).toBe(true)
    })

    it('should return false if dog has regNo but no refreshDate', () => {
      expect(shouldAllowRefresh({ regNo: 'TEST-123' })).toBe(false)
    })
  })

  describe('isValidDob', () => {
    it('should return false for undefined dob', () => {
      expect(isValidDob(undefined)).toBe(false)
    })

    it('should return false for KL empty date (year 0001)', () => {
      const emptyKlDate = new Date('0001-01-01T00:00:00')
      expect(isValidDob(emptyKlDate)).toBe(false)
    })

    it('should return true for valid dates', () => {
      expect(isValidDob(new Date('2020-01-01'))).toBe(true)
      expect(isValidDob(new Date('2010-05-15'))).toBe(true)
      expect(isValidDob(new Date('2024-12-31'))).toBe(true)
    })

    it('should return true for very old but valid dates (year > 1)', () => {
      expect(isValidDob(new Date('1990-01-01'))).toBe(true)
      expect(isValidDob(new Date('0002-01-01'))).toBe(true)
    })
  })

  describe('createDogUpdateFromFormValues', () => {
    it('should create a dog update object from form values', () => {
      const dob = new Date('2020-01-01')
      const formValues = {
        rfid: '123456789',
        name: 'Test Dog',
        titles: 'CH',
        dob,
        gender: 'M' as const,
        breedCode: '110' as const,
        sire: 'Sire Name',
        dam: 'Dam Name',
      }

      const result = createDogUpdateFromFormValues(formValues)

      expect(result).toEqual({
        rfid: '123456789',
        name: 'Test Dog',
        titles: 'CH',
        dob,
        gender: 'M',
        breedCode: '110',
        sire: { name: 'Sire Name' },
        dam: { name: 'Dam Name' },
      })
    })

    it('should handle empty gender and breedCode values', () => {
      const dob = new Date('2020-01-01')
      const formValues = {
        rfid: '123456789',
        name: 'Test Dog',
        titles: 'CH',
        dob,
        gender: '' as const,
        breedCode: '' as const,
        sire: 'Sire Name',
        dam: 'Dam Name',
      }

      const result = createDogUpdateFromFormValues(formValues)

      expect(result).toEqual({
        rfid: '123456789',
        name: 'Test Dog',
        titles: 'CH',
        dob,
        gender: undefined,
        breedCode: undefined,
        sire: { name: 'Sire Name' },
        dam: { name: 'Dam Name' },
      })
    })
  })
})
