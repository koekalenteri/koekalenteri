import type { BreedCode } from '../types'
import { subMinutes } from 'date-fns'
import { t } from 'i18next'
import { beforeDayKeys, startOfFinnishDay } from '../test-utils/finnishDays'
import { describeInTimeZone } from '../test-utils/timeZone'
import {
  breedAbbreviation,
  createDogUpdateFromFormValues,
  dogAgeInMonths,
  earliestResultDay,
  formatDogName,
  isValidDob,
  latestDobForAge,
  MIN_RESULT_AGE_MONTHS,
  minDogAgeFor,
  shouldAllowRefresh,
} from './dog'
import { toDog } from './wire'

describe("the dog's age", () => {
  describe('minDogAgeFor', () => {
    it.each([
      ['NOU', 9],
      ['NOME-B', 0],
      ['NOWT', 0],
      ['NOME-A', 0],
      ['an unknown type', 0],
    ])('%s needs a dog of %i months', (eventType, months) => {
      expect(minDogAgeFor(eventType)).toBe(months)
    })
  })

  it('needs a result to be nine months after birth', () => {
    expect(MIN_RESULT_AGE_MONTHS).toBe(9)
  })

  // The birth date is a day key (KOE-1548), the trial's day its Finnish day: no host zone moves either.
  for (const zone of ['UTC', 'Europe/Helsinki', 'America/New_York', 'Asia/Tokyo']) {
    describeInTimeZone(zone, () => {
      it('counts whole months from the birth day to the Finnish day of the trial', () => {
        expect(dogAgeInMonths('2025-12-28', startOfFinnishDay('2026-09-28'))).toBe(9)
        expect(dogAgeInMonths('2025-12-28', startOfFinnishDay('2026-09-27'))).toBe(8)
        expect(dogAgeInMonths('2026-01-01', startOfFinnishDay('2026-09-30'))).toBe(8)
        expect(dogAgeInMonths('2026-09-29', startOfFinnishDay('2026-09-28'))).toBe(-1)
      })

      it('gives the latest birth day for an age on the Finnish day of the trial', () => {
        expect(latestDobForAge(startOfFinnishDay('2026-04-30'), 9)).toBe('2025-07-31')
      })

      it('gives the earliest result day nine months after the day of birth', () => {
        expect(earliestResultDay('2025-05-31')).toBe('2026-02-28')
      })
    })
  }
})

describe('dog utility functions', () => {
  describe('shouldAllowRefresh', () => {
    it('should return false if dog has no regNo', () => {
      expect(shouldAllowRefresh({})).toBe(false)
      expect(shouldAllowRefresh({ name: 'Test Dog' })).toBe(false)
    })

    it('should return false if dog was refreshed less than 5 minutes ago', () => {
      const refreshDate = subMinutes(new Date(), 3)
      expect(shouldAllowRefresh({ refreshDate, regNo: 'TEST-123' })).toBe(false)
    })

    it('should return true if dog has regNo and refreshDate older than 5 minutes', () => {
      const refreshDate = subMinutes(new Date(), 10)
      expect(shouldAllowRefresh({ refreshDate, regNo: 'TEST-123' })).toBe(true)
    })

    it('should return false if dog has regNo but no refreshDate', () => {
      expect(shouldAllowRefresh({ regNo: 'TEST-123' })).toBe(false)
    })
  })

  describe('isValidDob', () => {
    it('should return false for undefined dob', () => {
      expect(isValidDob(undefined)).toBe(false)
    })

    it('reads the empty date as the API hands it to the form, through the typed boundary (KOE-1545)', () => {
      expect(isValidDob(toDog({ dob: beforeDayKeys('0001-01-01T00:00:00') }).dob)).toBe(false)
      expect(isValidDob(toDog({ dob: beforeDayKeys('0000-12-31T22:20:11.000Z') }).dob)).toBe(false)
      expect(isValidDob(toDog({ dob: beforeDayKeys('2020-06-01T00:00:00') }).dob)).toBe(true)
    })

    it('should return true for a birth day', () => {
      expect(isValidDob('2020-01-01')).toBe(true)
      expect(isValidDob('1990-01-01')).toBe(true)
    })
  })

  describe('formatDogName', () => {
    it('joins trimmed titles and name', () => {
      expect(formatDogName({ name: ' Dog Name ', titles: ' CH ' })).toBe('CH Dog Name')
    })

    it('ignores a whitespace-only title', () => {
      expect(formatDogName({ name: 'Dog Name', titles: '  ' })).toBe('Dog Name')
    })
  })

  describe('breedAbbreviation', () => {
    it('returns the official abbreviation for a retriever breed', () => {
      expect(breedAbbreviation(t, '122', 'M')).toBe('lbu')
      expect(breedAbbreviation(t, '122', 'F')).toBe('lbn')
    })

    it('returns the SPKL abbreviation for a service dog breed', () => {
      expect(breedAbbreviation(t, '166', 'M')).toBe('sp')
      expect(breedAbbreviation(t, '15.3', 'F')).toBe('bpm')
      expect(breedAbbreviation(t, '181.2')).toBe('ss')
    })

    it('derives an abbreviation from the breed name for breeds without an official one', () => {
      expect(breedAbbreviation(t, '5', 'M')).toBe('coc')
      expect(breedAbbreviation(t, '5', 'F')).toBe('coc')
      expect(breedAbbreviation(t, '1', 'M')).toBe('poi')
    })

    it('derives an abbreviation when gender is not known', () => {
      expect(breedAbbreviation(t, '122')).toBe('lab')
      expect(breedAbbreviation(t, '5')).toBe('coc')
    })

    it('falls back to the breed code for an unknown breed', () => {
      // Deliberately outside the BreedCode union: an unknown code must fall through as-is
      expect(breedAbbreviation(t, '99999' as unknown as BreedCode)).toBe('99999')
    })

    it('returns an empty string without a breed code', () => {
      expect(breedAbbreviation(t)).toBe('')
    })
  })

  describe('createDogUpdateFromFormValues', () => {
    it('should create a dog update object from form values', () => {
      const dob = '2020-01-01' as const
      const formValues = {
        breedCode: '110' as const,
        dam: 'Dam Name',
        dob,
        gender: 'M' as const,
        name: 'Test Dog',
        rfid: '123456789',
        sire: 'Sire Name',
        titles: 'CH',
      }

      const result = createDogUpdateFromFormValues(formValues)

      expect(result).toEqual({
        breedCode: '110',
        dam: { name: 'Dam Name' },
        dob,
        gender: 'M',
        name: 'Test Dog',
        rfid: '123456789',
        sire: { name: 'Sire Name' },
        titles: 'CH',
      })
    })

    it('should handle empty gender and breedCode values', () => {
      const dob = '2020-01-01' as const
      const formValues = {
        breedCode: '' as const,
        dam: 'Dam Name',
        dob,
        gender: '' as const,
        name: 'Test Dog',
        rfid: '123456789',
        sire: 'Sire Name',
        titles: 'CH',
      }

      const result = createDogUpdateFromFormValues(formValues)

      expect(result).toEqual({
        breedCode: undefined,
        dam: { name: 'Dam Name' },
        dob,
        gender: undefined,
        name: 'Test Dog',
        rfid: '123456789',
        sire: { name: 'Sire Name' },
        titles: 'CH',
      })
    })
  })
})
