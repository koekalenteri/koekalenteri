import type { Dog } from '../types'
import { addMonths, dayOf, TIME_ZONE } from '../lib/day'
import { eventWithStaticDates } from './events'

/** The day `months` months before the static event's first Finnish day: the dog's dates are days (KOE-1548). */
const monthsBeforeStart = (months: number) => addMonths(dayOf(eventWithStaticDates.startDate, TIME_ZONE), -months)

export const registrationDogAged10MonthsAndNoResults: Dog = {
  breedCode: '110',
  callingName: 'Test',
  dam: {
    name: 'Dam Name',
    titles: 'Dam titles',
  },
  dob: monthsBeforeStart(10),
  gender: 'M',
  name: 'Dog Name 10',
  refreshDate: eventWithStaticDates.entryStartDate,
  regNo: 'TESTDOG-0010',
  results: [],
  rfid: '1234567890123456',
  sire: {
    name: 'Sire Name',
    titles: 'Sire titles',
  },
  titles: 'Dog titles',
}

export const registrationDogAged20MonthsAndNoResults: Dog = {
  breedCode: '110',
  callingName: 'Test',
  dam: {
    name: 'Dam Name',
    titles: 'Dam titles',
  },
  dob: monthsBeforeStart(20),
  gender: 'M',
  name: 'Dog Name 20',
  refreshDate: eventWithStaticDates.entryStartDate,
  regNo: 'TESTDOG-0020',
  results: [],
  rfid: '1234567890123457',
  sire: {
    name: 'Sire Name',
    titles: 'Sire titles',
  },
  titles: 'Dog titles',
}

export const registrationDogAged28MonthsWithNOUResult: Dog = {
  breedCode: '110',
  callingName: 'Test',
  dam: {
    name: 'Dam Name',
    titles: 'Dam titles',
  },
  dob: monthsBeforeStart(28),
  gender: 'M',
  name: 'Dog Name 20',
  refreshDate: eventWithStaticDates.entryStartDate,
  regNo: 'TESTDOG-0030',
  results: [
    {
      class: '',
      date: monthsBeforeStart(1),
      judge: 'test judge',
      location: 'test location',
      result: 'NOU1',
      type: 'NOU',
    },
  ],
  rfid: '1234567890123457',
  sire: {
    name: 'Sire Name',
    titles: 'Sire titles',
  },
  titles: 'Dog titles',
}
