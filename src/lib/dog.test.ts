import type { BreedCode } from '../types'
import { subMinutes } from 'date-fns'
import { t } from 'i18next'
import { startOfFinnishDay } from '../test-utils/finnishDays'
import { describeInTimeZone } from '../test-utils/timeZone'
import { localDayOf } from './day'
import {
  breedAbbreviation,
  createDogUpdateFromFormValues,
  dogAgeInMonths,
  earliestResultDate,
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

  for (const zone of ['UTC', 'Europe/Helsinki', 'America/New_York', 'Asia/Tokyo']) {
    describeInTimeZone(zone, () => {
      const born = (stamp: string) => new Date(`${stamp}T00:00:00`)

      it('counts whole months from the day the birth date shows to the Finnish day of the trial', () => {
        expect(dogAgeInMonths(born('2025-12-28'), startOfFinnishDay('2026-09-28'))).toBe(9)
        expect(dogAgeInMonths(born('2025-12-28'), startOfFinnishDay('2026-09-27'))).toBe(8)
        expect(dogAgeInMonths(born('2026-01-01'), startOfFinnishDay('2026-09-30'))).toBe(8)
        expect(dogAgeInMonths(born('2026-09-29'), startOfFinnishDay('2026-09-28'))).toBe(-1)
      })

      it.each([
        ["Kennelliitto's empty date", () => born('0001-01-01')],
        ['an Invalid Date', () => new Date(Number.NaN)],
        ['a typed year 202', () => born('0202-12-28')],
      ])('has no age, and no earliest result date, for %s', (_name, dob) => {
        expect(dogAgeInMonths(dob(), startOfFinnishDay('2026-09-28'))).toBeUndefined()
        expect(earliestResultDate(dob())).toBeUndefined()
      })

      it('gives the latest birth date as the local midnight of the day', () => {
        const latest = latestDobForAge(startOfFinnishDay('2026-04-30'), 9)
        expect(localDayOf(latest)).toBe('2025-07-31')
        expect(latest.getHours()).toBe(0)
      })

      it('gives the earliest result date nine months after the day of birth, as a local midnight', () => {
        const earliest = earliestResultDate(born('2025-05-31'))
        expect(earliest && localDayOf(earliest)).toBe('2026-02-28')
        expect(earliest?.getHours()).toBe(0)
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

    it('should return false for KL empty date (year 0001)', () => {
      const emptyKlDate = new Date('0001-01-01T00:00:00')
      expect(isValidDob(emptyKlDate)).toBe(false)
    })

    it('reads the empty date as the API hands it to the form, through the typed boundary (KOE-1545)', () => {
      expect(isValidDob(toDog({ dob: '0001-01-01T00:00:00' }).dob)).toBe(false)
      expect(isValidDob(toDog({ dob: '0000-12-31T22:20:11.000Z' }).dob)).toBe(false)
      expect(isValidDob(toDog({ dob: '2020-06-01T00:00:00' }).dob)).toBe(true)
    })

    it('should return true for valid dates', () => {
      expect(isValidDob(new Date('2020-01-01T12:00:00.000Z'))).toBe(true)
      expect(isValidDob(new Date('2010-05-15T12:00:00.000Z'))).toBe(true)
      expect(isValidDob(new Date('2024-12-31T12:00:00.000Z'))).toBe(true)
    })

    it('reads an old birthday as valid and a year before the calendar as none, in any zone', () => {
      expect(isValidDob(new Date('1990-01-01T12:00:00.000Z'))).toBe(true)
      expect(isValidDob(new Date('0002-01-01T12:00:00.000Z'))).toBe(false)
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
      const dob = new Date('2020-01-01')
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
      const dob = new Date('2020-01-01')
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
