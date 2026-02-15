import type { Dog } from '../types'
import { subMonths } from 'date-fns'
import { eventWithStaticDates } from './events'

export const registrationDogAged10MonthsAndNoResults: Dog = {
  breedCode: '110',
  callingName: 'Test',
  dam: {
    name: 'Dam Name',
    titles: 'Dam titles',
  },
  dob: subMonths(eventWithStaticDates.startDate, 10),
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
  dob: subMonths(eventWithStaticDates.startDate, 20),
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
  dob: subMonths(eventWithStaticDates.startDate, 28),
  gender: 'M',
  name: 'Dog Name 20',
  refreshDate: eventWithStaticDates.entryStartDate,
  regNo: 'TESTDOG-0030',
  results: [
    {
      class: '',
      date: subMonths(eventWithStaticDates.startDate, 1),
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
